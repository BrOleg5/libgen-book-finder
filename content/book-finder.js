/* Finds ISBNs, DOIs and book titles on the current page. */
(function () {
  "use strict";

  if (window.__libGenBookFinderLoaded) return;
  window.__libGenBookFinderLoaded = true;

  const I = globalThis.LibGenIsbn;
  const D = globalThis.LibGenDoi;
  const ISBN_META = ["citation_isbn", "books:isbn", "product:isbn", "og:isbn", "isbn", "dc.identifier", "dcterms.identifier"];
  const DOI_META = [
    "citation_doi", "dc.identifier", "dc.identifier.doi", "dcterms.identifier",
    "prism.doi", "bepress_citation_doi", "citation_pdf_url",
    "citation_fulltext_html_url", "citation_abstract_html_url", "og:url"
  ];
  const DOI_JSON_KEYS = ["doi", "DOI", "identifier", "@id", "sameAs", "url", "mainEntityOfPage"];
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TEMPLATE", "SVG"]);
  const TITLE_SELECTORS = "h1, h2, h3, h4, h5, h6, [itemprop='name'], [itemprop='headline'], [class*='title' i], [class*='heading' i]";
  const MAX_TEXT_NODES = 50000;

  function pushIsbn(list, raw) { I.pushUnique(list, raw); }
  function pushDoi(list, raw) { D.pushUnique(list, raw); }

  function metaValues(name) {
    return document.querySelectorAll('meta[name="' + name + '" i], meta[property="' + name + '" i]');
  }

  function metadataIsbns() {
    const out = [];
    for (const name of ISBN_META) {
      for (const el of metaValues(name)) {
        for (const isbn of I.extractAllIsbns(el.content)) pushIsbn(out, isbn);
        pushIsbn(out, el.content);
      }
    }
    for (const el of document.querySelectorAll("[itemprop='isbn' i]")) {
      pushIsbn(out, el.getAttribute("content") || el.textContent);
    }
    return out;
  }

  function metadataDois() {
    const out = [];
    for (const name of DOI_META) {
      for (const el of metaValues(name)) pushDoi(out, D.extractDoi(el.content));
    }
    return out;
  }

  function typeNames(value) {
    const raw = value && value["@type"];
    return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((v) => String(v).toLowerCase());
  }

  function walkJsonLd(value, state, depth) {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) walkJsonLd(item, state, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const types = typeNames(value);
    if (types.some((type) => type === "book" || type === "chapter" || type.endsWith(":book") || type.endsWith(":chapter"))) {
      state.isBookPage = true;
      if (!state.title && typeof value.name === "string") state.title = value.name;
    }
    if (types.some((type) => type === "scholarlyarticle" || type.endsWith(":scholarlyarticle"))) state.isArticlePage = true;
    const isbnValues = Array.isArray(value.isbn) ? value.isbn : [value.isbn];
    for (const raw of isbnValues) {
      if (typeof raw === "string") {
        for (const isbn of I.extractAllIsbns(raw)) pushIsbn(state.isbns, isbn);
        pushIsbn(state.isbns, raw);
      }
    }
    for (const key of DOI_JSON_KEYS) {
      const raw = value[key];
      if (typeof raw === "string") pushDoi(state.dois, D.extractDoi(raw));
      else if (raw && typeof raw === "object") walkJsonLd(raw, state, depth + 1);
    }
    for (const key of ["@graph", "mainEntity", "isPartOf", "citation", "hasPart", "itemListElement"]) {
      if (value[key]) walkJsonLd(value[key], state, depth + 1);
    }
  }

  function jsonLdData() {
    const state = { isbns: [], dois: [], isBookPage: false, isArticlePage: false, title: "" };
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { walkJsonLd(JSON.parse(el.textContent), state, 0); }
      catch (e) {
        for (const isbn of I.extractAllIsbns(el.textContent)) pushIsbn(state.isbns, isbn);
        for (const doi of D.extractAllDois(el.textContent)) pushDoi(state.dois, doi);
      }
    }
    return state;
  }

  function urlData() {
    const isbns = [];
    const dois = [];
    const canonical = document.querySelector('link[rel="canonical"][href]');
    for (const url of [canonical && canonical.href, location.href]) {
      if (!url) continue;
      pushIsbn(isbns, I.extractIsbnFromUrl(url));
      pushDoi(dois, D.extractDoiFromUrl(url));
    }
    return { isbns, dois };
  }

  function keyOf(query) { return query.kind + ":" + query.value.toLowerCase(); }

  function remember(items, anchors, query, element) {
    if (!query || !query.value) return;
    const key = keyOf(query);
    if (!items.some((item) => keyOf(item) === key)) items.push(query);
    if (element && !anchors.has(key)) anchors.set(key, element);
  }

  function scanLinks(items, anchors) {
    for (const anchor of document.querySelectorAll("a[href]")) {
      const isbn = I.extractIsbnFromUrl(anchor.href) || I.extractAllIsbns(anchor.textContent)[0];
      if (isbn) remember(items, anchors, { kind: "isbn", value: isbn }, anchor);
      const doi = D.extractDoiFromUrl(anchor.href) || D.extractDoiFromText(anchor.textContent);
      if (doi) {
        const fromDoi = I.isbnFromDoi(doi);
        remember(items, anchors, { kind: fromDoi ? "isbn" : "doi", value: fromDoi || doi }, anchor);
      }
    }
  }

  function scanText(items, anchors) {
    const root = document.body || document.documentElement;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentNode;
        if (!parent || SKIP_TAGS.has(parent.nodeName.toUpperCase())) return NodeFilter.FILTER_REJECT;
        return /ISBN|97[89]|10\./i.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    let node;
    let visited = 0;
    while ((node = walker.nextNode()) && visited++ < MAX_TEXT_NODES) {
      for (const isbn of I.extractAllIsbns(node.nodeValue)) remember(items, anchors, { kind: "isbn", value: isbn }, node.parentElement);
      for (const doi of D.extractAllDois(node.nodeValue)) {
        const fromDoi = I.isbnFromDoi(doi);
        remember(items, anchors, { kind: fromDoi ? "isbn" : "doi", value: fromDoi || doi }, node.parentElement);
      }
    }
  }

  function pageTitle(jsonLd) {
    const citation = document.querySelector('meta[name="citation_title" i]');
    const og = document.querySelector('meta[property="og:title" i]');
    return D.cleanTitle(
      (citation && citation.content) || jsonLd.title || (og && og.content) || document.title || ""
    ).slice(0, 300);
  }

  function bookPage(jsonLd, metadataIsbnList) {
    const og = document.querySelector('meta[property="og:type" i]');
    const type = (og && og.content || "").toLowerCase();
    return metadataIsbnList.length > 0 || jsonLd.isBookPage || type === "book" || type === "books.book";
  }

  function containerFor(anchor, query) {
    let element = anchor;
    for (let depth = 0; element && depth < 6; depth++) {
      const parent = element.parentElement;
      if (!parent || parent === document.body || (parent.textContent || "").length > 4000) break;
      let occurrences = 0;
      if (query.kind === "isbn") occurrences = I.extractAllIsbns(parent.textContent).length;
      else occurrences = D.extractAllDois(parent.textContent).length;
      if (occurrences > 1) break;
      element = parent;
    }
    return element || anchor;
  }

  function titleFor(anchor, query) {
    if (!anchor) return "";
    if (anchor.matches && anchor.matches("a")) {
      const own = D.cleanTitle(anchor.textContent, query.value);
      if (own.length >= 12 && own.length <= 300) return own;
    }
    const container = containerFor(anchor, query);
    for (const element of container.querySelectorAll(TITLE_SELECTORS)) {
      const title = D.cleanTitle(element.textContent, query.value);
      if (title.length >= 8) return title.slice(0, 300);
    }
    const plain = D.cleanTitle(container.textContent, query.value);
    return plain.length >= 8 && plain.length <= 600 ? plain.slice(0, 300) : "";
  }

  function findQueries(options) {
    const metaIsbns = metadataIsbns();
    const metaDois = metadataDois();
    const jsonLd = jsonLdData();
    for (const isbn of jsonLd.isbns) pushIsbn(metaIsbns, isbn);
    for (const doi of jsonLd.dois) pushDoi(metaDois, doi);
    const urls = urlData();
    const pageItems = [];
    const anchors = new Map();
    scanLinks(pageItems, anchors);
    scanText(pageItems, anchors);
    const pageIsbns = pageItems.filter((q) => q.kind === "isbn").map((q) => q.value);
    const pageDois = pageItems.filter((q) => q.kind === "doi").map((q) => q.value);
    const title = pageTitle(jsonLd);
    const isBookPage = bookPage(jsonLd, metaIsbns);
    const selected = I.choosePrimaryQuery({
      metadataIsbns: metaIsbns, urlIsbns: urls.isbns,
      metadataDois: metaDois, urlDois: urls.dois,
      pageIsbns, pageDois, isBookPage, title
    });
    const all = [];
    const add = (q) => { if (q && !all.some((item) => keyOf(item) === keyOf(q))) all.push(q); };
    for (const isbn of metaIsbns.concat(urls.isbns)) add({ kind: "isbn", value: isbn });
    for (const doi of metaDois.concat(urls.dois)) {
      const fromDoi = I.isbnFromDoi(doi);
      add({ kind: fromDoi ? "isbn" : "doi", value: fromDoi || doi });
    }
    for (const item of pageItems) add(item);
    if (selected.primary && selected.primary.kind === "text") add(selected.primary);
    const result = { primary: selected.primary, all, count: all.length, isBookPage, source: selected.source };
    if (options && options.withTitles) {
      result.items = all
        .filter((q) => q.kind !== "text")
        .map((q) => ({ kind: q.kind, value: q.value, title: titleFor(anchors.get(keyOf(q)), q) }));
    }
    return result;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === "getQuery") return Promise.resolve(findQueries({ withTitles: !!message.withTitles }));
    return undefined;
  });

  let lastReported = "";
  function report() {
    let result;
    try { result = findQueries(); } catch (e) { return; }
    const primary = result.primary ? keyOf(result.primary) : "";
    const signature = primary + "|" + result.count;
    if (signature === lastReported) return;
    lastReported = signature;
    browser.runtime.sendMessage({ type: "queryFound", primary: result.primary, count: result.count }).catch(() => {});
  }

  report();
  setTimeout(report, 3000);
  let lastHref = location.href;
  window.addEventListener("popstate", () => setTimeout(report, 500));
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      setTimeout(report, 800);
    }
  }, 1500);
})();
