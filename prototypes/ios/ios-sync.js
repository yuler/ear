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
/** Without iOS "Local Network" permission the phone cannot see any computer. */
const lanAllowed = () => state.perms.localNetwork === "granted";
/** A paired Mac the phone can reach right now (same Wi-Fi, permitted, not paused). */
const reachable = (mac) =>
  isPaired(mac.id) && state.wifi === mac.network && lanAllowed() && !pausedInBackground();
/** Ear computers the phone can discover on its Wi-Fi (Bonjour), paired or not. */
const nearbyMacs = () => (lanAllowed() ? state.macs.filter((m) => m.network === state.wifi) : []);
const local = (videoId) => state.items[videoId];

/** Macs (paired) that have `videoId`. */
function sourcesOf(videoId) {
  return state.macs.filter((m) => isPaired(m.id) && m.library.includes(videoId));
}

/**
 * The phone library: every video on a paired Mac, plus local copies whose Mac is gone.
 * status: ready | syncing | removed | queued (a source is reachable) | away (none is).
 * A transfer cut off midway ("partial") keeps its bytes and shows as queued / away.
 */
function phoneLibrary() {
  const ids = [];
  for (const m of state.macs) if (isPaired(m.id)) for (const v of m.library) if (!ids.includes(v)) ids.push(v);
  for (const v of Object.keys(state.items)) if (local(v).state === "ready" && !ids.includes(v)) ids.push(v);
  return ids.map((id) => {
    const it = local(id);
    const sources = sourcesOf(id);
    const waiting = sources.some(reachable) ? "queued" : "away";
    const status = !it || it.state === "partial" ? waiting : it.state;
    return { ...VIDEOS[id], id, status, progress: it?.progress ?? 0, sources, from: it?.from ?? sources[0]?.id,
      priority: state.priority.includes(id) };
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

// Pairing --------------------------------------------------------------------
// pairFlow: idle → scan | manual → done | error. Scanning the one-time QR on the computer's
// screen proves the user is at that computer, so the computer does not ask to confirm.
// Notices are { key, name } so the UI can translate them (ios-i18n.js).

function startScan() {
  state.pairFlow = "scan";
  state.pairNotice = null;
  state.pairedAgain = false;
}

/** Pairs with `mac` (shared by QR and manual entry). Already paired counts as success. */
function pairWithMac(mac) {
  state.pairingMac = mac.id;
  if (isPaired(mac.id)) {
    state.pairFlow = "done";
    state.pairedAgain = true;
    return;
  }
  state.pairFlow = "done";
  state.pairedAgain = false;
  state.pairs.push(mac.id);
  state.pairNotice = null;
  mac.clients.unshift({ id: "self", name: "这台 iPhone", self: true });
  // A used code is spent: show a fresh one for the next device.
  mac.code = newPairCode();
  mac.codeLeft = PAIR_TTL_SEC;
}

/** The phone read the QR of the Mac on screen; only works on that Mac's Wi-Fi. */
function scanSucceeded() {
  const mac = macById(state.viewMac);
  state.pairingMac = mac.id;
  if (state.wifi !== mac.network) {
    state.pairFlow = "error";
    state.pairNotice = { key: "notSameWifi", name: mac.name };
    return;
  }
  pairWithMac(mac);
}

/** Manual fallback: pick a nearby computer and type the 4-digit code it shows. */
function pairWithCode(macId, code) {
  const mac = macById(macId);
  if (!mac || !nearbyMacs().includes(mac)) {
    state.pairNotice = { key: "notSameWifi", name: mac?.name ?? "" };
    return false;
  }
  if (code !== mac.code) {
    state.pairNotice = { key: "wrongCode", name: mac.name };
    return false;
  }
  pairWithMac(mac);
  return true;
}

function cancelPairing() {
  state.pairFlow = "idle";
  state.pairingMac = null;
}

/** Forget one Mac (from the phone, or removed on that Mac). Local copies stay playable. */
function unpairMac(macId, byMac) {
  const mac = macById(macId);
  state.pairs = state.pairs.filter((id) => id !== macId);
  mac.clients = mac.clients.filter((c) => !c.self);
  for (const [vid, it] of Object.entries(state.items)) {
    if ((it.state === "syncing" || it.state === "partial") && it.from === macId) {
      // Keep the bytes if another paired computer can finish it; otherwise drop them.
      if (sourcesOf(vid).length) it.state = "partial";
      else delete state.items[vid];
    }
  }
  state.priority = state.priority.filter((id) => sourcesOf(id).length);
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

/** Drops the local copy; returns what it was, so the UI can undo. */
function deleteLocal(videoId) {
  const before = state.items[videoId] ? { ...state.items[videoId] } : null;
  state.items[videoId] = { state: "removed", progress: 0 };
  state.priority = state.priority.filter((id) => id !== videoId);
  return before;
}

/** Undo a delete: the file was only marked, so it comes back as it was. */
function restoreLocal(videoId, before) {
  if (before) state.items[videoId] = before.state === "syncing" ? { ...before, state: "partial" } : before;
  else delete state.items[videoId];
}

function mirrorAgain(videoId) {
  delete state.items[videoId];
}

/** Tapping a video that is not local yet moves it to the front of the queue. */
function prioritize(videoId) {
  state.priority = [videoId, ...state.priority.filter((id) => id !== videoId)];
}

let tickCount = 0;
function syncTick() {
  const t = createTransport(state.transport);
  // Transfers whose Mac went out of reach pause, keeping their bytes (resumed by range).
  for (const it of Object.values(state.items)) {
    if (it.state === "syncing" && !reachable(macById(it.from))) it.state = "partial";
  }
  const lib = phoneLibrary();
  const order = [...lib.filter((x) => x.priority), ...lib.filter((x) => !x.priority)];
  const syncing = Object.entries(state.items).filter(([, it]) => it.state === "syncing");
  for (const x of order) {
    if (x.status !== "queued") continue;
    if (syncing.length >= MAX_PARALLEL) {
      // A prioritized video takes the slot of a non-priority transfer, which pauses.
      if (!x.priority) break;
      const victim = syncing.find(([vid]) => !state.priority.includes(vid));
      if (!victim) break;
      victim[1].state = "partial";
      syncing.splice(syncing.indexOf(victim), 1);
    }
    const from = x.sources.find(reachable);
    state.items[x.id] = { state: "syncing", progress: local(x.id)?.progress ?? 0, from: from.id };
    syncing.push([x.id, state.items[x.id]]);
  }
  for (const [vid, it] of syncing) {
    it.progress = Math.min(1, it.progress + (t.mbps * TICK_MS) / 1000 / VIDEOS[vid].sizeMb);
    if (it.progress >= 1) {
      it.state = "ready";
      state.priority = state.priority.filter((id) => id !== vid);
    }
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
