const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const FILES = ["ios-transport.js", "ios-sync.js", "ios-mac.js", "ios-mvp.js"];
const sources = FILES.map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"));

function loadPrototype() {
  const elements = new Map();
  const timers = new Map();
  let nextTimer = 0;
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
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
      createElement: () => canvas,
      documentElement: { dataset: {} }
    },
    matchMedia: () => ({ matches: false }),
    setTimeout: (fn) => fn(),
    setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); }
  });
  for (const src of sources) vm.runInContext(src, context);
  const run = (code) => vm.runInContext(code, context);
  const p = {
    state: run("state"),
    run,
    element,
    click: (id) => element(id).onclick(),
    tick() { for (const fn of [...timers.values()]) fn(); },
    item: (id) => p.state.library.find((x) => x.id === id),
    pair() { run("startScan(); scanSucceeded(); answerPair(true);"); },
    /** Ticks until every wanted item is local, or fails after `max` ticks. */
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

const syncing = (p) => p.state.library.filter((x) => x.state === "syncing");

test("an unpaired phone mirrors nothing", () => {
  const p = loadPrototype();
  for (let i = 0; i < 20; i++) p.tick();
  assert.equal(p.state.pair, null);
  assert.ok(p.state.library.every((x) => x.state === "remote"));
});

test("pairing needs the Mac to allow it, then the whole library mirrors", () => {
  const p = loadPrototype();
  p.run("startScan(); scanSucceeded();");
  assert.equal(p.state.mac.request, true);
  p.tick();
  assert.equal(syncing(p).length, 0);
  p.run("answerPair(true)");
  assert.equal(p.state.pair.address, "192.168.1.42:7890");
  assert.equal(p.state.mac.clients[0].self, true);
  p.settle();
  assert.ok(p.state.library.every((x) => x.state === "ready"));
});

test("a refused pairing leaves the phone unpaired", () => {
  const p = loadPrototype();
  p.run("startScan(); scanSucceeded(); answerPair(false);");
  assert.equal(p.state.pair, null);
  assert.equal(p.state.pairFlow, "idle");
  assert.match(p.state.pairNotice, /拒绝/);
});

test(`at most MAX_PARALLEL files transfer at once`, () => {
  const p = loadPrototype();
  p.pair();
  const max = p.run("MAX_PARALLEL");
  for (let i = 0; i < 200; i++) {
    p.tick();
    assert.ok(syncing(p).length <= max);
  }
});

const interruptions = [
  { name: "offline mode", pause: (p) => p.click("offlineToggle"), resume: (p) => p.click("offlineToggle") },
  { name: "LAN disconnect", pause: (p) => p.click("simLanBtn"), resume: (p) => p.click("simLanBtn") },
  { name: "unpair", pause: (p) => p.run("unpairSelf(false)"), resume: (p) => p.pair() },
  { name: "removed on the Mac", pause: (p) => p.run('removeClient("self")'), resume: (p) => p.pair() }
];

for (const { name, pause, resume } of interruptions) {
  test(`${name} requeues in-flight transfers and finishes them after reconnect`, () => {
    const p = loadPrototype();
    p.pair();
    p.tick();
    const inFlight = syncing(p).map((x) => x.id);
    assert.ok(inFlight.length > 0);
    pause(p);
    p.tick();
    assert.equal(syncing(p).length, 0);
    for (const id of inFlight) assert.equal(p.item(id).state, "remote");
    resume(p);
    p.settle();
    assert.ok(p.state.library.every((x) => x.state === "ready"));
  });
}

test("swipe-deleting a local copy keeps it out of the mirror until mirrored again", () => {
  const p = loadPrototype();
  p.pair();
  p.settle();
  p.run('deleteLocal("small-talk")');
  for (let i = 0; i < 100; i++) p.tick();
  assert.equal(p.item("small-talk").state, "removed");
  assert.equal(p.run("syncStats().complete"), true);
  p.run('mirrorAgain("small-talk")');
  p.settle();
  assert.equal(p.item("small-talk").state, "ready");
});

test("a video added on the Mac while disconnected mirrors after reconnect", () => {
  const p = loadPrototype();
  p.pair();
  p.tick();
  p.click("simLanBtn");
  p.click("simAddMacBtn");
  p.click("simLanBtn");
  p.settle();
  assert.equal(p.state.library.length, 7);
  assert.ok(p.state.library.every((x) => x.state === "ready"));
});

test("several clients pair to the same Mac", () => {
  const p = loadPrototype();
  p.pair();
  p.click("simClientBtn");
  p.click("simClientBtn");
  assert.equal(p.state.mac.clients.length, 3);
  p.run('removeClient("iPad mini")');
  assert.equal(p.state.mac.clients.map((c) => c.name).join(","), "这台 iPhone,Pixel 8");
  assert.notEqual(p.state.pair, null);
});

test("unpairing keeps finished local copies playable", () => {
  const p = loadPrototype();
  p.pair();
  p.settle();
  p.run("unpairSelf(false)");
  assert.ok(p.state.library.every((x) => x.state === "ready"));
});
