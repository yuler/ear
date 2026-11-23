// PROTOTYPE. In-memory state and the mirror engine. Rendering lives in lan-mirror.js.
//
// Model: the PC library is the source of truth. Every paired phone mirrors all of it in the
// background, up to MAX_PARALLEL files at once. A phone can delete its local copy (swipe);
// that item is then excluded until the user mirrors it again. Several phones run at once.

const MAX_PARALLEL = 3;
const PAIR_TTL_SEC = 120;
const TICK_MS = 200;

const TITLES = [
  ["How to Make Friends as an Adult", 14, 180, "video"],
  ["The Art of Doing Nothing", 9, 120, "video"],
  ["日本の朝ごはん", 6, 80, "video"],
  ["Daily English Podcast #42", 22, 30, "audio"],
  ["Why Cities Are Loud", 11, 150, "video"],
  ["東京の散歩", 8, 110, "video"],
  ["Small Talk That Works", 5, 70, "video"],
  ["News in Slow English", 18, 25, "audio"],
];
const PHONE_NAMES = ["iPhone 15", "Pixel 8", "iPad mini"];

let seq = 0;
const uid = (p) => `${p}${++seq}`;
const pairCode = () => String(Math.floor(1000 + Math.random() * 9000));

function makeVideo(i) {
  const [title, min, sizeMB, kind] = TITLES[i % TITLES.length];
  return { id: uid("v"), title, min, sizeMB, kind, hue: (i * 47) % 360 };
}

const state = {
  theme: matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  transport: "lan",
  pc: {
    name: "Yule 的 MacBook",
    ip: "192.168.1.23",
    port: 7878,
    view: "settings", // "library" | "settings"
    code: pairCode(),
    codeLeft: PAIR_TTL_SEC,
    library: TITLES.slice(0, 5).map((_, i) => makeVideo(i)),
    request: null, // phone id waiting for "允许"
    menu: null, // phone id whose ⋯ menu is open
  },
  phones: [],
};

function addPhone() {
  if (state.phones.length >= PHONE_NAMES.length) return;
  state.phones.push({
    id: uid("p"),
    name: PHONE_NAMES[state.phones.length],
    screen: "unpaired", // unpaired | scan | waiting | library
    paired: false,
    background: false,
    online: true,
    notice: null,
    items: {}, // videoId -> { status: queued|syncing|done|removed, progress 0..1 }
  });
}

function addPcVideo() {
  state.pc.library.unshift(makeVideo(state.pc.library.length));
}

const phoneById = (id) => state.phones.find((p) => p.id === id);

// Pairing ------------------------------------------------------------------

function startScan(phone) {
  phone.screen = "scan";
  phone.notice = null;
}

function scanSucceeded(phone) {
  phone.screen = "waiting";
  phone.scannedCode = state.pc.code;
  state.pc.request = phone.id;
}

function answerPair(allow) {
  const phone = phoneById(state.pc.request);
  state.pc.request = null;
  if (!phone) return;
  if (!allow) {
    phone.screen = "unpaired";
    phone.notice = "电脑拒绝了配对";
    return;
  }
  phone.paired = true;
  phone.screen = "library";
  phone.notice = null;
  // A used code is spent: show a fresh one for the next phone.
  state.pc.code = pairCode();
  state.pc.codeLeft = PAIR_TTL_SEC;
}

function unpair(phone, byPc) {
  phone.paired = false;
  phone.screen = "unpaired";
  phone.items = {};
  phone.background = false;
  phone.notice = byPc ? "已被电脑移除，需要重新扫码" : null;
  if (state.pc.request === phone.id) state.pc.request = null;
}

// Mirroring ----------------------------------------------------------------

function deleteLocal(phone, videoId) {
  phone.items[videoId] = { status: "removed", progress: 0 };
}

function mirrorAgain(phone, videoId) {
  phone.items[videoId] = { status: "queued", progress: 0 };
}

/** Counts over the PC library as seen by one phone. */
function phoneStats(phone) {
  const lib = state.pc.library;
  let done = 0, syncing = 0, removed = 0, pending = 0;
  for (const v of lib) {
    const s = phone.items[v.id]?.status ?? "queued";
    if (s === "done") done++;
    else if (s === "syncing") syncing++;
    else if (s === "removed") removed++;
    else pending++;
  }
  const wanted = lib.length - removed;
  return { done, syncing, removed, pending, wanted, complete: done === wanted };
}

function tick() {
  const t = createTransport(state.transport);
  for (const phone of state.phones) {
    if (!phone.paired || !phone.online) continue;
    const syncing = [];
    for (const v of state.pc.library) {
      const it = (phone.items[v.id] ??= { status: "queued", progress: 0 });
      if (it.status === "syncing") syncing.push([v, it]);
    }
    // Fill free slots, newest first (library order).
    for (const v of state.pc.library) {
      if (syncing.length >= MAX_PARALLEL) break;
      const it = phone.items[v.id];
      if (it.status === "queued") {
        it.status = "syncing";
        syncing.push([v, it]);
      }
    }
    for (const [v, it] of syncing) {
      it.progress = Math.min(1, it.progress + (t.mbps * TICK_MS) / 1000 / v.sizeMB);
      if (it.progress >= 1) it.status = "done";
    }
  }
  // Pairing code countdown, once a second.
  tickCount++;
  if (tickCount % (1000 / TICK_MS) === 0 && --state.pc.codeLeft <= 0) {
    state.pc.code = pairCode();
    state.pc.codeLeft = PAIR_TTL_SEC;
  }
}
let tickCount = 0;

addPhone();
