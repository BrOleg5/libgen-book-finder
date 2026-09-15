/* DOI helpers shared by the background page, content script and popup. */
(function (root) {
  "use strict";

  const DOI_SOURCE = "10\\.[0-9]{4,}\\/[^\\s&\"'<>]*[^\\s&\"'<>.,;:]";
  const DOI_RE_GLOBAL = new RegExp("\\b" + DOI_SOURCE, "g");
  const DOI_RE_SINGLE = new RegExp(DOI_SOURCE);
  const DOI_RE_FULL = new RegExp("^" + DOI_SOURCE + "$");
  const PREFIX_RE = /^\s*(?:doi\s*:\s*|info:doi\/|https?:\/\/(?:dx\.)?doi\.org\/|(?:dx\.)?doi\.org\/)/i;
  const TRAILING_SEGMENT_RE = /\/(?:pdf|epdf|full|fulltext|abstract|abs|meta|references|supplemental|suppinfo)(?:\/.*)?$/i;

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (e) { return value; }
  }

  function count(str, ch) {
    let n = 0;
    for (const c of str) if (c === ch) n++;
    return n;
  }

  function cleanDOI(raw) {
    if (!raw) return null;
    let doi = safeDecode(String(raw).trim()).replace(PREFIX_RE, "");
    const match = doi.match(DOI_RE_SINGLE);
    if (!match) return null;
    doi = match[0].replace(/[?#].*$/, "").replace(TRAILING_SEGMENT_RE, "");
    for (;;) {
      const last = doi[doi.length - 1];
      if (/[.,;:]/.test(last || "")) doi = doi.slice(0, -1);
      else if (last === ")" && count(doi, "(") < count(doi, ")")) doi = doi.slice(0, -1);
      else if (last === "}" && count(doi, "{") < count(doi, "}")) doi = doi.slice(0, -1);
      else if (last === "]" && count(doi, "[") < count(doi, "]")) doi = doi.slice(0, -1);
      else break;
    }
    return DOI_RE_FULL.test(doi) ? doi : null;
  }

  function extractAllDois(text) {
    const out = [];
    if (!text || !String(text).includes("10.")) return out;
    DOI_RE_GLOBAL.lastIndex = 0;
    let match;
    while ((match = DOI_RE_GLOBAL.exec(String(text))) !== null) pushUnique(out, cleanDOI(match[0]));
    return out;
  }

  function extractDoiFromText(text) { return extractAllDois(text)[0] || null; }

  function extractDoiFromUrl(url) {
    if (!url) return null;
    let parsed;
    try { parsed = new URL(url); } catch (e) { return extractDoiFromText(url); }
    if (/(^|\.)doi\.org$/i.test(parsed.hostname)) return cleanDOI(parsed.pathname.replace(/^\/+/, ""));
    for (const [key, value] of parsed.searchParams) {
      if (/doi/i.test(key)) {
        const doi = cleanDOI(value);
        if (doi) return doi;
      }
    }
    return extractDoiFromText(safeDecode(parsed.pathname)) || extractDoiFromText(safeDecode(url));
  }

  function extractDoi(value) { return cleanDOI(value) || extractDoiFromUrl(value); }

  function pushUnique(list, doi) {
    if (doi && !list.some((item) => item.toLowerCase() === doi.toLowerCase())) list.push(doi);
  }

  function cleanTitle(text, remove) {
    let title = String(text || "").replace(/\s+/g, " ");
    if (remove) {
      const escaped = String(remove).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      title = title.replace(new RegExp("(?:(?:https?:\\/\\/)?(?:dx\\.)?doi\\.org\\/|doi\\s*:?\\s*)?" + escaped, "gi"), " ");
    }
    return title.replace(/\s+/g, " ").replace(/^[\s|•·:;,.-]+|[\s|•·:;,.-]+$/g, "");
  }

  root.LibGenDoi = {
    DOI_RE_GLOBAL, cleanDOI, extractAllDois, extractDoiFromText,
    extractDoiFromUrl, extractDoi, pushUnique, cleanTitle
  };
})(globalThis);
