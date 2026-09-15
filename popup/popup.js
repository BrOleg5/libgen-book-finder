(function () {
  "use strict";

  const I = globalThis.LibGenIsbn;
  const D = globalThis.LibGenDoi;
  const S = globalThis.LibGenSettings;
  const i18n = (key, substitutions) => browser.i18n.getMessage(key, substitutions) || "";
  const $ = (id) => document.getElementById(id);

  for (const element of document.querySelectorAll("[data-i18n]")) {
    const text = i18n(element.dataset.i18n);
    if (text) element.textContent = text;
  }

  let savedTimer;
  function flashSaved() {
    $("saved").classList.add("visible");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => $("saved").classList.remove("visible"), 1200);
  }
  async function save(patch) { await S.set(patch); flashSaved(); }

  function queryFromInput() {
    const raw = $("query").value.trim();
    const isbn = I.normalizeIsbn(raw) || I.extractAllIsbns(raw)[0];
    if (isbn) return { kind: "isbn", value: isbn };
    const doi = D.extractDoi(raw);
    if (doi) {
      const fromDoi = I.isbnFromDoi(doi);
      return { kind: fromDoi ? "isbn" : "doi", value: fromDoi || doi };
    }
    return raw ? { kind: "text", value: raw } : null;
  }

  function updateKind() {
    const query = queryFromInput();
    $("query-kind").textContent = query ? query.kind.toUpperCase() : "TEXT";
  }

  async function openTyped() {
    const query = queryFromInput();
    if (!query) return $("query").focus();
    await browser.runtime.sendMessage({ type: "openQuery", query });
    window.close();
  }

  async function loadTabQuery() {
    let result = { primary: null };
    try { result = await browser.runtime.sendMessage({ type: "getTabQuery" }) || result; }
    catch (e) { /* background unavailable */ }
    $("open").disabled = false;
    if (result.primary) {
      $("query").value = result.primary.value;
      updateKind();
    } else $("query").placeholder = i18n("popupNoQuery");
  }

  $("open").addEventListener("click", () => openTyped().catch(console.error));
  $("query").addEventListener("input", updateKind);
  $("query").addEventListener("keydown", (event) => {
    if (event.key === "Enter") openTyped().catch(console.error);
  });

  function mirrorLine(mirror) { return mirror.host + " " + mirror.family; }

  function renderMirrors(current) {
    const list = $("mirror-list");
    list.textContent = "";
    for (const mirror of current.mirrors) {
      const label = document.createElement("label");
      label.className = "mirror-row";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "mirror";
      radio.value = mirror.host;
      radio.checked = current.mirror === mirror.host;
      radio.addEventListener("change", () => save({ mirror: mirror.host }));
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = mirror.host + " · " + mirror.family;
      const status = document.createElement("span");
      status.className = "status";
      status.id = "status-" + mirror.host.replace(/[^a-z0-9]/gi, "-");
      label.append(radio, name, status);
      list.append(label);
    }
    $("mirror-custom").checked = current.mirror === S.CUSTOM;
    $("custom-mirror").value = current.customMirror || "";
    $("custom-family").value = current.customFamily;
    $("mirrors-text").value = current.mirrors.map(mirrorLine).join("\n");
  }

  $("mirror-custom").addEventListener("change", () => {
    if ($("mirror-custom").checked) save({ mirror: S.CUSTOM });
  });
  $("custom-family").addEventListener("change", () => save({ customFamily: $("custom-family").value }));
  let customTimer;
  $("custom-mirror").addEventListener("input", () => {
    clearTimeout(customTimer);
    customTimer = setTimeout(() => {
      const value = $("custom-mirror").value.trim();
      const patch = { customMirror: value };
      if (value) { patch.mirror = S.CUSTOM; $("mirror-custom").checked = true; }
      save(patch).catch(console.error);
    }, 400);
  });

  async function saveMirrorList(mirrors) {
    const current = await S.get();
    const patch = { mirrors };
    if (current.mirror !== S.CUSTOM && !mirrors.some((m) => m.host === current.mirror)) patch.mirror = mirrors[0].host;
    await save(patch);
  }
  $("save-mirrors").addEventListener("click", () => {
    saveMirrorList(S.sanitizeMirrorList($("mirrors-text").value.split(/\r?\n/))).catch(console.error);
  });
  $("reset-mirrors").addEventListener("click", () => {
    saveMirrorList(S.DEFAULT_MIRRORS.map((m) => ({ ...m }))).catch(console.error);
  });

  async function probe(base) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const started = performance.now();
    try {
      const response = await fetch(base + "/", { cache: "no-store", credentials: "omit", redirect: "follow", signal: controller.signal });
      return { ok: response.ok, status: response.status, ms: Math.round(performance.now() - started) };
    } catch (e) { return { ok: false, status: e.name === "AbortError" ? "timeout" : "error" }; }
    finally { clearTimeout(timer); }
  }

  function setStatus(element, result) {
    if (!element) return;
    element.classList.remove("ok", "fail");
    if (!result) return void (element.textContent = "…");
    element.classList.add(result.ok ? "ok" : "fail");
    element.textContent = result.ok ? "✓ " + result.ms + " ms" : "✕ " + (result.status === "timeout" ? i18n("optTimeoutShort") : result.status);
  }

  $("check-mirrors").addEventListener("click", async () => {
    $("check-mirrors").disabled = true;
    $("check-note").textContent = i18n("optChecking");
    const current = await S.get();
    const targets = current.mirrors.map((m) => ({
      element: $("status-" + m.host.replace(/[^a-z0-9]/gi, "-")), base: S.normalizeMirror(m.host)
    }));
    const custom = S.normalizeMirror(current.customMirror);
    if (custom) targets.push({ element: $("status-custom"), base: custom });
    for (const target of targets) setStatus(target.element, null);
    await Promise.all(targets.map(async (target) => setStatus(target.element, await probe(target.base))));
    $("check-note").textContent = i18n("optCheckDone");
    $("check-mirrors").disabled = false;
  });

  $("open-in").addEventListener("change", () => save({ openIn: $("open-in").value }));
  $("show-badge").addEventListener("change", () => save({ showBadge: $("show-badge").checked }));
  $("use-crossref").addEventListener("change", () => save({ useCrossref: $("use-crossref").checked }));

  async function load() {
    const current = await S.get();
    renderMirrors(current);
    $("open-in").value = current.openIn;
    $("show-badge").checked = !!current.showBadge;
    $("use-crossref").checked = !!current.useCrossref;
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.mirrors || changes.mirror || changes.customMirror || changes.customFamily)) {
      if (document.activeElement !== $("custom-mirror")) load().catch(console.error);
    }
  });
  $("open").disabled = true;
  updateKind();
  load().catch(console.error);
  loadTabQuery().catch(console.error);
})();
