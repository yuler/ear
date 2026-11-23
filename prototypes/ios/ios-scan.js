// PROTOTYPE. Full-screen pairing: system permission prompts (camera, Local Network), QR
// scanner, and the manual fallback (pick a nearby computer, type its 4-digit code).
// Uses globals from ios-mvp.js (state, el, renderAll, showToast) and ios-sync.js.

const SCAN_DETECT_MS = 1300; // the camera "finds" the QR by itself
const SCAN_FOUND_MS = 400; // brief green frame before pairing
const SCAN_DONE_MS = 1200; // success screen, then back to the library
let scanTimer = null;
let doneTimer = null;

const scanOpen = () => !el("scanView").classList.contains("hidden");

function clearScanTimers() {
  clearTimeout(scanTimer);
  clearTimeout(doneTimer);
  scanTimer = doneTimer = null;
}

/** Opens the pairing screen; asks for permissions first, the way iOS would. */
function openScan(mode = "scan") {
  closeSettings();
  clearScanTimers();
  state.manualMac = null;
  if (mode === "manual") { state.pairFlow = "manual"; state.pairNotice = null; } else startScan();
  state.scanFound = false;
  el("scanView").classList.remove("hidden");
  nextPermission();
  renderAll();
}

/** Asks the next missing permission, or starts the camera when nothing is pending. */
function nextPermission() {
  const p = state.perms;
  if (state.pairFlow === "scan" && p.camera === "unknown") { state.sysAlert = "camera"; return; }
  // iOS shows the Local Network prompt when the app starts looking for computers.
  if (p.localNetwork === "unknown") { state.sysAlert = "localNetwork"; return; }
  state.sysAlert = null;
  if (state.pairFlow === "scan" && p.camera === "granted" && lanAllowed()) startCamera();
}

function answerPermission(allow) {
  state.perms[state.sysAlert] = allow ? "granted" : "denied";
  state.sysAlert = null;
  nextPermission();
}

/** "Open Settings" in the prototype: pretend the user switched the permission on there. */
function grantInSettings(kind) {
  state.perms[kind] = "granted";
  showToast(t("permGranted"));
  nextPermission();
}

function startCamera() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    if (state.pairFlow !== "scan" || !scanOpen()) return;
    state.scanFound = true;
    renderAll();
    scanTimer = setTimeout(() => { scanSucceeded(); renderAll(); }, SCAN_FOUND_MS);
  }, SCAN_DETECT_MS);
}

function closeScan() {
  clearScanTimers();
  cancelPairing();
  state.sysAlert = null;
  el("scanView").classList.add("hidden");
  renderAll();
}

function submitCode(value) {
  if (!/^\d{4}$/.test(value)) return;
  if (!pairWithCode(state.manualMac, value)) state.codeShake = (state.codeShake ?? 0) + 1;
  renderAll();
}

// ---------- Rendering ----------

function permBlock(kind) {
  return `<div class="scan-card"><div class="scan-title bad">${t(kind === "camera" ? "permCamera" : "permLan")}</div>
      <div class="scan-sub">${t(kind === "camera" ? "permCameraWhy" : "permLanWhy")}</div>
      <button class="primary-btn" data-act="grant" data-id="${kind}">${t("openSettings")}</button>
      ${kind === "camera" ? `<button class="link-btn" data-act="manual">${t("manualEntry")}</button>` : ""}</div>`;
}

function manualHtml() {
  if (!lanAllowed()) return permBlock("localNetwork");
  const mac = state.manualMac && macById(state.manualMac);
  const notice = noticeText(state.pairNotice);
  if (!mac) {
    const list = nearbyMacs();
    return `<div class="manual"><div class="scan-title">${t("pickComputer")}</div>
        <div class="scan-sub">${t("pickComputerSub")}</div>
        <div class="manual-list">${list.length ? list.map((m) => `<button class="manual-item" data-act="pick-mac" data-id="${m.id}">
            <span class="mac-glyph">▣</span><span class="grow">${m.name}</span><span>›</span></button>`).join("")
          : `<div class="scan-sub">${t("noneNearby")}</div>`}</div></div>`;
  }
  return `<div class="manual"><div class="scan-title">${t("enterCode", mac.name)}</div>
      <div class="scan-sub">${t("enterCodeSub")}</div>
      <input id="codeInput" class="code-input ${state.codeShake ? `shake${state.codeShake % 2}` : ""}" inputmode="numeric"
        maxlength="4" autocomplete="one-time-code" placeholder="••••" />
      ${notice ? `<div class="scan-sub bad">${notice}</div>` : ""}
      <button class="link-btn" data-act="pick-mac" data-id="">${t("otherComputer")}</button></div>`;
}

function scanCardHtml() {
  const flow = state.pairFlow, mac = macById(state.pairingMac ?? state.viewMac);
  if (state.perms.camera === "denied" && flow === "scan") return permBlock("camera");
  if (state.perms.localNetwork === "denied" && flow === "scan") return permBlock("localNetwork");
  if (flow === "scan") {
    return state.scanFound
      ? `<div class="scan-card"><div class="scan-title">${t("scanFound", mac.name)}</div></div>`
      : `<div class="scan-card"><div class="scan-title">${t("scanHint")}</div><div class="scan-sub">${t("scanSub")}</div>
          <button class="link-btn" data-act="manual">${t("manualEntry")}</button></div>`;
  }
  if (flow === "done") {
    return `<div class="scan-card"><div class="scan-ok">✓</div>
        <div class="scan-title">${t(state.pairedAgain ? "alreadyPaired" : "doneTitle", mac.name)}</div>
        <div class="scan-sub">${t("doneSub")}</div></div>`;
  }
  if (flow === "error") {
    return `<div class="scan-card"><div class="scan-title bad">${noticeText(state.pairNotice)}</div>
        <button class="primary-btn" data-act="open-scan">${t("retry")}</button>
        <button class="link-btn" data-act="manual">${t("manualEntry")}</button></div>`;
  }
  return "";
}

function sysAlertHtml() {
  if (!state.sysAlert) return "";
  const cam = state.sysAlert === "camera";
  return `<div class="sys-scrim"><div class="sys-alert">
      <div class="sys-title">${t(cam ? "sysCameraTitle" : "sysLanTitle")}</div>
      <div class="sys-msg">${t(cam ? "sysCameraMsg" : "sysLanMsg")}</div>
      <div class="sys-btns"><button data-act="perm-no">${t("sysDeny")}</button>
        <button data-act="perm-yes"><b>${t(cam ? "sysOk" : "sysAllow")}</b></button></div></div></div>`;
}

/** Called by renderAll: draws the pairing screen for the current step. */
function renderScan() {
  const view = el("scanView");
  if (!scanOpen()) return;
  const flow = state.pairFlow;
  if (flow === "done" && !doneTimer) doneTimer = setTimeout(() => { doneTimer = null; closeScan(); }, SCAN_DONE_MS);

  const camOn = flow === "scan" && state.perms.camera === "granted" && lanAllowed();
  const finder = flow === "manual" ? "" : `<div class="scan-center"><div class="finder ${state.scanFound || flow === "done" ? "found" : ""}
      ${flow === "error" ? "bad" : ""} ${camOn || flow !== "scan" ? "" : "off"}"><b></b><b></b><b></b><b></b>
      ${camOn && !state.scanFound ? `<span class="scanline"></span>` : ""}</div></div>`;
  const html = `<div class="scan-feed ${camOn || flow === "done" ? "" : "dark"}"></div>
    <button class="scan-cancel" data-act="${flow === "manual" ? "back-scan" : "close-scan"}">
      ${flow === "done" ? t("close") : flow === "manual" ? t("backToScan") : t("cancel")}</button>
    ${flow === "manual" ? manualHtml() : finder + scanCardHtml()}${sysAlertHtml()}`;
  // Rebuild only when the step changes, so animations and a typed code survive the tick.
  if (view.dataset.html !== html) {
    view.dataset.html = html;
    view.innerHTML = html;
    const input = el("codeInput");
    if (input && document.activeElement !== input) input.focus?.();
  }
}

const SCAN_ACTS = {
  "open-scan": () => openScan(),
  "close-scan": () => closeScan(),
  manual: () => openScan("manual"),
  "back-scan": () => openScan(),
  "pick-mac": (id) => { state.manualMac = id || null; state.pairNotice = null; },
  "perm-yes": () => answerPermission(true),
  "perm-no": () => answerPermission(false),
  grant: (kind) => grantInSettings(kind)
};
