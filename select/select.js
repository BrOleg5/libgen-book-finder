(function () {
  "use strict";
  const i18n = (key, substitutions) => browser.i18n.getMessage(key, substitutions) || "";
  const $ = (id) => document.getElementById(id);
  const tabId = Number(new URLSearchParams(location.search).get("tab"));
  for (const element of document.querySelectorAll("[data-i18n]")) {
    const text = i18n(element.dataset.i18n);
    if (text) element.textContent = text;
  }
  document.title = i18n("selectHeading") || document.title;
  const checkboxes = () => [...document.querySelectorAll(".item input")];
  const selected = () => checkboxes().filter((el) => el.checked).map((el) => ({ kind: el.dataset.kind, value: el.value }));
  function updateOpenButton() {
    const count = selected().length;
    $("open").disabled = count === 0;
    $("open").textContent = count ? i18n("selectOpenCount", [String(count)]) : i18n("selectOpen");
  }
  function renderItems(items) {
    $("list").textContent = "";
    for (const item of items) {
      const row = document.createElement("label");
      row.className = "item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = item.value;
      checkbox.dataset.kind = item.kind;
      checkbox.addEventListener("change", updateOpenButton);
      const text = document.createElement("span");
      text.className = "text";
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = item.title || item.value;
      text.append(title);
      if (item.title) {
        const identifier = document.createElement("span");
        identifier.className = "identifier";
        identifier.textContent = item.kind.toUpperCase() + " · " + item.value;
        text.append(identifier);
      }
      row.append(checkbox, text);
      $("list").append(row);
    }
    $("list").hidden = items.length === 0;
    $("empty").hidden = items.length > 0;
    $("select-all").disabled = $("deselect-all").disabled = items.length === 0;
    updateOpenButton();
  }
  function setAll(value) { for (const box of checkboxes()) box.checked = value; updateOpenButton(); }
  async function openSelected() {
    const queries = selected();
    if (!queries.length) return;
    try { await browser.runtime.sendMessage({ type: "openQueries", tabId, queries }); }
    finally { window.close(); }
  }
  $("select-all").addEventListener("click", () => setAll(true));
  $("deselect-all").addEventListener("click", () => setAll(false));
  $("cancel").addEventListener("click", () => window.close());
  $("open").addEventListener("click", () => openSelected().catch(console.error));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") window.close();
    if (event.key === "Enter" && !$("open").disabled) openSelected().catch(console.error);
  });
  async function load() {
    let response;
    try { response = await browser.runtime.sendMessage({ type: "getTabItems", tabId }); }
    catch (e) { response = null; }
    if (response && response.pageTitle) $("page").textContent = response.pageTitle;
    renderItems(response && response.items || []);
  }
  load().catch(console.error);
})();
