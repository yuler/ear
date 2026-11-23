// PROTOTYPE. Phone library mirrored from several paired Macs, swipe-to-delete, background
// mode, boot. Spec: docs/mobile.md. Engine: ios-sync.js. Settings + scanner: ios-settings.js.
// Mac side: ios-mac.js. Player: ios-player.js. Poster → video transition: ios-transition.js.

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
  { id: "home", key: "wifiHome" },
  { id: "office", key: "wifiOffice" },
  { id: "none", key: "wifiNone" }
];

const makeMac = (m) => ({ ...m, code: newPairCode(), codeLeft: PAIR_TTL_SEC, request: false, clients: [] });

const state = {
  settings: { theme: "system", lang: "zh", backgroundSync: true },
  transport: "lan",
  wifi: "home",
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
  pairFlow: "idle", // idle | scan | waiting | done | error
  pairingMac: null,
  pairNotice: null,
  scannedCode: null,
  scanFound: false,
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

const posterCss = (v) => `linear-gradient(135deg,hsl(${v.hue} 35% 34%),hsl(${(v.hue + 50) % 360} 30% 20%))`;
const wifiLabel = () => t(WIFI.find((w) => w.id === state.wifi).key);
const onlineMacs = () => state.macs.filter(reachable);
const names = (macs) => macs.map((m) => m.name).join("、");
const overallPct = (lib) => {
  const parts = lib.filter((x) => x.status !== "removed" && x.status !== "away");
  return parts.reduce((a, x) => a + (x.status === "ready" ? 1 : x.progress), 0) / Math.max(1, parts.length);
};
const resolvedTheme = () => state.settings.theme !== "system" ? state.settings.theme
  : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

// ---------- Library ----------

function renderBanner() {
  el("simWifiBtn").textContent = `手机 Wi-Fi：${wifiLabel()}`;
  el("simBgBtn").textContent = state.background ? "回到前台" : "切到后台";
  el("simBgBtn").classList.toggle("active", state.background);

  const icon = el("syncIcon"), title = el("syncTitle"), detail = el("syncDetail");
  const wrap = el("syncProgressWrap"), s = syncStats(), online = onlineMacs();
  el("syncBanner").classList.toggle("hidden", state.pairs.length === 0);
  icon.classList.remove("spinning");
  wrap.classList.add("hidden");

  if (online.length === 0) {
    icon.textContent = "○";
    title.textContent = t("offlineNone");
    detail.textContent = noticeText(state.pairNotice) ?? t("offlineDetail", wifiLabel());
  } else if (!s.complete) {
    icon.textContent = "↻";
    icon.classList.add("spinning");
    title.textContent = t("syncing", s.ready, s.wanted - s.away, s.syncing);
    detail.textContent = t("syncingFrom", names(online));
    wrap.classList.remove("hidden");
    el("syncProgressBar").style.width = `${overallPct(phoneLibrary()) * 100}%`;
  } else {
    icon.textContent = "✓";
    title.textContent = t("synced", names(online));
    detail.textContent = s.away ? t("awayNote", s.away) : t("readyCount", s.ready);
  }
}

function sourceLabel(item) {
  if (!item.sources.length) return t("fromGone");
  return item.sources.map((m) => m.short).join(" · ");
}

function cardHtml(item) {
  const removed = item.status === "removed";
  const badge = item.status === "ready" ? `<span class="badge ready">${t("badgeReady")}</span>`
    : item.status === "syncing" ? `<span class="badge syncing">${t("badgeSyncing", Math.round(item.progress * 100))}</span>`
    : removed ? `<button class="badge remote again" data-act="again" data-id="${item.id}">${t("mirrorAgain")}</button>`
    : item.status === "away" ? `<span class="badge remote">${t("badgeAway", item.sources[0].short)}</span>`
    : `<span class="badge remote">${t("badgeQueued")}</span>`;
  const open = swipeOpen === item.id;
  const hidden = heroHide === item.id ? "visibility:hidden;" : "";
  return `<div class="swipe ${open ? "reveal" : ""}">
      ${removed ? "" : `<button class="swipe-del" data-act="del" data-id="${item.id}">${t("del")}</button>`}
      <div class="card ${item.status === "ready" ? "" : "locked"}" data-id="${item.id}" data-swipe="${removed ? "" : item.id}"
        style="transform:translateX(${open ? -84 : 0}px)">
        <div class="thumb" style="${hidden}background:${posterCss(item)}">
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
  const kept = lib.filter((x) => x.status !== "removed");
  const removed = lib.filter((x) => x.status === "removed");
  if (lib.length === 0) {
    // No computer yet: the home screen is just a quick way to pair.
    el("libraryList").innerHTML = `<div class="quick">
        <div class="quick-qr">⌗</div>
        <h3>${t("quickTitle")}</h3><p>${t("quickDesc")}</p>
        <button class="primary-btn" data-act="open-scan">${t("quickBtn")}</button></div>`;
    return;
  }
  el("libraryList").innerHTML = kept.map(cardHtml).join("")
    + (removed.length ? `<div class="list-sec">${t("onlyOnPc")}</div>${removed.map(cardHtml).join("")}` : "")
    + (kept.length ? `<div class="list-hint">${t("swipeHint")}</div>` : "");
}

function renderHome() {
  const home = el("homeScreen");
  home.classList.toggle("hidden", !state.background);
  if (!state.background) return;
  const s = syncStats(), online = onlineMacs();
  const text = !state.pairs.length ? t("liveNone") : pausedInBackground() ? t("livePaused")
    : !online.length ? t("liveWait") : s.complete ? t("liveDone") : t("liveSyncing", s.ready, s.wanted - s.away);
  const sub = pausedInBackground() ? t("pausedBg") : `${names(online) || wifiLabel()} · ${t("lan")}`;
  home.innerHTML = `<div class="live"><div class="live-app">E</div>
      <div class="grow"><div class="live-title">${text}</div><div class="live-sub">${sub}</div>
        ${online.length && !s.complete ? `<div class="live-bar"><i style="width:${overallPct(phoneLibrary()) * 100}%"></i></div>` : ""}</div></div>
    <div class="apps">${"<i></i>".repeat(20)}</div>`;
}

// ---------- Events ----------

function renderAll() {
  document.documentElement.dataset.theme = resolvedTheme();
  applyI18n();
  renderLibrary();
  renderHome();
  renderMac();
  renderScan();
  if (settingsOpen()) renderSettings();
}

const ACTS = {
  ...SETTINGS_ACTS,
  del: (id) => { deleteLocal(id); swipeOpen = null; },
  again: (id) => mirrorAgain(id),
  "pair-yes": () => answerPair(true),
  "pair-no": () => answerPair(false),
  "mac-remove": (id) => removeClient(state.viewMac, id),
  "view-mac": (id) => { state.viewMac = id; }
};

let justDragged = false;
document.addEventListener("click", (e) => {
  if (e.target.id === "settingsBackdrop") { closeSettings(); return renderAll(); }
  const act = e.target.closest("[data-act]");
  if (act && ACTS[act.dataset.act]) {
    ACTS[act.dataset.act](act.dataset.id);
    return renderAll();
  }
  const card = e.target.closest("#libraryList .card");
  if (card && !justDragged) {
    if (swipeOpen) { swipeOpen = null; return renderAll(); }
    const item = phoneLibrary().find((x) => x.id === card.dataset.id);
    if (item && item.status === "ready") openDetail(item, card.querySelector(".thumb"));
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
el("simAddMacBtn").onclick = () => {
  const n = Object.keys(VIDEOS).length + 1, id = `mac-new-${n}`;
  VIDEOS[id] = { title: `YouTube New Lesson #${n} · Natural English`, dur: "09:18", sizeMb: 36, sentences: 95, hue: (n * 53) % 360 };
  macById(state.viewMac).library.unshift(id);
  renderAll();
};

setInterval(() => { syncTick(); renderAll(); }, TICK_MS);
renderAll();
