const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Run the production scripts against a small DOM and deterministic timer queue.
function demo({ reducedMotion = false, observer = true } = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      const classes = new Set();
      elements.set(id, {
        dataset: {}, style: { setProperty() {} },
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
        },
        setAttribute() {},
        addEventListener(type, fn) { listeners.set(type, fn); },
        click() { listeners.get('click')?.(); },
      });
    }
    return elements.get(id);
  }
  const tabs = [0, 1, 2].map((step) => {
    const tab = element(`step-tab-${step}`);
    tab.dataset.step = String(step);
    return tab;
  });
  const video = element('practice-video');
  Object.assign(video, {
    paused: true, currentTime: 0, duration: 10,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  });
  const events = new Map();
  const document = {
    hidden: false,
    getElementById: element,
    querySelectorAll: () => tabs,
    addEventListener(type, fn) { events.set(type, fn); },
  };
  const timers = [];
  let intersection;
  let observerOptions;
  const window = {
    matchMedia: () => ({ matches: reducedMotion }),
    EarDemoFx: {
      later(fn) { timers.push(fn); },
      clearTimers() { timers.length = 0; },
      hideCursor() {}, placeCursor() {},
      moveCursorTo(_el, fn) { fn(); },
      clickCursor(_el, fn) { fn(); },
    },
  };
  if (observer) {
    window.IntersectionObserver = class {
      constructor(fn, options) { intersection = fn; observerOptions = options; }
      observe(root) { assert.equal(root, element('how')); }
    };
  }
  const context = vm.createContext({ window, document, IntersectionObserver: window.IntersectionObserver });
  for (const file of ['player-controls.js', 'player-demo.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'), context);
  }
  window.initAppMockup();
  return {
    window, video, timers, element, observerOptions,
    visible(ratio) { intersection([{ intersectionRatio: ratio, isIntersecting: ratio > 0 }]); },
    hidden(value) { document.hidden = value; events.get('visibilitychange')(); },
    reachPractice() {
      for (let i = 0; i < 100 && window.state.step !== 2; i++) {
        assert.ok(timers.length, 'tour should have a pending transition');
        timers.shift()();
      }
      assert.equal(window.state.step, 2);
      assert.equal(video.paused, false);
    },
  };
}

test('initial observation below 35% does not start autoplay', () => {
  const d = demo();
  assert.equal(d.observerOptions.threshold, 0.35);
  d.visible(0.2);
  assert.equal(d.timers.length, 0);
  assert.equal(d.video.paused, true);
});

test('crossing the 35% boundary stops and restarts the tour', () => {
  const d = demo();
  d.visible(0.35);
  assert.ok(d.timers.length);
  d.reachPractice();
  d.visible(0.2);
  assert.equal(d.video.paused, true);
  assert.equal(d.timers.length, 0);
  d.visible(0.5);
  assert.equal(d.video.paused, false);
  assert.equal(d.timers.length, 1);
  d.visible(0.6);
  assert.equal(d.timers.length, 1, 'no duplicate tour on repeated live observation');
});

test('manual pause at step three suspends video and clears timers', () => {
  const d = demo();
  d.visible(1);
  d.reachPractice();
  d.element('demo-play-btn').click();
  assert.equal(d.window.state.autoCycle, false);
  assert.equal(d.video.paused, true);
  assert.equal(d.timers.length, 0);
});

for (const suspension of ['hidden', 'offscreen']) {
  for (const manualControl of ['ctrl-play-btn', 'video-center-btn', 'ctrl-repeat-btn']) {
    test(`${suspension} suspends ${manualControl} playback while tour is paused`, () => {
      const d = demo();
      d.visible(1);
      d.reachPractice();
      d.element('demo-play-btn').click();
      // Start from paused media independently of the tour-pause regression.
      d.window.EarDemoVideo.pauseVideo();
      d.element(manualControl).click();
      assert.equal(d.video.paused, false, 'manual playback should still work');
      if (suspension === 'hidden') d.hidden(true);
      else d.visible(0.2);
      assert.equal(d.video.paused, true);
      assert.equal(d.timers.length, 0);
      if (suspension === 'hidden') d.hidden(false);
      else d.visible(1);
      assert.equal(d.video.paused, true, 'visibility must not re-enable a paused tour');
      assert.equal(d.window.state.autoCycle, false);
    });
  }
}

test('manual navigation to practice also suspends when tab hides', () => {
  const d = demo();
  d.visible(1);
  d.element('step-tab-2').click();
  assert.equal(d.window.state.autoCycle, false);
  assert.equal(d.video.paused, false);
  d.hidden(true);
  assert.equal(d.video.paused, true);
});

test('hidden autoplay resumes only when tab and demo are both visible', () => {
  const d = demo();
  d.visible(1);
  d.reachPractice();
  d.hidden(true);
  assert.equal(d.video.paused, true);
  assert.equal(d.timers.length, 0);
  d.visible(0.1);
  d.hidden(false);
  assert.equal(d.video.paused, true);
  assert.equal(d.timers.length, 0);
  d.visible(0.35);
  assert.equal(d.video.paused, false);
  assert.equal(d.timers.length, 1);
});

test('reduced motion keeps the tour paused until explicitly resumed', () => {
  const d = demo({ reducedMotion: true });
  d.visible(1);
  assert.equal(d.window.state.autoCycle, false);
  assert.equal(d.timers.length, 0);
  d.element('demo-play-btn').click();
  assert.equal(d.window.state.autoCycle, true);
  assert.equal(d.timers.length, 1);
});

test('without IntersectionObserver the tab visibility gate still applies', () => {
  const d = demo({ observer: false });
  assert.equal(d.timers.length, 1);
  d.hidden(true);
  assert.equal(d.timers.length, 0);
  d.hidden(false);
  assert.equal(d.timers.length, 1);
});
