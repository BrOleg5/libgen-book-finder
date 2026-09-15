/* Settings stored in browser.storage.sync. */
(function (root) {
  "use strict";

  const G = root.LibGen;
  const DEFAULT_MIRRORS = [
    { host: "libgen.li", family: "li" },
    { host: "libgen.gl", family: "li" },
    { host: "libgen.vg", family: "li" },
    { host: "libgen.la", family: "li" },
    { host: "libgen.bz", family: "li" },
    { host: "libgen.is", family: "classic" },
    { host: "libgen.rs", family: "classic" },
    { host: "libgen.st", family: "classic" }
  ];
  const CUSTOM = "custom";
  const DEFAULTS = {
    mirror: DEFAULT_MIRRORS[0].host,
    customMirror: "",
    customFamily: "li",
    mirrors: DEFAULT_MIRRORS.map((m) => ({ ...m })),
    openIn: "newTab",
    showBadge: true,
    useCrossref: true
  };

  function normalizeMirror(value) {
    let mirror = String(value || "").trim();
    if (!mirror) return "";
    if (!/^https?:\/\//i.test(mirror)) mirror = "https://" + mirror;
    try {
      const url = new URL(mirror);
      return url.origin + url.pathname.replace(/\/+$/, "");
    } catch (e) { return ""; }
  }

  function displayMirror(value) { return normalizeMirror(value).replace(/^https?:\/\//i, ""); }

  function sanitizeMirrorList(list) {
    const out = [];
    for (const item of Array.isArray(list) ? list : []) {
      const raw = typeof item === "string" ? item.trim().split(/\s+/) : [];
      const host = displayMirror(typeof item === "object" && item ? item.host : raw[0]);
      if (!host) continue;
      const proposed = typeof item === "object" && item ? item.family : raw[1];
      const family = proposed === "classic" || proposed === "li" ? proposed : G.inferFamily(host);
      if (!out.some((m) => m.host === host)) out.push({ host, family });
    }
    return out.length ? out : DEFAULT_MIRRORS.map((m) => ({ ...m }));
  }

  async function get() {
    const stored = await browser.storage.sync.get(null);
    const settings = Object.assign({}, DEFAULTS, stored);
    settings.mirrors = sanitizeMirrorList(settings.mirrors);
    if (settings.mirror !== CUSTOM && !settings.mirrors.some((m) => m.host === settings.mirror)) settings.mirror = settings.mirrors[0].host;
    if (!G.FAMILIES[settings.customFamily]) settings.customFamily = "li";
    return settings;
  }

  function set(patch) { return browser.storage.sync.set(patch); }

  function activeMirror(settings) {
    if (settings.mirror === CUSTOM) {
      const base = normalizeMirror(settings.customMirror);
      if (base) return { base, family: settings.customFamily };
    }
    const selected = settings.mirrors.find((m) => m.host === settings.mirror) || settings.mirrors[0];
    return { base: normalizeMirror(selected.host), family: selected.family };
  }

  root.LibGenSettings = {
    DEFAULT_MIRRORS, DEFAULTS, CUSTOM, get, set, activeMirror,
    normalizeMirror, displayMirror, sanitizeMirrorList
  };
})(globalThis);
