/* www/public/player-demo.js - 3-step walkthrough state machine for the hero demo.
   Cursor + timers: /player-cursor.js · Video controls: /player-controls.js */
(function() {
  const $ = (id) => document.getElementById(id);
  const fx = window.EarDemoFx;
  const vid = window.EarDemoVideo;
  const state = window.state = window.state || {};
  Object.assign(state, { step: 0, autoCycle: true, revealed: false, isPlaying: false, speed: 1.0 });

  // Chinese is the default unless explicitly chosen
  const isEn = () => state.lang === "en";
  const t = (zh, en) => (isEn() ? en : zh);
  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // The loop only runs while the demo is on screen and the tab is visible.
  let inView = false;
  let wasLive = false;
  const isLive = () => state.autoCycle && inView && !document.hidden;

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  // ── 3-step timeline (scaleX fills, no layout) ──
  function updateTimeline(stepIdx, pct) {
    for (let i = 0; i < 3; i++) {
      const tab = $("step-tab-" + i);
      const fill = $("step-fill-" + i);
      if (!tab || !fill) continue;
      tab.classList.toggle("active", i === stepIdx);
      tab.classList.toggle("completed", i < stepIdx);
      const p = i < stepIdx ? 1 : i === stepIdx ? Math.min(100, Math.max(0, pct)) / 100 : 0;
      fill.style.transform = `scaleX(${p})`;
    }
  }

  function clearAllTimers() {
    fx.clearTimers();
    const cursor = $("virtual-cursor");
    if (cursor) cursor.classList.remove("clicking");
  }

  function setStep(idx, manual = false) {
    state.step = idx;
    clearAllTimers();
    if (manual && state.autoCycle) pauseAutoCycle();

    updateTimeline(idx, 0);
    for (let i = 0; i < 3; i++) {
      const pane = $("pane-" + i);
      if (!pane) continue;
      pane.classList.toggle("active", i === idx);
      if (i === idx) pane.scrollTop = 0;
    }
    if (idx !== 2) vid.pauseVideo();

    const live = isLive();
    if (idx === 0) {
      resetStep0();
      if (live) autoStep0();
    } else if (idx === 1) {
      resetStep1();
      if (live) autoStep1();
    } else {
      setSubtitleRevealed(false);
      if (live || manual) vid.playVideo(true);
      if (live) autoStep2();
    }
  }

  // ── Step 0: copy the YouTube link ──
  function resetStep0() {
    const copyBtn = $("yt-copy-btn");
    const toast = $("safari-toast");
    if (copyBtn) copyBtn.classList.remove("copied");
    if (toast) toast.classList.remove("active");
    setText("yt-copy-btn-text", t("复制视频链接", "Copy Video Link"));
    setText("safari-toast-text", t(
      "在 YouTube 任意视频页面复制链接，打开 Ear 即可自动读取剪贴板！",
      "Browse any YouTube video, copy link, and Ear will auto-read it!"
    ));
    updateTimeline(0, 20);
  }

  function markCopied() {
    const copyBtn = $("yt-copy-btn");
    const toast = $("safari-toast");
    if (copyBtn) copyBtn.classList.add("copied");
    if (toast) toast.classList.add("active");
    setText("yt-copy-btn-text", t("✓ 已复制到剪贴板", "✓ Copied to Clipboard"));
    setText("safari-toast-text", t(
      "✓ 链接已写入系统剪贴板！正在打开 Ear 自动读取...",
      "✓ Link copied! Switching to Ear to auto-read clipboard..."
    ));
    updateTimeline(0, 100);
  }

  function autoStep0() {
    const copyBtn = $("yt-copy-btn");
    fx.later(() => {
      fx.moveCursorTo(copyBtn, () => {
        fx.clickCursor(copyBtn, () => {
          markCopied();
          fx.later(() => setStep(1), 850);
        });
      });
    }, 550);
  }

  // ── Step 1: clipboard ingest + download ──
  function setDownload(pct) {
    const row = $("active-dl-row");
    if (row) row.style.setProperty("--p", pct / 100);
    setText("dl-percent-text", pct + "%");
  }

  function resetStep1() {
    const confirmBtn = $("btn-confirm-dl");
    const completeAction = $("dl-complete-action");
    if (confirmBtn) confirmBtn.classList.remove("clicked");
    if (completeAction) completeAction.classList.remove("active");
    setDownload(0);
    setText("dl-stage-text", t("⚡ 4 线程并发分块下载音视频流...", "⚡ Preparing 4-thread parallel stream..."));
    setText("dl-telemetry-text", t("速度", "Speed") + ": 28.5 MB/s · ETA: 1s · 0 MB / 46.8 MB");
    updateTimeline(1, 15);
  }

  function downloadText(pct) {
    const mb = (46.8 * pct / 100).toFixed(1);
    if (pct < 40) {
      setText("dl-stage-text", t("⚡ 4 线程并发拉取 1080p 音视频流...", "⚡ 4-Thread range download (1080p stream)..."));
      setText("dl-telemetry-text", `${t("速度", "Speed")}: 28.5 MB/s · ETA: 1s · ${mb} MB / 46.8 MB`);
    } else if (pct < 85) {
      setText("dl-stage-text", t("⚡ 4 线程极速并发拉取 (音频 + CC 官方字幕)...", "⚡ Range streams multiplexing & audio sync..."));
      setText("dl-telemetry-text", `${t("速度", "Speed")}: 34.2 MB/s · ETA: 1s · ${mb} MB / 46.8 MB`);
    } else {
      setText("dl-stage-text", t("⚡ FFmpeg 极速封装与字幕解析 (共 142 句)...", "⚡ FFmpeg processing & subtitle parsing (142 sentences)..."));
      setText("dl-telemetry-text", `${t("封装处理中", "Muxing")} · ${mb} MB / 46.8 MB · ETA: 0s`);
    }
  }

  function startDownload(onDone) {
    const confirmBtn = $("btn-confirm-dl");
    if (confirmBtn) confirmBtn.classList.add("clicked");
    updateTimeline(1, 30);

    let pct = 0;
    const tick = () => {
      pct = Math.min(100, pct + Math.floor(Math.random() * 8) + 8);
      setDownload(pct);
      if (pct < 100) {
        downloadText(pct);
        updateTimeline(1, 30 + Math.floor(pct * 0.7));
        fx.later(tick, 85);
        return;
      }
      setText("dl-stage-text", t("✓ 下载已完成 (共 142 句就绪)", "✓ Download complete (142 units ready)"));
      setText("dl-telemetry-text", t("下载完成", "Complete") + " · 46.8 MB / 46.8 MB · 1080p Full HD");
      const completeAction = $("dl-complete-action");
      if (completeAction) completeAction.classList.add("active");
      updateTimeline(1, 100);
      if (onDone) onDone();
    };
    fx.later(tick, 85);
  }

  function autoStep1() {
    const confirmBtn = $("btn-confirm-dl");
    const playBtn = $("btn-start-play");
    fx.later(() => {
      fx.moveCursorTo(confirmBtn, () => {
        fx.clickCursor(confirmBtn, () => {
          startDownload(() => {
            fx.later(() => {
              fx.moveCursorTo(playBtn, () => {
                fx.clickCursor(playBtn, () => fx.later(() => setStep(2), 350));
              });
            }, 400);
          });
        });
      });
    }, 450);
  }

  // ── Step 2: blind listen → reveal → repeat ──
  function autoStep2() {
    const maskBtn = $("ctrl-mask-btn");
    const repeatBtn = $("ctrl-repeat-btn");
    const video = $("practice-video");
    fx.later(() => {
      fx.moveCursorTo(maskBtn, () => {
        fx.clickCursor(maskBtn, () => {
          setSubtitleRevealed(true);
          fx.later(() => {
            fx.moveCursorTo(repeatBtn, () => {
              fx.clickCursor(repeatBtn, () => {
                if (video) video.currentTime = 0;
                fx.later(() => setStep(0), 4000);
              });
            });
          }, 2000);
        });
      });
    }, 2600);
  }

  function setSubtitleRevealed(rev) {
    state.revealed = rev;
    const box = $("s-caption-box");
    if (box) box.classList.toggle("revealed", rev);
    setText("ctrl-mask-text", rev ? t("已揭晓", "Revealed") : t("遮罩", "Mask"));
    setText("mask-label", rev ? t("字幕已揭晓", "Subtitles shown") : t("遮罩已开启", "Subtitles masked"));
    setText("mask-icon", rev ? "👁️" : "🙈");
  }

  // ── Play / pause pill ──
  function renderPill() {
    const pill = $("demo-play-btn");
    if (pill) {
      pill.classList.toggle("paused", !state.autoCycle);
      pill.setAttribute("aria-pressed", state.autoCycle ? "true" : "false");
    }
    setText("demo-play-icon", state.autoCycle ? "⏸" : "▶");
    setText("auto-cycle-label", state.autoCycle
      ? t("自动演示中", "Auto Playing")
      : t("演示已暂停 (点击播放)", "Demo Paused (Click to Play)"));
  }

  function pauseAutoCycle() {
    state.autoCycle = false;
    wasLive = false;
    clearAllTimers();
    fx.hideCursor(true);
    renderPill();
  }

  function resumeAutoCycle() {
    state.autoCycle = true;
    renderPill();
    onLiveChange();
  }

  // Start/stop the loop as the demo scrolls in/out of view or the tab is hidden.
  function onLiveChange() {
    const live = isLive();
    if (live === wasLive) return;
    wasLive = live;
    if (live) {
      fx.hideCursor(false);
      setStep(state.step);
    } else {
      clearAllTimers();
      vid.pauseVideo();
    }
  }

  window.updateMockDemoLang = function() {
    renderPill();
    setStep(state.step);
  };

  function initAppMockup() {
    const root = $("how");
    if (!root) return;
    if (window.MOCK_WINDOW_HTML) root.innerHTML = window.MOCK_WINDOW_HTML;

    const on = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener("click", fn);
    };

    on("demo-play-btn", () => (state.autoCycle ? pauseAutoCycle() : resumeAutoCycle()));

    document.querySelectorAll(".timeline-step").forEach((tab) => {
      tab.addEventListener("click", () => setStep(parseInt(tab.dataset.step, 10), true));
    });

    vid.bindVideoControls(
      (pct) => { if (state.step === 2) updateTimeline(2, pct); },
      () => setSubtitleRevealed(!state.revealed)
    );

    on("player-back-step", () => setStep(1, true));
    on("yt-copy-btn", () => {
      if (state.autoCycle) pauseAutoCycle();
      markCopied();
      fx.later(() => setStep(1, true), 600);
    });
    on("btn-confirm-dl", () => {
      if (state.autoCycle) pauseAutoCycle();
      resetStep1();
      startDownload(null);
    });
    on("btn-start-play", () => setStep(2, true));

    if (reduceMotion) state.autoCycle = false;
    fx.placeCursor(200, 50, 0);
    fx.hideCursor(true);
    renderPill();
    setStep(0);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
        onLiveChange();
      }, { threshold: 0.35 }).observe(root);
    } else {
      inView = true;
      onLiveChange();
    }
    document.addEventListener("visibilitychange", onLiveChange);
  }

  window.initAppMockup = initAppMockup;
})();
