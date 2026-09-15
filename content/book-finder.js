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

  function remember(items, query) {
    if (!query || !query.value) return;
    const key = keyOf(query);
    if (!items.some((item) => keyOf(item) === key)) items.push(query);
  }

  function scanLinks(items) {
    for (const anchor of document.querySelectorAll("a[href]")) {
      const isbn = I.extractIsbnFromUrl(anchor.href) || I.extractAllIsbns(anchor.textContent)[0];
      if (isbn) remember(items, { kind: "isbn", value: isbn });
      const doi = D.extractDoiFromUrl(anchor.href) || D.extractDoiFromText(anchor.textContent);
      if (doi) {
        const fromDoi = I.isbnFromDoi(doi);
        remember(items, { kind: fromDoi ? "isbn" : "doi", value: fromDoi || doi });
      }
    }
  }

  function scanText(items) {
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
      for (const isbn of I.extractAllIsbns(node.nodeValue)) remember(items, { kind: "isbn", value: isbn });
      for (const doi of D.extractAllDois(node.nodeValue)) {
        const fromDoi = I.isbnFromDoi(doi);
        remember(items, { kind: fromDoi ? "isbn" : "doi", value: fromDoi || doi });
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

  function findQuery() {
    const metaIsbns = metadataIsbns();
    const metaDois = metadataDois();
    const jsonLd = jsonLdData();
    for (const isbn of jsonLd.isbns) pushIsbn(metaIsbns, isbn);
    for (const doi of jsonLd.dois) pushDoi(metaDois, doi);
    const urls = urlData();
    const pageItems = [];
    scanLinks(pageItems);
    scanText(pageItems);
    const pageIsbns = pageItems.filter((q) => q.kind === "isbn").map((q) => q.value);
    const pageDois = pageItems.filter((q) => q.kind === "doi").map((q) => q.value);
    const title = pageTitle(jsonLd);
    const isBookPage = bookPage(jsonLd, metaIsbns);
    const selected = I.choosePrimaryQuery({
      metadataIsbns: metaIsbns, urlIsbns: urls.isbns,
      metadataDois: metaDois, urlDois: urls.dois,
      pageIsbns, pageDois, isBookPage, title
    });
    return { primary: selected.primary, isBookPage, source: selected.source };
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === "getQuery") return Promise.resolve(findQuery());
    return undefined;
  });

  let lastReported = null;
  function report() {
    let result;
    try { result = findQuery(); } catch (e) { return; }
    const primary = result.primary ? keyOf(result.primary) : "";
    if (primary === lastReported) return;
    lastReported = primary;
    browser.runtime.sendMessage({ type: "queryFound", primary: result.primary }).catch(() => {});
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
