// PROTOTYPE. Pairing + LAN mirror engine (no DOM). Spec: docs/mobile.md.
//
// Each Mac is a server; one phone can pair with several Macs (home, office…) and each Mac
// serves several phones. The phone connects to whichever paired Macs share its current
// Wi-Fi, by itself, no manual switching. Everything lands in ONE phone library: an item
// remembers which Macs have it, and the same video is transferred only once.
// Swipe-deleting drops only the local copy; the item stays out of the mirror until the
// user mirrors it again. Uses the globals `state` and `VIDEOS` from ios-mvp.js.

const MAX_PARALLEL = 3; // per phone, across all Macs
const PAIR_TTL_SEC = 120;
const TICK_MS = 200;

const newPairCode = () => String(Math.floor(1000 + Math.random() * 9000));
const macById = (id) => state.macs.find((m) => m.id === id);
const isPaired = (macId) => state.pairs.includes(macId);
/** Background sync off + app in background: mirroring waits until Ear is open again. */
const pausedInBackground = () => state.background && !state.settings.backgroundSync;
/** A paired Mac the phone can reach right now (same Wi-Fi, not paused). */
const reachable = (mac) => isPaired(mac.id) && state.wifi === mac.network && !pausedInBackground();
const local = (videoId) => state.items[videoId];

/** Macs (paired) that have `videoId`. */
function sourcesOf(videoId) {
  return state.macs.filter((m) => isPaired(m.id) && m.library.includes(videoId));
}

/**
 * The phone library: every video on a paired Mac, plus local copies whose Mac is gone.
 * status: ready | syncing | removed | queued (a source is reachable) | away (none is).
 */
function phoneLibrary() {
  const ids = [];
  for (const m of state.macs) if (isPaired(m.id)) for (const v of m.library) if (!ids.includes(v)) ids.push(v);
  for (const v of Object.keys(state.items)) if (local(v).state === "ready" && !ids.includes(v)) ids.push(v);
  return ids.map((id) => {
    const it = local(id);
    const sources = sourcesOf(id);
    const status = it ? it.state : sources.some(reachable) ? "queued" : "away";
    return { ...VIDEOS[id], id, status, progress: it?.progress ?? 0, sources, from: it?.from ?? sources[0]?.id };
  });
}

function syncStats() {
  const lib = phoneLibrary();
  const count = (s) => lib.filter((x) => x.status === s).length;
  const wanted = lib.length - count("removed");
  const ready = count("ready");
  return { ready, syncing: count("syncing"), queued: count("queued"), away: count("away"), wanted,
    complete: count("syncing") + count("queued") === 0, allLocal: ready === wanted };
}

// Pairing (phone side) ------------------------------------------------------
// pairFlow: idle → scan → waiting (Mac asks the user) → done | error. Notices are
// { key, name } so the UI can translate them (ios-i18n.js).

function startScan() {
  state.pairFlow = "scan";
  state.pairNotice = null;
}

/** The phone scans the QR of the Mac on screen; only works on that Mac's Wi-Fi. */
function scanSucceeded() {
  const mac = macById(state.viewMac);
  state.pairingMac = mac.id;
  if (state.wifi !== mac.network) {
    state.pairFlow = "error";
    state.pairNotice = { key: "notSameWifi", name: mac.name };
    return;
  }
  if (isPaired(mac.id)) {
    state.pairFlow = "error";
    state.pairNotice = { key: "alreadyPaired", name: mac.name };
    return;
  }
  state.pairFlow = "waiting";
  state.scannedCode = mac.code;
  mac.request = true;
}

function cancelPairing() {
  const mac = state.pairingMac && macById(state.pairingMac);
  if (mac) mac.request = false;
  state.pairFlow = "idle";
  state.pairingMac = null;
}

// Pairing (Mac side) --------------------------------------------------------

function answerPair(allow, macId = state.pairingMac) {
  const mac = macById(macId);
  if (!mac) return;
  mac.request = false;
  if (!allow) {
    state.pairFlow = "error";
    state.pairNotice = { key: "refused", name: mac.name };
    return;
  }
  state.pairFlow = "done";
  state.pairs.push(mac.id);
  state.pairNotice = null;
  mac.clients.unshift({ id: "self", name: "这台 iPhone", self: true });
  // A used code is spent: show a fresh one for the next device.
  mac.code = newPairCode();
  mac.codeLeft = PAIR_TTL_SEC;
}

/** Forget one Mac (from the phone, or removed on that Mac). Local copies stay playable. */
function unpairMac(macId, byMac) {
  const mac = macById(macId);
  state.pairs = state.pairs.filter((id) => id !== macId);
  mac.clients = mac.clients.filter((c) => !c.self);
  for (const [vid, it] of Object.entries(state.items)) {
    if (it.state === "syncing" && it.from === macId) delete state.items[vid];
  }
  state.pairNotice = byMac ? { key: "removedByPc", name: mac.name } : null;
}

/** Another client (simulated) pairs to a Mac: shows the multi-client server. */
const OTHER_CLIENTS = ["iPad mini", "Pixel 8", "iPhone SE"];
function addOtherClient(macId = state.viewMac) {
  const mac = macById(macId);
  const used = new Set(mac.clients.map((c) => c.name));
  const name = OTHER_CLIENTS.find((n) => !used.has(n));
  if (name) mac.clients.push({ id: name, name, done: 0, background: name === "Pixel 8" });
}

function removeClient(macId, clientId) {
  if (clientId === "self") unpairMac(macId, true);
  else macById(macId).clients = macById(macId).clients.filter((c) => c.id !== clientId);
}

// Mirroring -----------------------------------------------------------------

function deleteLocal(videoId) {
  state.items[videoId] = { state: "removed", progress: 0 };
}

function mirrorAgain(videoId) {
  delete state.items[videoId];
}

let tickCount = 0;
function syncTick() {
  const t = createTransport(state.transport);
  // Transfers whose Mac went out of reach go back to waiting.
  for (const [vid, it] of Object.entries(state.items)) {
    if (it.state === "syncing" && !reachable(macById(it.from))) delete state.items[vid];
  }
  const syncing = Object.entries(state.items).filter(([, it]) => it.state === "syncing");
  for (const x of phoneLibrary()) {
    if (syncing.length >= MAX_PARALLEL) break;
    if (x.status !== "queued") continue;
    const from = x.sources.find(reachable);
    state.items[x.id] = { state: "syncing", progress: 0, from: from.id };
    syncing.push([x.id, state.items[x.id]]);
  }
  for (const [vid, it] of syncing) {
    it.progress = Math.min(1, it.progress + (t.mbps * TICK_MS) / 1000 / VIDEOS[vid].sizeMb);
    if (it.progress >= 1) it.state = "ready";
  }
  // Other clients mirror on their own (fake, steady).
  for (const m of state.macs) {
    for (const c of m.clients) {
      if (!c.self && tickCount % 6 === 0) c.done = Math.min(m.library.length, c.done + 1);
    }
  }
  tickCount++;
  if (tickCount % (1000 / TICK_MS) === 0) {
    for (const m of state.macs) {
      if (--m.codeLeft <= 0) { m.code = newPairCode(); m.codeLeft = PAIR_TTL_SEC; }
    }
  }
}
