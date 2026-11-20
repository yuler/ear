const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "ios-mvp.js"), "utf8");

function loadPrototype() {
  const elements = new Map();
  const timers = new Map();
  let nextTimer = 0;
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        textContent: "", innerHTML: "", style: {},
        setAttribute() {},
        querySelectorAll: () => [],
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          toggle(name, enabled) {
            if (enabled ?? !classes.has(name)) classes.add(name);
            else classes.delete(name);
          }
        }
      });
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element },
    setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); }
  });
  vm.runInContext(source, context);
  return {
    state: vm.runInContext("state", context),
    click: (id) => element(id).onclick(),
    stop: () => vm.runInContext("stopAutoSync()", context),
    tick() { for (const fn of [...timers.values()]) fn(); },
    element, timers
  };
}

const interruptions = [
  { name: "offline mode", pause: (p) => p.click("offlineToggle"), resume: (p) => p.click("offlineToggle") },
  { name: "LAN disconnect", pause: (p) => p.click("simLanBtn"), resume: (p) => p.click("simLanBtn") },
  { name: "top-bar unpair", pause: (p) => p.click("simPairBtn"), resume: (p) => p.click("simPairBtn") },
  ...["sheetAirDropBtn", "manualPairBtn"].map((button) => ({
    name: `sheet unpair and ${button}`,
    pause(p) { p.click("pairEntryBtn"); p.click("unpairBtn"); },
    resume: (p) => p.click(button)
  }))
];

for (const { name, pause, resume } of interruptions) {
  test(`${name} requeues the interrupted item and finishes it after reconnect`, () => {
    const p = loadPrototype();
    const item = p.state.library.find((x) => x.id === "podcast-42");
    p.tick();
    assert.equal(item.state, "syncing");
    assert.ok(p.state.syncProgress > 8);
    pause(p);
    assert.equal(item.state, "remote");
    assert.equal(p.state.syncingId, null);
    assert.equal(p.state.syncProgress, 0);
    assert.equal(p.timers.size, 0);
    assert.ok(p.state.library.filter((x) => x.id !== item.id).every((x) => x.state === "ready"));
    resume(p);
    assert.equal(p.state.syncingId, item.id);
    assert.equal(item.state, "syncing");
    assert.match(p.element("syncTitle").textContent, /同步中/);
    for (let i = 0; i < 6; i++) p.tick();
    assert.equal(item.state, "ready");
    assert.equal(p.state.syncingId, null);
    assert.equal(p.timers.size, 0);
    assert.ok(p.state.library.every((x) => x.state === "ready"));
    assert.match(p.element("syncTitle").textContent, /已与 MacBook Pro 同步/);
    assert.doesNotMatch(p.element("libraryList").innerHTML, /badge syncing/);
  });
}

test("uninterrupted synchronization completes normally", () => {
  const p = loadPrototype();
  for (let i = 0; i < 6; i++) p.tick();
  assert.ok(p.state.library.every((x) => x.state === "ready"));
  assert.equal(p.timers.size, 0);
});

test("repeated stops remain idempotent and ready items are not downgraded", () => {
  const p = loadPrototype();
  p.stop();
  p.stop();
  assert.equal(p.state.library.find((x) => x.id === "podcast-42").state, "remote");
  assert.equal(p.timers.size, 0);
  p.state.syncingId = "krashen-ci";
  p.stop();
  assert.equal(p.state.library.find((x) => x.id === "krashen-ci").state, "ready");
});

test("a lesson added while disconnected does not strand the interrupted item", () => {
  const p = loadPrototype();
  p.tick();
  p.click("simLanBtn");
  p.click("simAddMacBtn");
  p.click("simLanBtn");
  for (let i = 0; i < 12; i++) p.tick();
  assert.equal(p.state.library.length, 4);
  assert.ok(p.state.library.every((x) => x.state === "ready"));
  assert.equal(p.timers.size, 0);
});
