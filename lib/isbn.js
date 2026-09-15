/* ISBN validation, extraction and query selection. */
(function (root) {
  "use strict";

  const ISBN_SOURCE = "(?:97[89][-\\s]?)?(?:\\d[-\\s]?){9}[\\dXx]";
  const ISBN_RE = new RegExp("(?:^|[^0-9])(" + ISBN_SOURCE + ")(?=$|[^0-9])", "g");
  const INVISIBLE_RE = /[\u00a0\u200b\u200e\u200f\ufeff]/g;

  function digits(raw) {
    return String(raw || "").replace(INVISIBLE_RE, " ").replace(/[-\s]/g, "").toUpperCase();
  }

  function valid10(value) {
    if (!/^\d{9}[\dX]$/.test(value)) return false;
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (10 - i) * (value[i] === "X" ? 10 : Number(value[i]));
    return sum % 11 === 0;
  }

  function valid13(value) {
    if (!/^97[89]\d{10}$/.test(value)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(value[12]);
  }

  function to13(value) {
    const body = "978" + value.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 ? 3 : 1);
    return body + ((10 - (sum % 10)) % 10);
  }

  function normalizeIsbn(raw) {
    const value = digits(raw);
    if (valid13(value)) return value;
    if (valid10(value)) return to13(value);
    return null;
  }

  function pushUnique(list, value) {
    const isbn = normalizeIsbn(value);
    if (isbn && !list.includes(isbn)) list.push(isbn);
  }

  function cleanText(text) { return String(text || "").replace(INVISIBLE_RE, " "); }

  function extractAllIsbns(text) {
    const source = cleanText(text);
    const out = [];
    const labelled = /ISBN(?:-1[03])?\s*[:：]?\s*((?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx])(?=$|[^\d])/gi;
    let match;
    while ((match = labelled.exec(source)) !== null) pushUnique(out, match[1]);
    const bare13 = /(?:^|[^\d])((?:97[89][-\s]?)(?:\d[-\s]?){9}[\dXx])(?=$|[^\d])/g;
    while ((match = bare13.exec(source)) !== null) pushUnique(out, match[1]);
    return out;
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (e) { return value; }
  }

  function extractIsbnFromUrl(url) {
    if (!url) return null;
    let parsed;
    try { parsed = new URL(url); } catch (e) { return extractAllIsbns(safeDecode(url))[0] || null; }
    const path = safeDecode(parsed.pathname);
    const known = path.match(/\/(?:dp|gp\/product|isbn)\/([^/?#]+)/i);
    if (known) {
      const isbn = normalizeIsbn(known[1]);
      if (isbn) return isbn;
    }
    for (const [key, value] of parsed.searchParams) {
      if (/isbn/i.test(key) || /^vid$/i.test(key)) {
        const direct = normalizeIsbn(value.replace(/^ISBN/i, ""));
        if (direct) return direct;
        const found = extractAllIsbns(value);
        if (found.length) return found[0];
      }
    }
    for (const segment of path.split("/")) {
      const isbn = normalizeIsbn(segment);
      if (isbn) return isbn;
    }
    return extractAllIsbns(path)[0] || null;
  }

  function isbnFromDoi(doi) {
    const source = safeDecode(String(doi || ""));
    const re = /97[89](?:[-._/]?\d){10}(?!\d)/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      const isbn = normalizeIsbn(match[0].replace(/[._/]/g, "-"));
      if (isbn) return isbn;
    }
    return null;
  }

  function query(kind, value) { return value ? { kind, value } : null; }

  function choosePrimaryQuery(input) {
    const data = input || {};
    const metadataIsbns = data.metadataIsbns || [];
    const urlIsbns = data.urlIsbns || [];
    const metadataDois = data.metadataDois || [];
    const urlDois = data.urlDois || [];
    const pageIsbns = data.pageIsbns || [];
    const pageDois = data.pageDois || [];
    const trustedIsbn = metadataIsbns[0] || urlIsbns[0];
    if (trustedIsbn) return { primary: query("isbn", trustedIsbn), source: metadataIsbns.length ? "metadata" : "url" };
    const trustedDoi = metadataDois[0] || urlDois[0];
    if (trustedDoi) {
      const isbn = isbnFromDoi(trustedDoi);
      return { primary: query(isbn ? "isbn" : "doi", isbn || trustedDoi), source: metadataDois.length ? "metadata" : "url" };
    }
    if (pageIsbns.length === 1) return { primary: query("isbn", pageIsbns[0]), source: "page" };
    if (pageIsbns.length > 1) return { primary: null, source: "multiple" };
    if (pageDois.length === 1) {
      const isbn = isbnFromDoi(pageDois[0]);
      return { primary: query(isbn ? "isbn" : "doi", isbn || pageDois[0]), source: "page" };
    }
    if (pageDois.length > 1) return { primary: null, source: "multiple" };
    if (data.isBookPage && data.title) return { primary: query("text", data.title), source: "title" };
    return { primary: null, source: null };
  }

  root.LibGenIsbn = {
    ISBN_RE, normalizeIsbn, extractAllIsbns, extractIsbnFromUrl,
    isbnFromDoi, choosePrimaryQuery, pushUnique, cleanText
  };
})(globalThis);
