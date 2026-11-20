const SENTENCES = [
  { start: 0, end: 12, text: "When you acquire a second language, comprehension always comes first." },
  { start: 12, end: 25, text: "You do not memorize rules in order to speak fluently later." },
  { start: 25, end: 39, text: "Instead, you listen to messages you can mostly understand in context." },
  { start: 39, end: 52, text: "That gap between what you know and what you hear is called i plus one." },
  { start: 52, end: 66, text: "Repeating a short sentence offline lets your ear catch weak syllables naturally." },
  { start: 66, end: 80, text: "Once the rhythm feels effortless, your brain stores the whole phrase." }
];

const INITIAL_LIBRARY = [
  { id: "krashen-ci", title: "Stephen Krashen · Comprehensible Input", dur: "12:40", sizeMb: 48, state: "ready", sentences: 148 },
  { id: "bbc-habits", title: "BBC 6 Minute · Building Tiny Daily Habits", dur: "06:12", sizeMb: 24, state: "ready", sentences: 74 },
  { id: "podcast-42", title: "Daily English Podcast #42 · Connected Speech", dur: "18:05", sizeMb: 72, state: "remote", sentences: 210 }
];

const state = {
  lanConnected: true,
  pairedDevice: "MacBook Pro (192.168.1.42:7890)",
  offlineMode: false,
  syncProgress: 0,
  syncingId: null,
  library: INITIAL_LIBRARY.map((x) => ({ ...x })),
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
let syncTimer = null;
let playTimer = null;

function formatSec(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

function maybeStartAutoSync() {
  if (state.offlineMode || !state.lanConnected || !state.pairedDevice) {
    stopAutoSync();
    renderLibrary();
    return;
  }
  if (state.syncingId) return;
  const next = state.library.find((item) => item.state === "remote");
  if (!next) {
    renderLibrary();
    return;
  }
  state.syncingId = next.id;
  state.syncProgress = 8;
  next.state = "syncing";
  renderLibrary();

  syncTimer = setInterval(() => {
    if (state.offlineMode || !state.lanConnected || !state.pairedDevice) {
      next.state = "remote";
      stopAutoSync();
      renderLibrary();
      return;
    }
    state.syncProgress = Math.min(100, state.syncProgress + 16);
    if (state.syncProgress >= 100) {
      next.state = "ready";
      clearInterval(syncTimer);
      syncTimer = null;
      state.syncingId = null;
      state.syncProgress = 0;
      maybeStartAutoSync();
    } else {
      renderLibrary();
    }
  }, 320);
}

function stopAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  state.syncingId = null;
  state.syncProgress = 0;
}

function renderLibrary() {
  const simLanBtn = el("simLanBtn");
  const simPairBtn = el("simPairBtn");
  simLanBtn.textContent = state.lanConnected ? "LAN: 已接入家庭 Wi-Fi" : "LAN: 已断开 (外出)";
  simLanBtn.classList.toggle("active", state.lanConnected);
  simPairBtn.textContent = state.pairedDevice ? "已配对: MacBook Pro" : "未配对桌面端";
  simPairBtn.classList.toggle("active", Boolean(state.pairedDevice));

  const offlineBtn = el("offlineToggle");
  offlineBtn.classList.toggle("on", state.offlineMode);
  offlineBtn.setAttribute("aria-pressed", String(state.offlineMode));
  el("offlineLabel").textContent = state.offlineMode ? "Offline Mode: ON" : "Offline Mode";

  const banner = el("syncBanner");
  const icon = el("syncIcon");
  const title = el("syncTitle");
  const detail = el("syncDetail");
  const wrap = el("syncProgressWrap");
  const bar = el("syncProgressBar");

  if (state.offlineMode) {
    banner.classList.add("hidden");
  } else {
    banner.classList.remove("hidden");
    icon.classList.remove("spinning");
    wrap.classList.add("hidden");

    if (!state.pairedDevice) {
      icon.textContent = "⇄";
      title.textContent = "尚未配对桌面端";
      detail.textContent = "点右侧“设备”通过 AirDrop 或扫码配对";
    } else if (!state.lanConnected) {
      icon.textContent = "○";
      title.textContent = "未在同一局域网 · 仅显示本地库";
      detail.textContent = "回家连上同一 Wi-Fi 后将像 Dropbox 一样自动镜像";
    } else if (state.syncingId) {
      const item = state.library.find((x) => x.id === state.syncingId);
      icon.textContent = "↻";
      icon.classList.add("spinning");
      title.textContent = `自动镜像同步中 · ${state.syncProgress}%`;
      detail.textContent = `正在从 Mac 拉取「${item ? item.title : ""}」 (14.2 MB/s)`;
      wrap.classList.remove("hidden");
      bar.style.width = `${state.syncProgress}%`;
    } else {
      const readyCount = state.library.filter((x) => x.state === "ready").length;
      icon.textContent = "✓";
      title.textContent = `已与 MacBook Pro 同步`;
      detail.textContent = `${readyCount} 个视频与字幕已完整离线就绪`;
    }
  }

  const list = el("libraryList");
  const visibleItems = state.offlineMode
    ? state.library.filter((x) => x.state === "ready")
    : state.library;

  list.innerHTML = visibleItems
    .map((item) => {
      const isReady = item.state === "ready";
      const badge =
        item.state === "ready"
          ? `<span class="badge ready">已离线</span>`
          : item.state === "syncing"
            ? `<span class="badge syncing">同步中 ${state.syncProgress}%</span>`
            : `<span class="badge remote">Mac 待镜像</span>`;
      return `
        <button class="card ${isReady ? "" : "locked"}" data-id="${item.id}" type="button">
          <div class="thumb"><span class="thumb-dur">${item.dur}</span></div>
          <div class="card-meta">
            <div class="card-title">${item.title}</div>
            <div class="card-sub">
              ${badge}
              <span>${item.sentences} 句 · ${item.sizeMb} MB</span>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll(".card").forEach((node) => {
    node.addEventListener("click", () => {
      const item = state.library.find((x) => x.id === node.dataset.id);
      if (item && item.state === "ready") openPlayer(item);
    });
  });
}

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
    const speed = state.speeds[state.speedIndex];
    state.currentTime += 0.25 * speed;
    const cur = SENTENCES[state.currentSentenceIdx];
    if (state.currentTime >= cur.end) {
      if (state.loopSentence) {
        state.currentTime = cur.start;
      } else if (state.currentSentenceIdx < SENTENCES.length - 1) {
        state.currentSentenceIdx += 1;
      } else {
        state.currentSentenceIdx = 0;
        state.currentTime = 0;
      }
    }
    renderPlayer();
  }, 250);
}

function stopPlayLoop() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
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
    const active = idx === state.currentSentenceIdx;
    const display = state.masked ? "• ".repeat(Math.min(14, s.text.split(" ").length)) : s.text;
    return `
      <div class="sub-row ${active ? "active" : ""}" data-idx="${idx}">
        <div class="sub-ts">${formatSec(s.start)} – ${formatSec(s.end)}</div>
        <div>${display}</div>
      </div>
    `;
  }).join("");

  scroll.querySelectorAll(".sub-row").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.dataset.idx);
      state.currentSentenceIdx = idx;
      state.currentTime = SENTENCES[idx].start;
      state.playing = true;
      renderPlayer();
    });
  });

  const activeEl = scroll.querySelector(".sub-row.active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderPairSheet() {
  const body = el("sheetBody");
  if (state.pairedDevice) {
    body.innerHTML = `
      <div class="sheet-card">
        <div><strong>已绑定：${state.pairedDevice}</strong></div>
        <div class="sync-detail">接入同一局域网且关闭 Offline Mode 时，将自动镜像新增视频。</div>
        <div class="sheet-actions">
          <button id="unpairBtn" class="ghost-btn" type="button">解除配对</button>
          <button id="forceSyncBtn" class="primary-btn" type="button">立即检查镜像</button>
        </div>
      </div>
    `;
    el("unpairBtn").onclick = () => {
      state.pairedDevice = null;
      stopAutoSync();
      renderPairSheet();
      renderLibrary();
    };
    el("forceSyncBtn").onclick = () => {
      el("pairSheetBackdrop").classList.add("hidden");
      maybeStartAutoSync();
    };
  } else {
    body.innerHTML = `
      <div class="sheet-card">
        <div><strong>方式 1 · Mac AirDrop 握手</strong></div>
        <div class="sync-detail">在 Mac 端点击「AirDrop 配对」，手机接收后自动绑定内网地址。</div>
        <div class="sheet-actions">
          <button id="sheetAirDropBtn" class="primary-btn" type="button">模拟接收 AirDrop 配对</button>
        </div>
      </div>
      <div class="sheet-card">
        <div><strong>方式 2 · 输入桌面配对码 / LAN 地址</strong></div>
        <input id="pairAddrInput" class="pair-input" value="192.168.1.42:7890 · 482910" />
        <div class="sheet-actions">
          <button id="manualPairBtn" class="primary-btn" type="button">连接并开始自动镜像</button>
        </div>
      </div>
    `;
    const finishPair = () => {
      state.pairedDevice = "MacBook Pro (192.168.1.42:7890)";
      el("pairSheetBackdrop").classList.add("hidden");
      maybeStartAutoSync();
    };
    el("sheetAirDropBtn").onclick = finishPair;
    el("manualPairBtn").onclick = finishPair;
  }
}

el("offlineToggle").onclick = () => {
  state.offlineMode = !state.offlineMode;
  maybeStartAutoSync();
};
el("pairEntryBtn").onclick = () => {
  renderPairSheet();
  el("pairSheetBackdrop").classList.remove("hidden");
};
el("closeSheetBtn").onclick = () => el("pairSheetBackdrop").classList.add("hidden");
el("backToLibBtn").onclick = closePlayer;
el("videoTapArea").onclick = () => {
  state.playing = !state.playing;
  renderPlayer();
};
el("playPauseBtn").onclick = () => {
  state.playing = !state.playing;
  renderPlayer();
};
el("maskBtn").onclick = () => {
  state.masked = !state.masked;
  renderPlayer();
};
el("loopBtn").onclick = () => {
  state.loopSentence = !state.loopSentence;
  renderPlayer();
};
el("speedBtn").onclick = () => {
  state.speedIndex = (state.speedIndex + 1) % state.speeds.length;
  renderPlayer();
};
el("prevSentBtn").onclick = () => {
  state.currentSentenceIdx = Math.max(0, state.currentSentenceIdx - 1);
  state.currentTime = SENTENCES[state.currentSentenceIdx].start;
  state.playing = true;
  renderPlayer();
};
el("nextSentBtn").onclick = () => {
  state.currentSentenceIdx = Math.min(SENTENCES.length - 1, state.currentSentenceIdx + 1);
  state.currentTime = SENTENCES[state.currentSentenceIdx].start;
  state.playing = true;
  renderPlayer();
};

el("simLanBtn").onclick = () => {
  state.lanConnected = !state.lanConnected;
  maybeStartAutoSync();
};
el("simPairBtn").onclick = () => {
  state.pairedDevice = state.pairedDevice ? null : "MacBook Pro (192.168.1.42:7890)";
  maybeStartAutoSync();
};
el("simAddMacBtn").onclick = () => {
  const n = state.library.length + 1;
  state.library.unshift({
    id: `mac-new-${n}`,
    title: `YouTube New Lesson #${n} · Natural English`,
    dur: "09:18",
    sizeMb: 36,
    state: "remote",
    sentences: 95
  });
  maybeStartAutoSync();
};
el("simAirDropBtn").onclick = () => {
  state.pairedDevice = "MacBook Pro (AirDrop Pair)";
  state.lanConnected = true;
  state.offlineMode = false;
  maybeStartAutoSync();
};

maybeStartAutoSync();
