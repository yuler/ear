// PROTOTYPE. Settings sheet (appearance, language, background sync, paired computers) and
// the full-screen pair scanner. Uses globals from ios-mvp.js (state, el, renderAll, …).

const SCAN_DETECT_MS = 1300; // the camera "finds" the QR by itself
const SCAN_FOUND_MS = 450; // brief highlight before asking the computer
const SCAN_DONE_MS = 1200; // success screen, then back to the library
let scanTimer = null;
let doneTimer = null;

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
    <div class="set-group">
      ${paired.length ? paired.map(pairedRow).join("") : `<div class="set-row set-desc">${t("noComputers")}</div>`}
      <button class="set-row set-action" data-act="open-scan">${t("pairNew")}</button>
    </div>
    <div class="set-foot">${t("multiNote")}</div>`;
}

const settingsOpen = () => !el("settingsBackdrop").classList.contains("hidden");
function openSettings() { state.pairNotice = null; renderSettings(); el("settingsBackdrop").classList.remove("hidden"); }
function closeSettings() { el("settingsBackdrop").classList.add("hidden"); }

// ---------- Pair scanner (full screen) ----------

function openScan() {
  closeSettings();
  clearTimeout(scanTimer);
  clearTimeout(doneTimer);
  doneTimer = null;
  startScan();
  state.scanFound = false;
  el("scanView").classList.remove("hidden");
  renderScan();
  scanTimer = setTimeout(() => {
    if (state.pairFlow !== "scan") return;
    state.scanFound = true;
    renderAll();
    scanTimer = setTimeout(() => { scanSucceeded(); renderAll(); }, SCAN_FOUND_MS);
  }, SCAN_DETECT_MS);
}

function closeScan() {
  clearTimeout(scanTimer);
  clearTimeout(doneTimer);
  doneTimer = null;
  if (state.pairFlow === "waiting" || state.pairFlow === "scan") cancelPairing();
  state.pairFlow = "idle";
  el("scanView").classList.add("hidden");
  renderAll();
}

/** Called by renderAll: draws the scanner for the current pairFlow step. */
function renderScan() {
  const view = el("scanView");
  if (view.classList.contains("hidden")) return;
  const flow = state.pairFlow;
  const mac = macById(state.pairingMac ?? state.viewMac);
  if (flow === "done" && !doneTimer) doneTimer = setTimeout(() => { doneTimer = null; closeScan(); }, SCAN_DONE_MS);

  const finder = `<div class="finder ${state.scanFound || flow === "waiting" || flow === "done" ? "found" : ""} ${flow === "error" ? "bad" : ""}">
      <b></b><b></b><b></b><b></b>${flow === "scan" && !state.scanFound ? `<span class="scanline"></span>` : ""}</div>`;
  let card = "";
  if (flow === "scan") {
    card = state.scanFound
      ? `<div class="scan-card"><div class="scan-title">${t("scanFound", mac.name)}</div></div>`
      : `<div class="scan-card"><div class="scan-title">${t("scanHint")}</div><div class="scan-sub">${t("scanSub")}</div></div>`;
  } else if (flow === "waiting") {
    card = `<div class="scan-card"><div class="spinner"></div>
        <div class="scan-title">${t("waitTitle", mac.name)}</div>
        <div class="scan-sub">${t("waitCode")}</div><div class="pair-code">${state.scannedCode}</div></div>`;
  } else if (flow === "done") {
    card = `<div class="scan-card"><div class="scan-ok">✓</div>
        <div class="scan-title">${t("doneTitle", mac.name)}</div><div class="scan-sub">${t("doneSub")}</div></div>`;
  } else if (flow === "error") {
    card = `<div class="scan-card"><div class="scan-title bad">${noticeText(state.pairNotice)}</div>
        <button class="primary-btn" data-act="open-scan">${t("retry")}</button></div>`;
  }
  const html = `<div class="scan-feed"></div>
    <button class="scan-cancel" data-act="close-scan">${flow === "done" ? t("close") : t("cancel")}</button>
    <div class="scan-center">${finder}</div>${card}`;
  // Rebuild only when the step changes, so entry animations and the spinner keep running.
  if (view.dataset.html !== html) {
    view.dataset.html = html;
    view.innerHTML = html;
  }
}

/** Click actions owned by this file (merged into the handler in ios-mvp.js). */
const SETTINGS_ACTS = {
  "open-settings": () => openSettings(),
  "close-settings": () => closeSettings(),
  theme: (id) => { state.settings.theme = id; },
  lang: (id) => { state.settings.lang = id; },
  bgsync: () => { state.settings.backgroundSync = !state.settings.backgroundSync; },
  unpair: (id) => unpairMac(id, false),
  "open-scan": () => openScan(),
  "close-scan": () => closeScan()
};
