// PROTOTYPE. Phone UI: one library mirrored from several paired Macs, pair management
// sheet, swipe-to-delete, background mode. Spec: docs/mobile.md.
// Engine: ios-sync.js. Mac side: ios-mac.js. Player: ios-player.js.

const VIDEOS = {
  "krashen-ci": { title: "Stephen Krashen · Comprehensible Input", dur: "12:40", sizeMb: 48, sentences: 148, hue: 210 },
  "bbc-habits": { title: "BBC 6 Minute · Building Tiny Daily Habits", dur: "06:12", sizeMb: 24, sentences: 74, hue: 330 },
  "podcast-42": { title: "Daily English Podcast #42 · Connected Speech", dur: "18:05", sizeMb: 72, sentences: 210, hue: 150 },
  "tokyo-walk": { title: "東京の散歩 · Slow Japanese", dur: "08:30", sizeMb: 40, sentences: 96, hue: 20 },
  "cities-loud": { title: "Why Cities Are Loud · Vox", dur: "11:02", sizeMb: 56, sentences: 132, hue: 260 },
  "small-talk": { title: "Small Talk That Works", dur: "05:20", sizeMb: 22, sentences: 61, hue: 90 },
  "news-slow": { title: "News in Slow English · Week 47", dur: "15:10", sizeMb: 30, sentences: 160, hue: 40 }
};

const WIFI = [
  { id: "home", label: "家里 Wi-Fi" },
  { id: "office", label: "公司 Wi-Fi" },
  { id: "none", label: "外出（无 Wi-Fi）" }
];

const makeMac = (m) => ({ ...m, code: newPairCode(), codeLeft: PAIR_TTL_SEC, request: false, clients: [] });

const state = {
  theme: matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  transport: "lan",
  wifi: "home",
  offlineMode: false,
  background: false,
  macs: [
    makeMac({ id: "home", name: "家里 MacBook Pro", short: "家里", network: "home", networkName: "Home-5G",
      ip: "192.168.1.42", port: 7890, library: ["krashen-ci", "bbc-habits", "podcast-42", "tokyo-walk"] }),
    makeMac({ id: "office", name: "公司 iMac", short: "公司", network: "office", networkName: "Office-WiFi",
      ip: "10.0.8.15", port: 7890, library: ["krashen-ci", "cities-loud", "small-talk", "news-slow"] })
  ],
  viewMac: "home", // which Mac panel is on screen (and whose QR the phone scans)
  pairs: [], // paired Mac ids, in pairing order
  items: {}, // videoId -> { state: syncing|ready|removed, progress, from: macId }
  pairFlow: "idle", // idle | scan | waiting
  pairingMac: null,
  pairNotice: null,
  scannedCode: null,
  activeVideoId: null,
  currentSentenceIdx: 2,
  currentTime: 25,
  playing: true,
  masked: false,
  loopSentence: true,
  speedIndex: 1,
  speeds: [0.8, 1.0, 1.2, 1.5]
};

const el = (id) => document.getElementById(id);
let swipeOpen = null; // item id whose 删除 is revealed
let drag = null;

const wifiLabel = () => WIFI.find((w) => w.id === state.wifi).label;
const onlineMacs = () => state.macs.filter(reachable);
const overallPct = (lib) => {
  const parts = lib.filter((x) => x.status !== "removed" && x.status !== "away");
  return parts.reduce((a, x) => a + (x.status === "ready" ? 1 : x.progress), 0) / Math.max(1, parts.length);
};

// ---------- Library ----------

function renderBanner() {
  el("simWifiBtn").textContent = `手机 Wi-Fi：${wifiLabel()}`;
  el("simBgBtn").textContent = state.background ? "回到前台" : "切到后台";
  el("simBgBtn").classList.toggle("active", state.background);
  el("offlineToggle").classList.toggle("on", state.offlineMode);
  el("offlineToggle").setAttribute("aria-pressed", String(state.offlineMode));
  el("offlineLabel").textContent = state.offlineMode ? "Offline Mode: ON" : "Offline Mode";

  const icon = el("syncIcon"), title = el("syncTitle"), detail = el("syncDetail");
  const wrap = el("syncProgressWrap"), s = syncStats(), online = onlineMacs();
  el("syncBanner").classList.toggle("hidden", state.offlineMode);
  icon.classList.remove("spinning");
  wrap.classList.add("hidden");
  el("pairEntryBtn").textContent = state.pairs.length ? `电脑 · ${state.pairs.length}` : "扫码配对";
  const awayNote = s.away ? `还有 ${s.away} 个在其他电脑上，连上那里的 Wi-Fi 后镜像` : `${s.ready} 个视频与字幕已离线就绪`;

  if (state.pairs.length === 0) {
    icon.textContent = "⇄";
    title.textContent = "尚未配对电脑";
    detail.textContent = state.pairNotice ?? "在电脑「设置 → 手机镜像」里扫码";
  } else if (online.length === 0) {
    icon.textContent = "○";
    title.textContent = "没有连上已配对的电脑";
    detail.textContent = state.pairNotice ?? `当前：${wifiLabel()} · 回到家里或公司的 Wi-Fi 后自动镜像`;
  } else if (!s.complete) {
    icon.textContent = "↻";
    icon.classList.add("spinning");
    title.textContent = `镜像中 ${s.ready}/${s.wanted - s.away} · 同时 ${s.syncing} 个`;
    detail.textContent = `从 ${online.map((m) => m.name).join("、")} 拉取 · 切到后台也会继续`;
    wrap.classList.remove("hidden");
    el("syncProgressBar").style.width = `${overallPct(phoneLibrary()) * 100}%`;
  } else {
    icon.textContent = "✓";
    title.textContent = `已与 ${online.map((m) => m.name).join("、")} 同步`;
    detail.textContent = state.pairNotice ?? awayNote;
  }
}

function sourceLabel(item) {
  if (!item.sources.length) return `来自${macById(item.from)?.short ?? "已断开的电脑"}`;
  return item.sources.map((m) => m.short).join(" · ");
}

function cardHtml(item) {
  const removed = item.status === "removed";
  const badge = item.status === "ready" ? `<span class="badge ready">已离线</span>`
    : item.status === "syncing" ? `<span class="badge syncing">镜像中 ${Math.round(item.progress * 100)}%</span>`
    : removed ? `<button class="badge remote again" data-act="again" data-id="${item.id}">重新镜像</button>`
    : item.status === "away" ? `<span class="badge remote">在${item.sources[0].short} · 待连接</span>`
    : `<span class="badge remote">等待镜像</span>`;
  const open = swipeOpen === item.id;
  return `<div class="swipe ${open ? "reveal" : ""}">
      ${removed ? "" : `<button class="swipe-del" data-act="del" data-id="${item.id}">删除</button>`}
      <div class="card ${item.status === "ready" ? "" : "locked"}" data-id="${item.id}" data-swipe="${removed ? "" : item.id}"
        style="transform:translateX(${open ? -84 : 0}px)">
        <div class="thumb" style="background:linear-gradient(135deg,hsl(${item.hue} 35% 34%),hsl(${(item.hue + 50) % 360} 30% 20%))">
          <span class="thumb-dur">${item.dur}</span>
          ${item.status === "syncing" ? `<span class="thumb-prog" style="width:${item.progress * 100}%"></span>` : ""}
        </div>
        <div class="card-meta">
          <div class="card-title">${item.title}</div>
          <div class="card-sub">${badge}<span>${sourceLabel(item)} · ${item.sizeMb} MB</span></div>
        </div>
      </div>
    </div>`;
}

function renderLibrary() {
  renderBanner();
  if (drag) return; // don't rebuild the list under the finger
  const lib = phoneLibrary();
  const shown = state.offlineMode ? lib.filter((x) => x.status === "ready") : lib;
  const kept = shown.filter((x) => x.status !== "removed");
  const removed = shown.filter((x) => x.status === "removed");
  if (shown.length === 0) {
    el("libraryList").innerHTML = `<div class="list-empty">
        <div class="list-empty-glyph">⇄</div>
        <div>配对电脑后，媒体库会自动镜像到这里</div>
        <button class="primary-btn" data-act="open-pair">扫码配对</button></div>`;
    return;
  }
  el("libraryList").innerHTML = kept.map(cardHtml).join("")
    + (removed.length ? `<div class="list-sec">仅在电脑上</div>${removed.map(cardHtml).join("")}` : "")
    + (kept.length ? `<div class="list-hint">左滑删除手机上的副本，电脑上的不受影响</div>` : "");
}

function renderHome() {
  const home = el("homeScreen");
  home.classList.toggle("hidden", !state.background);
  if (!state.background) return;
  const s = syncStats(), online = onlineMacs();
  const text = !state.pairs.length ? "未配对电脑" : !online.length ? "等待连接电脑"
    : s.complete ? "已镜像完成" : `后台镜像中 ${s.ready}/${s.wanted - s.away}`;
  home.innerHTML = `<div class="live"><div class="live-app">E</div>
      <div class="grow"><div class="live-title">${text}</div>
        <div class="live-sub">${online.map((m) => m.name).join("、") || wifiLabel()} · 局域网</div>
        ${online.length && !s.complete ? `<div class="live-bar"><i style="width:${overallPct(phoneLibrary()) * 100}%"></i></div>` : ""}</div></div>
    <div class="apps">${"<i></i>".repeat(20)}</div>`;
}

// ---------- Pair sheet: manage several Macs ----------

function pairedRow(mac) {
  const on = reachable(mac);
  const mine = phoneLibrary().filter((x) => mac.library.includes(x.id) && x.status !== "removed");
  const ready = mine.filter((x) => x.status === "ready").length;
  return `<div class="pair-row">
      <div class="mac-glyph">▣</div>
      <div class="grow"><div><strong>${mac.name}</strong></div>
        <div class="sync-detail"><span class="dot ${on ? "on" : ""}"></span>${on ? `已连接 · ${mac.networkName}` : `不在当前网络 · ${mac.networkName}`}
          · 已有 ${ready}/${mine.length}</div></div>
      <button class="ghost-btn danger" data-act="unpair" data-id="${mac.id}">断开</button>
    </div>`;
}

function renderPairSheet() {
  const body = el("sheetBody");
  const target = macById(state.viewMac);
  if (state.pairFlow === "scan") {
    el("sheetTitle").textContent = "扫描电脑上的二维码";
    body.innerHTML = `<div class="camera"><div class="finder"></div>
        <div class="sync-detail">电脑：设置 → 手机镜像（右侧切换要扫的电脑）</div>
        <button class="primary-btn" data-act="scanned">模拟扫到「${target.name}」</button>
        <button class="ghost-btn" data-act="cancel-pair">取消</button></div>`;
  } else if (state.pairFlow === "waiting") {
    el("sheetTitle").textContent = "等待电脑确认";
    body.innerHTML = `<div class="camera"><div class="spinner"></div>
        <div>在「${macById(state.pairingMac).name}」上点「允许」</div><div class="pair-code">${state.scannedCode}</div>
        <button class="ghost-btn" data-act="cancel-pair">取消</button></div>`;
  } else {
    el("sheetTitle").textContent = "已配对的电脑";
    const rows = state.macs.filter((m) => isPaired(m.id)).map(pairedRow).join("");
    body.innerHTML = `${state.pairNotice ? `<div class="sheet-notice">${state.pairNotice}</div>` : ""}
      ${rows ? `<div class="sheet-card pair-list">${rows}</div>` : `<div class="sync-detail">还没有配对的电脑。</div>`}
      <div class="sync-detail">连上哪台电脑所在的 Wi-Fi，就自动从哪台镜像。所有电脑的视频都放在同一个媒体库里，同一个视频只传一次。</div>
      <button class="primary-btn" data-act="scan">＋ 配对新的电脑</button>`;
  }
}

const sheetOpen = () => !el("pairSheetBackdrop").classList.contains("hidden");
function openSheet() { renderPairSheet(); el("pairSheetBackdrop").classList.remove("hidden"); }
function closeSheet() { el("pairSheetBackdrop").classList.add("hidden"); }

// ---------- Events ----------

function renderAll() {
  document.documentElement.dataset.theme = state.theme;
  renderLibrary();
  renderHome();
  renderMac();
  if (sheetOpen()) renderPairSheet();
}

let justDragged = false;
document.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]");
  const id = act?.dataset.id;
  const acts = {
    del: () => { deleteLocal(id); swipeOpen = null; },
    again: () => mirrorAgain(id),
    scan: () => startScan(),
    scanned: () => scanSucceeded(),
    "cancel-pair": () => cancelPairing(),
    unpair: () => unpairMac(id, false),
    "pair-yes": () => { answerPair(true); closeSheet(); },
    "pair-no": () => answerPair(false),
    "mac-remove": () => removeClient(state.viewMac, id),
    "view-mac": () => { state.viewMac = id; },
    "open-pair": () => { openSheet(); startScan(); },
  };
  if (act && acts[act.dataset.act]) {
    acts[act.dataset.act]();
    return renderAll();
  }
  const card = e.target.closest("#libraryList .card");
  if (card && !justDragged) {
    if (swipeOpen) { swipeOpen = null; return renderAll(); }
    const item = phoneLibrary().find((x) => x.id === card.dataset.id);
    if (item && item.status === "ready") openPlayer(item);
  }
  const row = e.target.closest(".sub-row");
  if (row) jumpSentence(Number(row.dataset.idx));
});

// Swipe left on a card: reveal 删除; a long swipe deletes at once.
document.addEventListener("pointerdown", (e) => {
  const card = e.target.closest(".card[data-swipe]");
  if (!card || !card.dataset.swipe || e.target.closest("[data-act]")) return;
  const id = card.dataset.swipe;
  drag = { id, x0: e.clientX, base: swipeOpen === id ? -84 : 0, dx: 0, card, moved: false };
  card.classList.add("dragging");
  card.parentElement.classList.add("reveal");
});
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x0) > 4) drag.moved = true;
  drag.dx = Math.min(0, drag.base + e.clientX - drag.x0);
  drag.card.style.transform = `translateX(${drag.dx}px)`;
});
document.addEventListener("pointerup", () => {
  if (!drag) return;
  const { id, dx, moved } = drag;
  drag = null;
  justDragged = moved;
  setTimeout(() => { justDragged = false; }, 0);
  if (moved) {
    if (dx < -170) { deleteLocal(id); swipeOpen = null; }
    else swipeOpen = dx < -40 ? id : null;
  }
  renderAll();
});

bindPlayer();
el("offlineToggle").onclick = () => { state.offlineMode = !state.offlineMode; renderAll(); };
el("pairEntryBtn").onclick = () => { if (!state.pairs.length) startScan(); openSheet(); renderAll(); };
el("closeSheetBtn").onclick = () => { if (state.pairFlow !== "idle") cancelPairing(); state.pairNotice = null; closeSheet(); renderAll(); };
el("simWifiBtn").onclick = () => {
  const i = WIFI.findIndex((w) => w.id === state.wifi);
  state.wifi = WIFI[(i + 1) % WIFI.length].id;
  // Follow the phone: show the Mac on the new network.
  if (state.wifi !== "none") state.viewMac = state.wifi;
  renderAll();
};
el("simBgBtn").onclick = () => { state.background = !state.background; renderAll(); };
el("homeScreen").onclick = () => { state.background = false; renderAll(); };
el("simClientBtn").onclick = () => { addOtherClient(); renderAll(); };
el("themeBtn").onclick = () => { state.theme = state.theme === "dark" ? "light" : "dark"; renderAll(); };
el("simAddMacBtn").onclick = () => {
  const n = Object.keys(VIDEOS).length + 1, id = `mac-new-${n}`;
  VIDEOS[id] = { title: `YouTube New Lesson #${n} · Natural English`, dur: "09:18", sizeMb: 36, sentences: 95, hue: (n * 53) % 360 };
  macById(state.viewMac).library.unshift(id);
  renderAll();
};

setInterval(() => { syncTick(); renderAll(); }, TICK_MS);
renderAll();
