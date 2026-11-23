// Regression tests for the iOS prototype's pairing + mirror engine (spec: docs/mobile.md).
// Run: node --test prototypes/ios/*.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const FILES = ["ios-transport.js", "ios-i18n.js", "ios-sync.js", "ios-mac.js", "ios-player.js",
  "ios-transition.js", "ios-settings.js", "ios-scan.js", "ios-mvp.js"];
const sources = FILES.map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"));

function loadPrototype() {
  const elements = new Map();
  const timers = new Map();
  let nextTimer = 0;
  function element(id) {
    if (!elements.has(id)) {
      // Overlays start hidden, as in the HTML.
      const classes = new Set(["scanView", "settingsBackdrop", "homeScreen"].includes(id) ? ["hidden"] : []);
      elements.set(id, {
        textContent: "", innerHTML: "", style: {}, dataset: {},
        setAttribute() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          contains: (name) => classes.has(name),
          toggle(name, enabled) {
            if (enabled ?? !classes.has(name)) classes.add(name);
            else classes.delete(name);
          }
        }
      });
    }
    return elements.get(id);
  }
  const canvas = { getContext: () => ({ fillRect() {} }), toDataURL: () => "data:," };
  const context = vm.createContext({
    document: {
      getElementById: element,
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => canvas,
      documentElement: { dataset: {} }
    },
    matchMedia: () => ({ matches: false }),
    setTimeout: () => 0, // timers never fire on their own in these tests
    clearTimeout() {},
    setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); }
  });
  for (const src of sources) vm.runInContext(src, context);
  const run = (code) => vm.runInContext(code, context);
  // Permissions already granted unless a test says otherwise.
  run("state.perms.camera = 'granted'; state.perms.localNetwork = 'granted';");
  const p = {
    state: run("state"),
    run,
    element,
    click: (id) => element(id).onclick(),
    tick() { for (const fn of [...timers.values()]) fn(); },
    status: (id) => run(`phoneLibrary().find((x) => x.id === ${JSON.stringify(id)})?.status`),
    statuses: () => run("phoneLibrary().map((x) => x.status)").join(","),
    wifi(id) { p.state.wifi = id; },
    /** Joins the Mac's Wi-Fi and scans its QR (that alone pairs). */
    pairWith(macId) {
      p.wifi(run(`macById(${JSON.stringify(macId)}).network`));
      p.state.viewMac = macId;
      run("startScan(); scanSucceeded();");
    },
    /** Ticks until nothing is queued or transferring, or fails after `max` ticks. */
    settle(max = 2000) {
      for (let i = 0; i < max; i++) {
        if (run("syncStats().complete")) return i;
        p.tick();
      }
      assert.fail("mirror never completed");
    }
  };
  return p;
}

const syncingCount = (p) => p.run("phoneLibrary().filter((x) => x.status === 'syncing').length");
const HOME = ["krashen-ci", "bbc-habits", "podcast-42", "tokyo-walk"];
const OFFICE_ONLY = ["cities-loud", "small-talk", "news-slow"];

test("an unpaired phone mirrors nothing", () => {
  const p = loadPrototype();
  for (let i = 0; i < 20; i++) p.tick();
  assert.equal(p.state.pairs.length, 0);
  assert.equal(p.statuses(), "");
});

test("scanning the QR pairs at once (no confirm on the computer), then its library mirrors", () => {
  const p = loadPrototype();
  const code = p.run("macById('home').code");
  p.run("startScan(); scanSucceeded();");
  assert.equal(p.state.pairFlow, "done");
  assert.equal(p.state.pairs.join(), "home");
  assert.notEqual(p.run("macById('home').code"), code); // a used code is spent
  assert.equal(p.run("macById('home').clients[0].self"), true);
  p.settle();
  for (const id of HOME) assert.equal(p.status(id), "ready");
});

test("scanning a Mac on another Wi-Fi does not pair", () => {
  const p = loadPrototype();
  p.state.viewMac = "office"; // phone is on home Wi-Fi
  p.run("startScan(); scanSucceeded();");
  assert.equal(p.state.pairFlow, "error");
  assert.equal(p.state.pairs.length, 0);
  assert.equal(p.state.pairNotice.key, "notSameWifi");
  assert.match(p.run("noticeText(state.pairNotice)"), /不在同一个 Wi-Fi/);
});

test("scanning a computer that is already paired is a success, not an error", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.pairWith("home");
  assert.equal(p.state.pairFlow, "done");
  assert.equal(p.state.pairedAgain, true);
  assert.equal(p.state.pairs.join(), "home");
  assert.equal(p.run("macById('home').clients.length"), 1);
});

test("manual pairing: a nearby computer and its 4-digit code", () => {
  const p = loadPrototype();
  assert.equal(p.run("nearbyMacs().map((m) => m.id).join()"), "home");
  assert.equal(p.run("pairWithCode('home', '0000')"), false);
  assert.equal(p.state.pairNotice.key, "wrongCode");
  assert.equal(p.state.pairs.length, 0);
  assert.equal(p.run("pairWithCode('office', macById('office').code)"), false); // not on this Wi-Fi
  assert.equal(p.run("pairWithCode('home', macById('home').code)"), true);
  assert.equal(p.state.pairs.join(), "home");
});

test("without Local Network permission nothing is found or mirrored until it is granted", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.state.perms.localNetwork = "denied";
  for (let i = 0; i < 50; i++) p.tick();
  assert.equal(syncingCount(p), 0);
  assert.equal(p.run("nearbyMacs().length"), 0);
  p.state.perms.localNetwork = "granted";
  p.settle();
  for (const id of HOME) assert.equal(p.status(id), "ready");
});

test("permission prompts come before the camera: camera first, then Local Network", () => {
  const p = loadPrototype();
  p.state.perms.camera = "unknown";
  p.state.perms.localNetwork = "unknown";
  p.element("scanView").classList.remove("hidden");
  p.run("startScan(); nextPermission();");
  assert.equal(p.state.sysAlert, "camera");
  p.run("answerPermission(true)");
  assert.equal(p.state.sysAlert, "localNetwork");
  p.run("answerPermission(false)");
  assert.equal(p.state.sysAlert, null);
  assert.equal(p.state.perms.localNetwork, "denied");
  p.run("grantInSettings('localNetwork')");
  assert.equal(p.state.perms.localNetwork, "granted");
});

test("at most MAX_PARALLEL files transfer at once, across Macs", () => {
  const p = loadPrototype();
  p.pairWith("home");
  const max = p.run("MAX_PARALLEL");
  for (let i = 0; i < 200; i++) {
    p.tick();
    assert.ok(syncingCount(p) <= max);
  }
});

const interruptions = [
  {
    name: "background with background sync off",
    pause(p) { p.state.settings.backgroundSync = false; p.state.background = true; },
    resume(p) { p.state.background = false; }
  },
  { name: "leaving the Wi-Fi", pause: (p) => p.wifi("none"), resume: (p) => p.wifi("home") },
  { name: "unpair", pause: (p) => p.run("unpairMac('home', false)"), resume: (p) => p.pairWith("home") },
  { name: "removed on the Mac", pause: (p) => p.run("removeClient('home', 'self')"), resume: (p) => p.pairWith("home") }
];

for (const { name, pause, resume } of interruptions) {
  test(`${name} requeues in-flight transfers and finishes them after reconnect`, () => {
    const p = loadPrototype();
    p.pairWith("home");
    p.tick();
    assert.ok(syncingCount(p) > 0);
    pause(p);
    p.tick();
    assert.equal(syncingCount(p), 0);
    resume(p);
    p.settle();
    for (const id of HOME) assert.equal(p.status(id), "ready");
  });
}

test("one phone pairs with home and office; each mirrors only on its own Wi-Fi", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.pairWith("office");
  p.wifi("home");
  p.settle();
  for (const id of HOME) assert.equal(p.status(id), "ready");
  for (const id of OFFICE_ONLY) assert.equal(p.status(id), "away");

  p.wifi("office");
  p.settle();
  for (const id of [...HOME, ...OFFICE_ONLY]) assert.equal(p.status(id), "ready");
  assert.equal(p.run("Object.keys(state.items).length"), 7);
});

test("a video both Macs have is transferred once", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.settle();
  assert.equal(p.state.items["krashen-ci"].from, "home");
  p.pairWith("office");
  for (let i = 0; i < 300; i++) {
    p.tick();
    assert.equal(p.state.items["krashen-ci"].state, "ready");
  }
  assert.equal(p.state.items["krashen-ci"].from, "home");
  assert.equal(p.run("phoneLibrary().filter((x) => x.id === 'krashen-ci').length"), 1);
});

test("switching Wi-Fi mid-transfer resumes a shared video from the other Mac, keeping its bytes", () => {
  const p = loadPrototype();
  p.pairWith("office");
  p.pairWith("home");
  p.tick();
  p.tick();
  assert.equal(p.state.items["krashen-ci"].state, "syncing");
  assert.equal(p.state.items["krashen-ci"].from, "home");
  const done = p.state.items["krashen-ci"].progress;
  assert.ok(done > 0);
  p.wifi("office");
  p.tick();
  assert.equal(p.state.items["krashen-ci"].from, "office");
  assert.ok(p.state.items["krashen-ci"].progress > done); // resumed, not restarted
  p.settle();
  assert.equal(p.state.items["krashen-ci"].from, "office");
  assert.equal(p.status("krashen-ci"), "ready");
});

test("forgetting one Mac keeps its local copies and the other Mac", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.settle();
  p.pairWith("office");
  p.run("unpairMac('home', false)");
  assert.equal(p.state.pairs.join(), "office");
  for (const id of HOME) assert.equal(p.status(id), "ready");
  p.settle();
  for (const id of OFFICE_ONLY) assert.equal(p.status(id), "ready");
});

test("swipe-deleting a local copy keeps it out of the mirror until mirrored again", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.settle();
  p.run("deleteLocal('tokyo-walk')");
  for (let i = 0; i < 100; i++) p.tick();
  assert.equal(p.status("tokyo-walk"), "removed");
  assert.equal(p.run("syncStats().complete"), true);
  p.run("mirrorAgain('tokyo-walk')");
  p.settle();
  assert.equal(p.status("tokyo-walk"), "ready");
});

test("a video added on a Mac while away mirrors after coming back", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.wifi("none");
  p.click("simAddMacBtn");
  const added = p.run("macById('home').library[0]");
  assert.equal(p.status(added), "away");
  p.wifi("home");
  p.settle();
  assert.equal(p.status(added), "ready");
});

test("several clients pair to the same Mac", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.click("simClientBtn");
  p.click("simClientBtn");
  assert.equal(p.run("macById('home').clients.length"), 3);
  p.run("removeClient('home', 'iPad mini')");
  assert.equal(p.run("macById('home').clients.map((c) => c.name).join()"), "这台 iPhone,Pixel 8");
  assert.equal(p.state.pairs.join(), "home");
});

test("background sync on keeps mirroring while the app is in the background", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.state.background = true;
  p.settle();
  for (const id of HOME) assert.equal(p.status(id), "ready");
});

test("a successful pairing ends in the done step, ready for the scanner to close", () => {
  const p = loadPrototype();
  p.pairWith("home");
  assert.equal(p.state.pairFlow, "done");
  p.run("closeScan()");
  assert.equal(p.state.pairFlow, "idle");
  assert.equal(p.state.pairs.join(), "home");
});

test("notices follow the interface language", () => {
  const p = loadPrototype();
  p.state.viewMac = "office";
  p.run("startScan(); scanSucceeded();");
  p.state.settings.lang = "en";
  assert.match(p.run("noticeText(state.pairNotice)"), /not on the same Wi-Fi/);
});

test("leaving the Wi-Fi keeps partial bytes and resumes from them", () => {
  const p = loadPrototype();
  p.pairWith("home");
  for (let i = 0; i < 3; i++) p.tick();
  const id = p.run("phoneLibrary().find((x) => x.status === 'syncing').id");
  const before = p.state.items[id].progress;
  p.wifi("none");
  p.tick();
  assert.equal(p.state.items[id].state, "partial");
  assert.equal(p.state.items[id].progress, before);
  assert.equal(p.status(id), "away");
  p.wifi("home");
  p.tick();
  assert.ok(p.state.items[id].progress > before);
});

test("a tapped video goes first, taking a slot from a non-priority transfer", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.tick();
  assert.equal(syncingCount(p), 3);
  assert.equal(p.status("tokyo-walk"), "queued");
  p.run("prioritize('tokyo-walk')");
  p.tick();
  assert.equal(p.status("tokyo-walk"), "syncing");
  assert.equal(syncingCount(p), 3);
  assert.equal(p.run("Object.values(state.items).filter((x) => x.state === 'partial').length"), 1);
  p.settle();
  assert.equal(p.state.priority.length, 0);
});

test("undoing a delete brings the local copy back", () => {
  const p = loadPrototype();
  p.pairWith("home");
  p.settle();
  p.run("deleteWithUndo('bbc-habits')");
  assert.equal(p.status("bbc-habits"), "removed");
  p.run("state.toast.undo()");
  assert.equal(p.status("bbc-habits"), "ready");
});

test("a paired computer with no videos shows its own empty state, not the pairing entry", () => {
  const p = loadPrototype();
  p.run("macById('home').library = []");
  p.pairWith("home");
  p.run("renderLibrary()");
  assert.match(p.element("libraryList").innerHTML, /电脑上还没有视频/);
  assert.doesNotMatch(p.element("libraryList").innerHTML, /open-scan/);
});
