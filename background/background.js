/* Context menus, badge, Crossref lookup and LibGen tab handling. */
(function () {
  "use strict";

  const I = globalThis.LibGenIsbn;
  const D = globalThis.LibGenDoi;
  const G = globalThis.LibGen;
  const S = globalThis.LibGenSettings;
  const MENU = {
    link: "libgen-search-link",
    selectionId: "libgen-search-selection-id",
    selectionText: "libgen-search-selection-text",
    page: "libgen-search-page"
  };
  const BADGE_COLOR = "#238636";
  const BOOK_ICON = { 16: "icons/icon-16.png", 32: "icons/icon-32.png" };
  const CROSSREF_TIMEOUT_MS = 6000;
  const BOOK_TYPES = new Set(["book", "monograph", "edited-book", "book-chapter", "book-section", "reference-book"]);
  const knownQueries = new Map();
  const i18n = (key, substitutions) => browser.i18n.getMessage(key, substitutions) || key;

  let settingsCache = null;
  async function settings() {
    if (!settingsCache) settingsCache = await S.get();
    return settingsCache;
  }

  function validQuery(value) {
    return value && ["isbn", "doi", "text"].includes(value.kind) && typeof value.value === "string" && value.value.trim();
  }

  function queryFromValue(value, allowText) {
    const isbn = I.normalizeIsbn(value) || I.extractAllIsbns(value)[0];
    if (isbn) return { kind: "isbn", value: isbn };
    const doi = D.extractDoi(value);
    if (doi) {
      const fromDoi = I.isbnFromDoi(doi);
      return { kind: fromDoi ? "isbn" : "doi", value: fromDoi || doi };
    }
    const text = String(value || "").replace(/\s+/g, " ").trim().slice(0, 200);
    return allowText && text ? { kind: "text", value: text } : null;
  }

  async function clearBadge(tabId) {
    try {
      await browser.browserAction.setBadgeText({ text: "", tabId });
      await browser.browserAction.setTitle({ title: null, tabId });
    } catch (e) { /* tab closed */ }
  }

  async function setBadge(tabId, query) {
    const current = await settings();
    if (!current.showBadge || !validQuery(query)) return clearBadge(tabId);
    const text = query.kind === "text" ? "BOOK" : query.kind.toUpperCase();
    try {
      await browser.browserAction.setBadgeText({ text, tabId });
      await browser.browserAction.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
      await browser.browserAction.setTitle({ title: i18n("extName") + "\n" + query.value, tabId });
    } catch (e) { /* tab closed */ }
  }

  async function updatePageAction(tabId, query) {
    try {
      if (validQuery(query)) {
        await browser.pageAction.setIcon({ path: BOOK_ICON, tabId });
        await browser.pageAction.setTitle({ title: i18n("actionTitle") + "\n" + query.value, tabId });
        await browser.pageAction.show(tabId);
      } else await browser.pageAction.hide(tabId);
    } catch (e) { /* tab closed */ }
  }

  async function openUrl(url, openerTab, options) {
    const opts = options || {};
    if (opts.openIn === "currentTab" && openerTab && openerTab.id !== undefined) {
      try { return await browser.tabs.update(openerTab.id, { url }); } catch (e) { /* new tab fallback */ }
    }
    const props = { url, active: opts.active !== false };
    if (openerTab && openerTab.id !== undefined && openerTab.id !== browser.tabs.TAB_ID_NONE) {
      props.openerTabId = openerTab.id;
      props.index = opts.index !== undefined ? opts.index : openerTab.index + 1;
      if (openerTab.windowId !== undefined) props.windowId = openerTab.windowId;
    }
    try { return await browser.tabs.create(props); }
    catch (e) { return browser.tabs.create({ url, active: props.active }); }
  }

  async function resolveViaCrossref(doi) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CROSSREF_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.crossref.org/works/" + encodeURIComponent(doi), {
        credentials: "omit", cache: "no-store", signal: controller.signal
      });
      if (!response.ok) return null;
      const payload = await response.json();
      const message = payload && payload.message;
      if (!message || !BOOK_TYPES.has(String(message.type || "").toLowerCase())) return null;
      for (const raw of Array.isArray(message.ISBN) ? message.ISBN : []) {
        const isbn = I.normalizeIsbn(raw);
        if (isbn) return isbn;
      }
    } catch (e) {
      console.info("LibGen Book Finder: Crossref lookup failed for", doi, e.message);
    } finally { clearTimeout(timer); }
    return null;
  }

  async function resolvedQuery(query) {
    if (query.kind !== "doi") return query;
    const embedded = I.isbnFromDoi(query.value);
    if (embedded) return { kind: "isbn", value: embedded };
    const current = await settings();
    if (!current.useCrossref) return query;
    const isbn = await resolveViaCrossref(query.value);
    return isbn ? { kind: "isbn", value: isbn } : query;
  }

  async function openQuery(query, openerTab, options) {
    if (!validQuery(query)) return null;
    const current = await settings();
    const resolved = await resolvedQuery({ kind: query.kind, value: query.value.trim() });
    const mirror = S.activeMirror(current);
    const url = G.buildSearchUrl(mirror.base, mirror.family, resolved);
    return openUrl(url, openerTab, Object.assign({ openIn: current.openIn }, options));
  }

  async function queryForTab(tab) {
    if (!tab) return { primary: null };
    try {
      const response = await browser.tabs.sendMessage(tab.id, { type: "getQuery" });
      if (response) return response;
    } catch (e) { /* restricted page */ }
    const query = queryFromValue(tab.url || "", false);
    return { primary: query };
  }

  async function openForTab(tab) {
    const result = await queryForTab(tab);
    if (result.primary) return openQuery(result.primary, tab);
    return null;
  }

  async function activeTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  function queryFromLink(info) {
    const isbn = I.extractIsbnFromUrl(info.linkUrl || "");
    if (isbn) return { kind: "isbn", value: isbn };
    const doi = D.extractDoiFromUrl(info.linkUrl || "") || D.extractDoi(info.linkText || "");
    if (!doi) return null;
    const fromDoi = I.isbnFromDoi(doi);
    return { kind: fromDoi ? "isbn" : "doi", value: fromDoi || doi };
  }

  function queryFromSelection(info, allowText) { return queryFromValue(info.selectionText || "", allowText); }

  async function buildMenus() {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: MENU.link, title: i18n("menuSearchLink"), contexts: ["link"] });
    browser.contextMenus.create({ id: MENU.selectionId, title: i18n("menuSearchSelectionId"), contexts: ["selection"] });
    browser.contextMenus.create({ id: MENU.selectionText, title: i18n("menuSearchSelectionText"), contexts: ["selection"] });
    browser.contextMenus.create({ id: MENU.page, title: i18n("menuSearchPage"), contexts: ["page", "browser_action"] });
  }

  if (browser.contextMenus.onShown && browser.contextMenus.refresh) {
    browser.contextMenus.onShown.addListener(async (info, tab) => {
      const selectedId = queryFromSelection(info, false);
      const selectedText = !selectedId && queryFromSelection(info, true);
      const known = tab && knownQueries.get(tab.id);
      try {
        await Promise.all([
          browser.contextMenus.update(MENU.link, { visible: !!queryFromLink(info) }),
          browser.contextMenus.update(MENU.selectionId, { visible: !!selectedId }),
          browser.contextMenus.update(MENU.selectionText, { visible: !!selectedText }),
          browser.contextMenus.update(MENU.page, { visible: !!known })
        ]);
        await browser.contextMenus.refresh();
      } catch (e) { /* menu closed */ }
    });
  }

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
      if (String(info.menuItemId) === MENU.link) await openQuery(queryFromLink(info), tab);
      else if (String(info.menuItemId) === MENU.selectionId) await openQuery(queryFromSelection(info, false), tab);
      else if (String(info.menuItemId) === MENU.selectionText) await openQuery(queryFromSelection(info, true), tab);
      else if (String(info.menuItemId) === MENU.page) await openForTab(tab || await activeTab());
    } catch (e) { console.error("LibGen Book Finder:", e); }
  });

  browser.pageAction.onClicked.addListener((tab) => openForTab(tab).catch(console.error));
  browser.commands.onCommand.addListener(async (command) => {
    if (command === "search-in-libgen") {
      const tab = await activeTab();
      if (tab) openForTab(tab).catch(console.error);
    }
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    if (!message) return undefined;
    if (message.type === "queryFound" && sender.tab) {
      const query = validQuery(message.primary) ? message.primary : null;
      if (query) knownQueries.set(sender.tab.id, query);
      else knownQueries.delete(sender.tab.id);
      return Promise.all([setBadge(sender.tab.id, query), updatePageAction(sender.tab.id, query)]);
    }
    if (message.type === "openQuery" && validQuery(message.query)) return activeTab().then((tab) => openQuery(message.query, tab));
    if (message.type === "getTabQuery") return activeTab().then(queryForTab);
    return undefined;
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") {
      knownQueries.delete(tabId);
      clearBadge(tabId);
      updatePageAction(tabId, null);
    }
  }, { properties: ["status"] });
  browser.tabs.onRemoved.addListener((tabId) => knownQueries.delete(tabId));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    settingsCache = null;
    if (changes.showBadge) {
      for (const [tabId, query] of knownQueries) setBadge(tabId, query);
    }
  });

  buildMenus().catch(console.error);
})();
