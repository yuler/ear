// PROTOTYPE. Phone UI: library mirrored from the Mac, pairing sheet, swipe-to-delete,
// background mode, player. Engine: ios-sync.js. Mac side: ios-mac.js.

const SENTENCES = [
  { start: 0, end: 12, text: "When you acquire a second language, comprehension always comes first." },
  { start: 12, end: 25, text: "You do not memorize rules in order to speak fluently later." },
  { start: 25, end: 39, text: "Instead, you listen to messages you can mostly understand in context." },
  { start: 39, end: 52, text: "That gap between what you know and what you hear is called i plus one." },
  { start: 52, end: 66, text: "Repeating a short sentence offline lets your ear catch weak syllables naturally." },
  { start: 66, end: 80, text: "Once the rhythm feels effortless, your brain stores the whole phrase." }
];

const INITIAL_LIBRARY = [
  { id: "krashen-ci", title: "Stephen Krashen · Comprehensible Input", dur: "12:40", sizeMb: 48, sentences: 148, hue: 210 },
  { id: "bbc-habits", title: "BBC 6 Minute · Building Tiny Daily Habits", dur: "06:12", sizeMb: 24, sentences: 74, hue: 330 },
  { id: "podcast-42", title: "Daily English Podcast #42 · Connected Speech", dur: "18:05", sizeMb: 72, sentences: 210, hue: 150 },
  { id: "tokyo-walk", title: "東京の散歩 · Slow Japanese", dur: "08:30", sizeMb: 40, sentences: 96, hue: 20 },
  { id: "cities-loud", title: "Why Cities Are Loud · Vox", dur: "11:02", sizeMb: 56, sentences: 132, hue: 260 },
  { id: "small-talk", title: "Small Talk That Works", dur: "05:20", sizeMb: 22, sentences: 61, hue: 90 }
];

const state = {
  theme: matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  transport: "lan",
  lanConnected: true,
  offlineMode: false,
  background: false,
  pair: null, // { mac, address } once paired
  pairFlow: "idle", // idle | scan | waiting
  pairNotice: null,
  scannedCode: null,
  mac: {
    name: "MacBook Pro", ip: "192.168.1.42", port: 7890,
    code: newPairCode(), codeLeft: PAIR_TTL_SEC, request: false, clients: []
  },
  library: INITIAL_LIBRARY.map((x) => ({ ...x, state: "remote", progress: 0 })),
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
let playTimer = null;
let swipeOpen = null; // item id whose 删除 is revealed
let drag = null;

function formatSec(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

// ---------- Library ----------

function renderBanner() {
  el("simLanBtn").textContent = state.lanConnected ? "LAN: 已接入家庭 Wi-Fi" : "LAN: 已断开 (外出)";
  el("simLanBtn").classList.toggle("active", state.lanConnected);
  el("simBgBtn").textContent = state.background ? "回到前台" : "切到后台";
  el("simBgBtn").classList.toggle("active", state.background);
  el("offlineToggle").classList.toggle("on", state.offlineMode);
  el("offlineToggle").setAttribute("aria-pressed", String(state.offlineMode));
  el("offlineLabel").textContent = state.offlineMode ? "Offline Mode: ON" : "Offline Mode";

  const icon = el("syncIcon"), title = el("syncTitle"), detail = el("syncDetail");
  const wrap = el("syncProgressWrap"), s = syncStats();
  el("syncBanner").classList.toggle("hidden", state.offlineMode);
  icon.classList.remove("spinning");
  wrap.classList.add("hidden");
  el("pairEntryBtn").textContent = state.pair ? "设备" : "扫码配对";

  if (!state.pair) {
    icon.textContent = "⇄";
    title.textContent = "尚未配对 Mac";
    detail.textContent = state.pairNotice ?? "在 Mac「设置 → 手机镜像」里扫码";
  } else if (!state.lanConnected) {
    icon.textContent = "○";
    title.textContent = "不在同一局域网 · 仅显示本地";
    detail.textContent = "回到同一 Wi-Fi 后自动继续镜像";
  } else if (!s.complete) {
    icon.textContent = "↻";
    icon.classList.add("spinning");
    title.textContent = `镜像中 ${s.ready}/${s.wanted} · 同时 ${s.syncing} 个`;
    detail.textContent = `从 ${state.pair.mac} 拉取 · 切到后台也会继续`;
    wrap.classList.remove("hidden");
    const parts = state.library.filter((x) => x.state !== "removed");
    const pct = parts.reduce((a, x) => a + (x.state === "ready" ? 1 : x.progress), 0) / Math.max(1, parts.length);
    el("syncProgressBar").style.width = `${pct * 100}%`;
  } else {
    icon.textContent = "✓";
    title.textContent = `已与 ${state.pair.mac} 同步`;
    detail.textContent = `${s.ready} 个视频与字幕已离线就绪`;
  }
}

function cardHtml(item) {
  const removed = item.state === "removed";
  const badge = item.state === "ready" ? `<span class="badge ready">已离线</span>`
    : item.state === "syncing" ? `<span class="badge syncing">镜像中 ${Math.round(item.progress * 100)}%</span>`
    : removed ? `<button class="badge remote again" data-act="again" data-id="${item.id}">重新镜像</button>`
    : `<span class="badge remote">Mac 待镜像</span>`;
  const open = swipeOpen === item.id;
  return `<div class="swipe ${open ? "reveal" : ""}">
      ${removed ? "" : `<button class="swipe-del" data-act="del" data-id="${item.id}">删除</button>`}
      <div class="card ${item.state === "ready" ? "" : "locked"}" data-id="${item.id}" data-swipe="${removed ? "" : item.id}"
        style="transform:translateX(${open ? -84 : 0}px)">
        <div class="thumb" style="background:linear-gradient(135deg,hsl(${item.hue} 35% 34%),hsl(${(item.hue + 50) % 360} 30% 20%))">
          <span class="thumb-dur">${item.dur}</span>
          ${item.state === "syncing" ? `<span class="thumb-prog" style="width:${item.progress * 100}%"></span>` : ""}
        </div>
        <div class="card-meta">
          <div class="card-title">${item.title}</div>
          <div class="card-sub">${badge}<span>${item.sentences} 句 · ${item.sizeMb} MB</span></div>
        </div>
      </div>
    </div>`;
}

function renderLibrary() {
  renderBanner();
  if (drag) return; // don't rebuild the list under the finger
  const shown = !state.pair || state.offlineMode
    ? state.library.filter((x) => x.state === "ready")
    : state.library;
  const kept = shown.filter((x) => x.state !== "removed");
  const removed = shown.filter((x) => x.state === "removed");
  if (shown.length === 0) {
    el("libraryList").innerHTML = `<div class="list-empty">
        <div class="list-empty-glyph">⇄</div>
        <div>配对 Mac 后，媒体库会自动镜像到这里</div>
        <button class="primary-btn" data-act="open-pair">扫码配对</button></div>`;
    return;
  }
  el("libraryList").innerHTML = kept.map(cardHtml).join("")
    + (removed.length ? `<div class="list-sec">仅在 Mac</div>${removed.map(cardHtml).join("")}` : "")
    + (kept.length ? `<div class="list-hint">左滑删除手机上的副本，Mac 上的不受影响</div>` : "");
}

function renderHome() {
  const home = el("homeScreen");
  home.classList.toggle("hidden", !state.background);
  if (!state.background) return;
  const s = syncStats();
  const parts = state.library.filter((x) => x.state !== "removed");
  const pct = parts.reduce((a, x) => a + (x.state === "ready" ? 1 : x.progress), 0) / Math.max(1, parts.length);
  const text = !state.pair ? "未配对 Mac" : !state.lanConnected || state.offlineMode ? "等待连接 Mac"
    : s.complete ? `已镜像全部 ${s.wanted} 个` : `后台镜像中 ${s.ready}/${s.wanted}`;
  home.innerHTML = `<div class="live"><div class="live-app">E</div>
      <div class="grow"><div class="live-title">${text}</div>
        <div class="live-sub">${state.mac.name} · 局域网</div>
        ${state.pair && !s.complete ? `<div class="live-bar"><i style="width:${pct * 100}%"></i></div>` : ""}</div></div>
    <div class="apps">${"<i></i>".repeat(20)}</div>`;
}

// ---------- Pair sheet ----------

function renderPairSheet() {
  const body = el("sheetBody");
  if (state.pair) {
    el("sheetTitle").textContent = "已配对的 Mac";
    body.innerHTML = `<div class="sheet-card">
        <div><strong>${state.pair.mac}</strong> <span class="sync-detail">${state.pair.address}</span></div>
        <div class="sync-detail">同一局域网内自动在后台镜像 Mac 的媒体库，每次同时传 ${MAX_PARALLEL} 个。</div>
        <div class="sheet-actions"><button class="ghost-btn danger" data-act="unpair">断开配对</button></div>
      </div>`;
  } else if (state.pairFlow === "scan") {
    el("sheetTitle").textContent = "扫描 Mac 上的二维码";
    body.innerHTML = `<div class="camera"><div class="finder"></div>
        <div class="sync-detail">Mac：设置 → 手机镜像</div>
        <button class="primary-btn" data-act="scanned">模拟扫到二维码</button></div>`;
  } else if (state.pairFlow === "waiting") {
    el("sheetTitle").textContent = "等待 Mac 确认";
    body.innerHTML = `<div class="camera"><div class="spinner"></div>
        <div>在 Mac 上点「允许」</div><div class="pair-code">${state.scannedCode}</div>
        <button class="ghost-btn" data-act="cancel-pair">取消</button></div>`;
  } else {
    el("sheetTitle").textContent = "配对 Mac";
    body.innerHTML = `<div class="sheet-card">
        <div><strong>扫码配对（局域网）</strong></div>
        <div class="sync-detail">手机和 Mac 连同一个 Wi-Fi，在 Mac「设置 → 手机镜像」里打开二维码。</div>
        <div class="sheet-actions"><button class="primary-btn" data-act="scan">打开相机扫码</button></div>
      </div>`;
  }
}

const sheetOpen = () => !el("pairSheetBackdrop").classList.contains("hidden");
function openSheet() { renderPairSheet(); el("pairSheetBackdrop").classList.remove("hidden"); }
function closeSheet() { el("pairSheetBackdrop").classList.add("hidden"); }

// ---------- Player (unchanged behaviour) ----------

function openPlayer(item) {
  state.activeVideoId = item.id;
  state.currentSentenceIdx = 0;
  state.currentTime = 0;
  state.playing = true;
  el("playerTitle").textContent = item.title;
  el("libraryView").classList.remove("active");
  el("playerView").classList.add("active");
  startPlayLoop();
  renderPlayer();
}

function closePlayer() {
  stopPlayLoop();
  state.activeVideoId = null;
  el("playerView").classList.remove("active");
  el("libraryView").classList.add("active");
}

function startPlayLoop() {
  stopPlayLoop();
  playTimer = setInterval(() => {
    if (!state.playing || !state.activeVideoId) return;
    state.currentTime += 0.25 * state.speeds[state.speedIndex];
    const cur = SENTENCES[state.currentSentenceIdx];
    if (state.currentTime >= cur.end) {
      if (state.loopSentence) state.currentTime = cur.start;
      else if (state.currentSentenceIdx < SENTENCES.length - 1) state.currentSentenceIdx += 1;
      else { state.currentSentenceIdx = 0; state.currentTime = 0; }
    }
    renderPlayer();
  }, 250);
}

function stopPlayLoop() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
}

function renderPlayer() {
  const totalSec = SENTENCES[SENTENCES.length - 1].end;
  const cur = SENTENCES[state.currentSentenceIdx];
  el("playerOfflineTag").classList.toggle("hidden", !state.offlineMode);
  el("speedBtn").textContent = `${state.speeds[state.speedIndex].toFixed(1)}×`;
  el("videoTimeLabel").textContent = `${formatSec(state.currentTime)} / ${formatSec(totalSec)}`;
  el("ambientScene").classList.toggle("paused", !state.playing);
  el("playOverlay").classList.toggle("visible", !state.playing);
  el("playPauseGlyph").textContent = state.playing ? "⏸" : "▶";
  el("maskBtn").classList.toggle("on", state.masked);
  el("maskLabel").textContent = state.masked ? "盲听中" : "遮罩";
  el("loopBtn").classList.toggle("on", state.loopSentence);
  el("loopLabel").textContent = state.loopSentence ? "循环中" : "顺序";
  el("timelineFill").style.width = `${(state.currentTime / totalSec) * 100}%`;
  el("loopHighlight").style.left = `${(cur.start / totalSec) * 100}%`;
  el("loopHighlight").style.width = `${((cur.end - cur.start) / totalSec) * 100}%`;

  const scroll = el("subtitleScroll");
  scroll.innerHTML = SENTENCES.map((s, idx) => {
    const display = state.masked ? "• ".repeat(Math.min(14, s.text.split(" ").length)) : s.text;
    return `<div class="sub-row ${idx === state.currentSentenceIdx ? "active" : ""}" data-idx="${idx}">
        <div class="sub-ts">${formatSec(s.start)} – ${formatSec(s.end)}</div><div>${display}</div></div>`;
  }).join("");
  const activeEl = scroll.querySelector(".sub-row.active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function jumpSentence(idx) {
  state.currentSentenceIdx = Math.max(0, Math.min(SENTENCES.length - 1, idx));
  state.currentTime = SENTENCES[state.currentSentenceIdx].start;
  state.playing = true;
  renderPlayer();
}

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
    unpair: () => { unpairSelf(false); closeSheet(); },
    "pair-yes": () => { answerPair(true); closeSheet(); },
    "pair-no": () => answerPair(false),
    "mac-remove": () => removeClient(id),
    "open-pair": () => { openSheet(); startScan(); },
  };
  if (act && acts[act.dataset.act]) {
    acts[act.dataset.act]();
    return renderAll();
  }
  const card = e.target.closest("#libraryList .card");
  if (card && !justDragged) {
    if (swipeOpen) { swipeOpen = null; return renderAll(); }
    const item = state.library.find((x) => x.id === card.dataset.id);
    if (item && item.state === "ready") openPlayer(item);
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

el("offlineToggle").onclick = () => { state.offlineMode = !state.offlineMode; renderAll(); };
el("pairEntryBtn").onclick = () => { if (!state.pair) startScan(); openSheet(); renderAll(); };
el("closeSheetBtn").onclick = () => { if (state.pairFlow !== "idle") cancelPairing(); closeSheet(); renderAll(); };
el("backToLibBtn").onclick = closePlayer;
el("videoTapArea").onclick = () => { state.playing = !state.playing; renderPlayer(); };
el("playPauseBtn").onclick = () => { state.playing = !state.playing; renderPlayer(); };
el("maskBtn").onclick = () => { state.masked = !state.masked; renderPlayer(); };
el("loopBtn").onclick = () => { state.loopSentence = !state.loopSentence; renderPlayer(); };
el("speedBtn").onclick = () => { state.speedIndex = (state.speedIndex + 1) % state.speeds.length; renderPlayer(); };
el("prevSentBtn").onclick = () => jumpSentence(state.currentSentenceIdx - 1);
el("nextSentBtn").onclick = () => jumpSentence(state.currentSentenceIdx + 1);

el("simLanBtn").onclick = () => { state.lanConnected = !state.lanConnected; renderAll(); };
el("simBgBtn").onclick = () => { state.background = !state.background; renderAll(); };
el("homeScreen").onclick = () => { state.background = false; renderAll(); };
el("simClientBtn").onclick = () => { addOtherClient(); renderAll(); };
el("themeBtn").onclick = () => { state.theme = state.theme === "dark" ? "light" : "dark"; renderAll(); };
el("simAddMacBtn").onclick = () => {
  const n = state.library.length + 1;
  state.library.unshift({
    id: `mac-new-${n}`, title: `YouTube New Lesson #${n} · Natural English`, dur: "09:18",
    sizeMb: 36, sentences: 95, hue: (n * 53) % 360, state: "remote", progress: 0
  });
  renderAll();
};

setInterval(() => { syncTick(); renderAll(); }, TICK_MS);
renderAll();
