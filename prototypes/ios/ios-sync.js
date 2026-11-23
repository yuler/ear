// PROTOTYPE. Pairing + LAN mirror engine (no DOM). The Mac is the server; any number of
// phones pair to it and mirror its whole library in the background, MAX_PARALLEL files at a
// time. Swipe-deleting on the phone drops only the local copy; that item stays excluded
// ("仅在 Mac") until the user mirrors it again. Uses the global `state` from ios-mvp.js.

const MAX_PARALLEL = 3;
const PAIR_TTL_SEC = 120;
const TICK_MS = 200;

const newPairCode = () => String(Math.floor(1000 + Math.random() * 9000));

function syncActive() {
  return Boolean(state.pair) && state.lanConnected && !state.offlineMode;
}

function syncStats() {
  let ready = 0, syncing = 0, removed = 0;
  for (const it of state.library) {
    if (it.state === "ready") ready++;
    else if (it.state === "syncing") syncing++;
    else if (it.state === "removed") removed++;
  }
  const wanted = state.library.length - removed;
  return { ready, syncing, removed, wanted, complete: ready === wanted };
}

// Pairing (phone side) ------------------------------------------------------

function startScan() {
  state.pairFlow = "scan";
}

function scanSucceeded() {
  state.pairFlow = "waiting";
  state.scannedCode = state.mac.code;
  state.mac.request = true;
}

function cancelPairing() {
  state.pairFlow = "idle";
  state.mac.request = false;
}

// Pairing (Mac side) --------------------------------------------------------

function answerPair(allow) {
  state.mac.request = false;
  if (!allow) {
    state.pairFlow = "idle";
    state.pairNotice = "Mac 拒绝了配对";
    return;
  }
  const t = createTransport(state.transport);
  state.pair = { mac: state.mac.name, address: t.address(state.mac) };
  state.pairFlow = "idle";
  state.pairNotice = null;
  state.mac.clients.unshift({ id: "self", name: "这台 iPhone", self: true });
  // A used code is spent: show a fresh one for the next device.
  state.mac.code = newPairCode();
  state.mac.codeLeft = PAIR_TTL_SEC;
}

/** Unpair this phone (from the phone, or removed on the Mac). Local copies stay playable. */
function unpairSelf(byMac) {
  state.pair = null;
  state.mac.clients = state.mac.clients.filter((c) => !c.self);
  for (const it of state.library) {
    if (it.state === "syncing") { it.state = "remote"; it.progress = 0; }
  }
  state.pairNotice = byMac ? "已被 Mac 移除，需要重新扫码" : null;
}

/** Another client (simulated) pairs to the same Mac: shows the multi-client server. */
const OTHER_CLIENTS = ["iPad mini", "Pixel 8", "iPhone SE"];
function addOtherClient() {
  const used = new Set(state.mac.clients.map((c) => c.name));
  const name = OTHER_CLIENTS.find((n) => !used.has(n));
  if (!name) return;
  state.mac.clients.push({ id: name, name, done: 0, background: name === "Pixel 8" });
}

function removeClient(id) {
  if (id === "self") unpairSelf(true);
  else state.mac.clients = state.mac.clients.filter((c) => c.id !== id);
}

// Mirroring -----------------------------------------------------------------

function deleteLocal(id) {
  const it = state.library.find((x) => x.id === id);
  if (it) { it.state = "removed"; it.progress = 0; }
}

function mirrorAgain(id) {
  const it = state.library.find((x) => x.id === id);
  if (it) { it.state = "remote"; it.progress = 0; }
}

let tickCount = 0;
function syncTick() {
  const t = createTransport(state.transport);
  if (syncActive()) {
    const syncing = state.library.filter((x) => x.state === "syncing");
    for (const it of state.library) {
      if (syncing.length >= MAX_PARALLEL) break;
      if (it.state === "remote") { it.state = "syncing"; it.progress = 0; syncing.push(it); }
    }
    for (const it of syncing) {
      it.progress = Math.min(1, it.progress + (t.mbps * TICK_MS) / 1000 / it.sizeMb);
      if (it.progress >= 1) it.state = "ready";
    }
  } else {
    // Off the LAN: in-flight files go back to waiting and resume later.
    for (const it of state.library) if (it.state === "syncing") it.state = "remote";
  }
  // Other clients mirror on their own (fake, steady).
  for (const c of state.mac.clients) {
    if (!c.self && tickCount % 6 === 0) c.done = Math.min(state.library.length, c.done + 1);
  }
  tickCount++;
  if (tickCount % (1000 / TICK_MS) === 0 && --state.mac.codeLeft <= 0) {
    state.mac.code = newPairCode();
    state.mac.codeLeft = PAIR_TTL_SEC;
  }
}
