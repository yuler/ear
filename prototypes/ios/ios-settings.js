// PROTOTYPE. Settings sheet: appearance, language, background sync, paired computers.
// Pairing itself lives in ios-scan.js. Uses globals from ios-mvp.js (state, el, renderAll, …).

// ---------- Settings sheet ----------

function seg(act, options, current) {
  return `<div class="seg">${options.map(([id, label]) =>
    `<button class="${id === current ? "on" : ""}" data-act="${act}" data-id="${id}">${label}</button>`).join("")}</div>`;
}

function pairedRow(mac) {
  const on = reachable(mac);
  const mine = phoneLibrary().filter((x) => mac.library.includes(x.id) && x.status !== "removed");
  const ready = mine.filter((x) => x.status === "ready").length;
  return `<div class="set-row">
      <div class="mac-glyph">▣</div>
      <div class="grow"><div class="set-label">${mac.name}</div>
        <div class="set-desc"><span class="dot ${on ? "on" : ""}"></span>${on ? t("connected", mac.networkName) : t("elsewhere", mac.networkName)}
          · ${t("have", ready, mine.length)}</div></div>
      <button class="ghost-btn danger" data-act="unpair" data-id="${mac.id}">${t("unpair")}</button>
    </div>`;
}

function renderSettings() {
  const s = state.settings;
  const paired = state.macs.filter((m) => isPaired(m.id));
  const notice = noticeText(state.pairFlow === "idle" ? state.pairNotice : null);
  el("settingsBody").innerHTML = `
    <div class="set-group">
      <div class="set-row"><div class="grow set-label">${t("appearance")}</div>
        ${seg("theme", [["dark", t("themeDark")], ["light", t("themeLight")], ["system", t("themeSystem")]], s.theme)}</div>
      <div class="set-row"><div class="grow set-label">${t("language")}</div>
        ${seg("lang", [["zh", "中文"], ["en", "English"]], s.lang)}</div>
      <div class="set-row"><div class="grow"><div class="set-label">${t("bgSync")}</div><div class="set-desc">${t("bgSyncDesc")}</div></div>
        <button class="switch ${s.backgroundSync ? "on" : ""}" data-act="bgsync" role="switch" aria-checked="${s.backgroundSync}"><i></i></button></div>
    </div>
    <div class="set-title">${t("computers")}</div>
    ${notice ? `<div class="sheet-notice">${notice}</div>` : ""}
    ${state.perms.localNetwork === "denied" ? `<div class="sheet-notice">${t("permLan")}
      <button class="link-btn" data-act="grant" data-id="localNetwork">${t("openSettings")}</button></div>` : ""}
    <div class="set-group">
      ${paired.length ? paired.map(pairedRow).join("") : `<div class="set-row set-desc">${t("noComputers")}</div>`}
      <button class="set-row set-action" data-act="open-scan">${t("pairNew")}</button>
    </div>
    <div class="set-foot">${t("multiNote")}</div>`;
}

const settingsOpen = () => !el("settingsBackdrop").classList.contains("hidden");
function openSettings() { state.pairNotice = null; renderSettings(); el("settingsBackdrop").classList.remove("hidden"); }
function closeSettings() { el("settingsBackdrop").classList.add("hidden"); }

/** Click actions owned by this file (merged into the handler in ios-mvp.js). */
const SETTINGS_ACTS = {
  "open-settings": () => openSettings(),
  "close-settings": () => closeSettings(),
  theme: (id) => { state.settings.theme = id; },
  lang: (id) => { state.settings.lang = id; },
  bgsync: () => { state.settings.backgroundSync = !state.settings.backgroundSync; },
  unpair: (id) => unpairMac(id, false)
};
