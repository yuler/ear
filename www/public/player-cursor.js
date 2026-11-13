/* www/public/player-cursor.js - Demo timers + virtual cursor (transform-only motion) */
(function() {
  const $ = (id) => document.getElementById(id);
  const timers = new Set();
  const pos = { x: 200, y: 50 };

  // Every demo timeout goes through later() so clearTimers() can cancel all of them.
  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.clear();
  }

  function placeCursor(x, y, ms) {
    const cursor = $("virtual-cursor");
    if (!cursor) return;
    pos.x = x;
    pos.y = y;
    cursor.style.transitionDuration = ms + "ms, 200ms";
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function hideCursor(hidden) {
    const cursor = $("virtual-cursor");
    if (cursor) cursor.classList.toggle("hidden", hidden);
  }

  // Scroll a target into view inside its scrollable stage pane (small screens).
  function revealInPane(targetEl) {
    const pane = targetEl.closest(".stage-pane");
    if (!pane) return false;
    const p = pane.getBoundingClientRect();
    const t = targetEl.getBoundingClientRect();
    if (t.top >= p.top + 8 && t.bottom <= p.bottom - 8) return false;
    const top = pane.scrollTop + (t.top - p.top) - (p.height - t.height) / 2;
    pane.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    return true;
  }

  function moveCursorTo(targetEl, onArrived) {
    const viewport = $("camera-viewport");
    if (!viewport || !targetEl) {
      if (onArrived) onArrived();
      return;
    }

    const go = () => {
      const vp = viewport.getBoundingClientRect();
      const t = targetEl.getBoundingClientRect();
      const x = Math.round(t.left - vp.left + t.width * 0.5);
      const y = Math.round(t.top - vp.top + t.height * 0.5);
      // Duration scales with travel distance so short hops don't feel sluggish.
      const dist = Math.hypot(x - pos.x, y - pos.y);
      const ms = Math.round(Math.min(900, Math.max(380, 300 + dist * 0.9)));
      hideCursor(false);
      placeCursor(x, y, ms);
      later(() => {
        if (onArrived) onArrived();
      }, ms + 80);
    };

    if (revealInPane(targetEl)) later(go, 350);
    else go();
  }

  function clickCursor(targetEl, onDone) {
    const cursor = $("virtual-cursor");
    const rippleLayer = $("cursor-ripple-layer");
    if (cursor) cursor.classList.add("clicking");

    if (rippleLayer) {
      const ripple = document.createElement("div");
      ripple.className = "cursor-ripple";
      ripple.style.setProperty("--x", pos.x + "px");
      ripple.style.setProperty("--y", pos.y + "px");
      ripple.addEventListener("animationend", () => ripple.remove());
      rippleLayer.appendChild(ripple);
    }

    if (targetEl) targetEl.classList.add("clicked");

    later(() => {
      if (cursor) cursor.classList.remove("clicking");
      if (onDone) onDone();
    }, 200);
    later(() => {
      if (targetEl) targetEl.classList.remove("clicked");
    }, 280);
  }

  window.EarDemoFx = { later, clearTimers, moveCursorTo, clickCursor, hideCursor, placeCursor };
})();
