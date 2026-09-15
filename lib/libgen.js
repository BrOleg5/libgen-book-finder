/* Library Genesis mirror families and search URL builder. */
(function (root) {
  "use strict";

  const FAMILIES = {
    li: {
      isbn: "/index.php?req={q}",
      doi: "/index.php?req={q}",
      text: "/index.php?req={q}"
    },
    classic: {
      isbn: "/search.php?req={q}&column=identifier&res=100",
      doi: "/scimag/?q={q}",
      text: "/search.php?req={q}&column=def&res=100"
    }
  };

  function inferFamily(host) {
    let hostname = String(host || "");
    try { hostname = new URL(/^https?:\/\//i.test(hostname) ? hostname : "https://" + hostname).hostname; } catch (e) { /* use raw */ }
    return /(^|\.)libgen\.(?:is|rs|st)$/i.test(hostname) ? "classic" : "li";
  }

  function buildSearchUrl(base, family, query) {
    if (!query || !FAMILIES[family] || !FAMILIES[family][query.kind]) throw new Error("Invalid LibGen search query");
    const origin = String(base || "").replace(/\/+$/, "");
    return origin + FAMILIES[family][query.kind].replace("{q}", encodeURIComponent(query.value));
  }

  root.LibGen = { FAMILIES, inferFamily, buildSearchUrl };
})(globalThis);
