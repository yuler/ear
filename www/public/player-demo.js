/* www/public/player-demo.js - High-Fidelity 3-Stage Walkthrough & Video Practice Demo */
(function() {
  const $ = (id) => document.getElementById(id);
  const state = window.state = window.state || {};
  state.step = 0;
  state.autoCycle = true;
  state.revealed = false;
  state.masked = true;
  state.isPlaying = false;
  state.speed = 1.0;

  // Strict helper: Chinese is the priority/default unless explicitly chosen
  const isEn = () => (window.state && window.state.lang === "en");

  let stepTimer = null;
  let dlInterval = null;
  let cursorTimer = null;

  // ── Virtual Mouse Cursor Controller ──
  function moveCursorTo(targetEl, offsetRight = 0.5, offsetBottom = 0.5, onArrived) {
    const cursor = $("virtual-cursor");
    const viewport = $("camera-viewport");
    if (!cursor || !viewport || !targetEl) {
      if (onArrived) onArrived();
      return;
    }

    const vpRect = viewport.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    const destX = tRect.left - vpRect.left + tRect.width * offsetRight;
    const destY = tRect.top - vpRect.top + tRect.height * offsetBottom;

    cursor.classList.remove("hidden");
    cursor.style.left = Math.round(destX) + "px";
    cursor.style.top = Math.round(destY) + "px";

    if (cursorTimer) clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      if (onArrived) onArrived();
    }, 700);
  }

  function clickCursor(targetEl, onDone) {
    const cursor = $("virtual-cursor");
    const rippleLayer = $("cursor-ripple-layer");
    if (cursor) cursor.classList.add("clicking");

    if (rippleLayer && cursor) {
      const ripple = document.createElement("div");
      ripple.className = "cursor-ripple";
      ripple.style.left = cursor.style.left;
      ripple.style.top = cursor.style.top;
      rippleLayer.appendChild(ripple);
      setTimeout(() => ripple.remove(), 550);
    }

    if (targetEl) {
      targetEl.classList.add("clicked");
      setTimeout(() => targetEl.classList.remove("clicked"), 280);
    }

    setTimeout(() => {
      if (cursor) cursor.classList.remove("clicking");
      if (onDone) onDone();
    }, 200);
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `00:${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  // ── 3-Step Animated Timeline Progress Bar ──
  function updateTimelineProgress(stepIdx, pct) {
    for (let i = 0; i < 3; i++) {
      const tab = $("step-tab-" + i);
      const fill = $("step-fill-" + i);
      if (!tab || !fill) continue;

      if (i < stepIdx) {
        tab.classList.remove("active");
        tab.classList.add("completed");
        fill.style.width = "100%";
      } else if (i === stepIdx) {
        tab.classList.add("active");
        tab.classList.remove("completed");
        fill.style.width = Math.min(100, Math.max(0, pct)) + "%";
      } else {
        tab.classList.remove("active");
        tab.classList.remove("completed");
        fill.style.width = "0%";
      }
    }
  }

  // ── Step State Machine & Camera Orchestration ──
  function setStep(idx, manual = false) {
    state.step = idx;
    clearAllTimers();

    if (manual) {
      pauseAutoCycle();
    }

    updateTimelineProgress(idx, 0);

    const cameraRig = $("camera-rig");
    if (cameraRig) {
      cameraRig.className = "camera-rig camera-step-" + idx;
    }

    for (let i = 0; i < 3; i++) {
      const pane = $("pane-" + i);
      if (pane) {
        if (i === idx) pane.classList.add("active");
        else pane.classList.remove("active");
      }
    }

    const video = $("practice-video");
    const videoWrapper = $("video-wrapper");

    if (idx === 0) {
      if (video) video.pause();
      if (videoWrapper) videoWrapper.classList.add("paused");
      runStep0Sequence();
    } else if (idx === 1) {
      if (video) video.pause();
      if (videoWrapper) videoWrapper.classList.add("paused");
      runStep1Sequence();
    } else if (idx === 2) {
      runStep2Sequence();
    }
  }

  function clearAllTimers() {
    if (stepTimer) clearTimeout(stepTimer);
    if (dlInterval) clearInterval(dlInterval);
    if (cursorTimer) clearTimeout(cursorTimer);
  }

  // ── Step 0: Safari YouTube -> Ear Ingest ──
  function runStep0Sequence() {
    const copyBtn = $("yt-copy-btn");
    const copyText = $("yt-copy-btn-text");
    const omniText = $("ear-omni-text");
    const parseCard = $("ear-parse-info");
    const confirmBtn = $("btn-confirm-dl");

    updateTimelineProgress(0, 15);

    if (copyBtn) copyBtn.classList.remove("copied");
    if (copyText) copyText.textContent = isEn() ? "Copy Link" : "复制视频链接";
    if (omniText) {
      omniText.classList.remove("active");
      omniText.textContent = isEn() ? "Paste YouTube link to start practice..." : "粘贴 YouTube 链接开始精听练习...";
    }
    if (parseCard) parseCard.classList.remove("active");

    if (!state.autoCycle) return;

    stepTimer = setTimeout(() => {
      moveCursorTo(copyBtn, 0.5, 0.5, () => {
        clickCursor(copyBtn, () => {
          if (copyBtn) copyBtn.classList.add("copied");
          if (copyText) copyText.textContent = isEn() ? "✓ Copied" : "✓ 链接已复制";
          updateTimelineProgress(0, 50);

          stepTimer = setTimeout(() => {
            if (omniText) {
              omniText.classList.add("active");
              omniText.textContent = "https://www.youtube.com/watch?v=jiHZqamCD8c";
            }
            if (parseCard) parseCard.classList.add("active");
            updateTimelineProgress(0, 75);

            stepTimer = setTimeout(() => {
              moveCursorTo(confirmBtn, 0.5, 0.5, () => {
                clickCursor(confirmBtn, () => {
                  updateTimelineProgress(0, 100);
                  stepTimer = setTimeout(() => {
                    setStep(1);
                  }, 350);
                });
              });
            }, 600);
          }, 450);
        });
      });
    }, 450);
  }

  // ── Step 1: Downbit-Style Active Download Row ──
  function runStep1Sequence() {
    const bar = $("dl-progress-bar");
    const colorThumb = $("dl-thumb-color");
    const stageText = $("dl-stage-text");
    const telemetry = $("dl-telemetry-text");
    const pctText = $("dl-percent-text");
    const completeAction = $("dl-complete-action");
    const playBtn = $("btn-start-play");

    if (bar) bar.style.width = "0%";
    if (colorThumb) colorThumb.style.width = "0%";
    if (pctText) pctText.textContent = "0%";
    if (completeAction) completeAction.classList.remove("active");
    if (stageText) stageText.textContent = isEn() ? "Starting background download…" : "Starting background download…";
    if (telemetry) telemetry.textContent = isEn() ? "Speed: 24.8 MB/s · ETA: 2s · 0 MB / 46.8 MB" : "速度: 24.8 MB/s · ETA: 2s · 0 MB / 46.8 MB";

    updateTimelineProgress(1, 0);

    let pct = 0;
    dlInterval = setInterval(() => {
      pct += Math.floor(Math.random() * 8) + 7;
      if (pct >= 100) {
        pct = 100;
        clearInterval(dlInterval);

        if (bar) bar.style.width = "100%";
        if (colorThumb) colorThumb.style.width = "100%";
        if (pctText) pctText.textContent = "100%";
        if (stageText) stageText.textContent = isEn() ? "✓ Download complete (142 units ready)" : "✓ 下载已完成 (共 142 句就绪)";
        if (telemetry) telemetry.textContent = isEn() ? "Complete · 46.8 MB / 46.8 MB · 1080p Full HD" : "下载完成 · 46.8 MB / 46.8 MB · 1080p Full HD";
        if (completeAction) completeAction.classList.add("active");
        updateTimelineProgress(1, 100);

        if (state.autoCycle && playBtn) {
          stepTimer = setTimeout(() => {
            moveCursorTo(playBtn, 0.5, 0.5, () => {
              clickCursor(playBtn, () => {
                stepTimer = setTimeout(() => {
                  setStep(2);
                }, 350);
              });
            });
          }, 350);
        }
      } else {
        if (bar) bar.style.width = pct + "%";
        if (colorThumb) colorThumb.style.width = pct + "%";
        if (pctText) pctText.textContent = pct + "%";
        updateTimelineProgress(1, pct);

        const mb = (46.8 * pct / 100).toFixed(1);
        if (pct < 40) {
          if (stageText) stageText.textContent = isEn() ? "⚡ 4-Thread range download (1080p stream)..." : "⚡ 4 线程并发拉取 1080p 音视频流...";
          if (telemetry) telemetry.textContent = `速度: 26.5 MB/s · ETA: 2s · ${mb} MB / 46.8 MB`;
        } else if (pct < 85) {
          if (stageText) stageText.textContent = isEn() ? "⚡ Range streams multiplexing & audio sync..." : "⚡ 4 线程极速拉取中 (音频 + CC 官方字幕)...";
          if (telemetry) telemetry.textContent = `速度: 32.4 MB/s · ETA: 1s · ${mb} MB / 46.8 MB`;
        } else {
          if (stageText) stageText.textContent = isEn() ? "⚡ FFmpeg processing & subtitle parsing (142 sentences)..." : "⚡ FFmpeg 极速封装与字幕解析 (共 142 句)...";
          if (telemetry) telemetry.textContent = `封装处理中 · ${mb} MB / 46.8 MB · ETA: 0s`;
        }
      }
    }, 90);
  }

  // ── Step 2: Practice Player with Box 2 Video Controls ──
  function runStep2Sequence() {
    const video = $("practice-video");
    const videoWrapper = $("video-wrapper");
    const playIcon = $("ctrl-play-icon");
    const maskBtn = $("ctrl-mask-btn");
    const repeatBtn = $("ctrl-repeat-btn");

    setSubtitleRevealed(false);
    updateTimelineProgress(2, 0);

    if (video) {
      video.currentTime = 0;
      video.muted = true;
      video.play().then(() => {
        state.isPlaying = true;
        if (videoWrapper) videoWrapper.classList.remove("paused");
        if (playIcon) playIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
      }).catch(() => {
        if (videoWrapper) videoWrapper.classList.add("paused");
      });
    }

    if (!state.autoCycle) return;

    // After 2.6s of blind listening, virtual cursor clicks mask to reveal
    stepTimer = setTimeout(() => {
      moveCursorTo(maskBtn, 0.5, 0.5, () => {
        clickCursor(maskBtn, () => {
          setSubtitleRevealed(true);

          // After 2.0s of reading revealed sentence, click repeat
          stepTimer = setTimeout(() => {
            moveCursorTo(repeatBtn, 0.5, 0.5, () => {
              clickCursor(repeatBtn, () => {
                if (video) video.currentTime = 0;

                // After repeating to near video end, cycle back to step 0
                stepTimer = setTimeout(() => {
                  setStep(0);
                }, 4000);
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
    const maskText = $("ctrl-mask-text");
    const maskLabel = $("mask-label");
    const maskIcon = $("mask-icon");

    if (box) {
      if (rev) box.classList.add("revealed");
      else box.classList.remove("revealed");
    }

    if (maskText) maskText.textContent = rev ? "已揭晓" : "遮罩";
    if (maskLabel) maskLabel.textContent = rev ? "字幕已揭晓" : "遮罩已开启";
    if (maskIcon) maskIcon.textContent = rev ? "👁️" : "🙈";
  }

  function togglePlayPause() {
    const video = $("practice-video");
    const videoWrapper = $("video-wrapper");
    const playIcon = $("ctrl-play-icon");
    if (!video) return;

    if (video.paused) {
      video.play().then(() => {
        state.isPlaying = true;
        if (videoWrapper) videoWrapper.classList.remove("paused");
        if (playIcon) playIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
      }).catch(() => {});
    } else {
      video.pause();
      state.isPlaying = false;
      if (videoWrapper) videoWrapper.classList.add("paused");
      if (playIcon) playIcon.innerHTML = `<polygon points="6 4 20 12 6 20 6 4"/>`;
    }
  }

  function pauseAutoCycle() {
    state.autoCycle = false;
    clearAllTimers();
    const cursor = $("virtual-cursor");
    if (cursor) cursor.classList.add("hidden");

    const pill = $("demo-play-btn");
    const icon = $("demo-play-icon");
    const label = $("auto-cycle-label");
    if (pill) pill.classList.add("paused");
    if (icon) icon.textContent = "▶";
    if (label) label.textContent = isEn() ? "Demo Paused (Click to Play)" : "演示已暂停 (点击播放)";
  }

  function resumeAutoCycle() {
    state.autoCycle = true;
    const cursor = $("virtual-cursor");
    if (cursor) cursor.classList.remove("hidden");

    const pill = $("demo-play-btn");
    const icon = $("demo-play-icon");
    const label = $("auto-cycle-label");
    if (pill) pill.classList.remove("paused");
    if (icon) icon.textContent = "⏸";
    if (label) label.textContent = isEn() ? "Auto Playing" : "自动演示中";

    setStep(state.step);
  }

  window.updateMockDemoLang = function() {
    const label = $("auto-cycle-label");
    if (label) {
      label.textContent = state.autoCycle
        ? (isEn() ? "Auto Playing" : "自动演示中")
        : (isEn() ? "Demo Paused (Click to Play)" : "演示已暂停 (点击播放)");
    }
  };

  function initAppMockup() {
    const root = $("how");
    if (!root) return;

    if (window.MOCK_WINDOW_HTML) {
      root.innerHTML = window.MOCK_WINDOW_HTML;
    }

    // Prominent Demo Play/Pause Capsule Toggle
    const playPill = $("demo-play-btn");
    if (playPill) {
      playPill.addEventListener("click", () => {
        if (state.autoCycle) pauseAutoCycle();
        else resumeAutoCycle();
      });
    }

    // Step Timeline Tab clicks
    document.querySelectorAll(".timeline-step").forEach((tab) => {
      tab.addEventListener("click", () => {
        const s = parseInt(tab.dataset.step, 10);
        setStep(s, true);
      });
    });

    // Video Events
    const video = $("practice-video");
    const fill = $("video-fill");
    const thumb = $("video-thumb");
    const curTime = $("video-cur-time");
    const totalTime = $("video-total-time");
    const track = $("video-track");

    if (video) {
      video.addEventListener("timeupdate", () => {
        const dur = video.duration || 10;
        const cur = video.currentTime;
        const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
        if (fill) fill.style.width = pct + "%";
        if (thumb) thumb.style.left = pct + "%";
        if (curTime) curTime.textContent = formatTime(cur);
        if (totalTime) totalTime.textContent = formatTime(dur);

        // Keep timeline progress synced in Step 2
        if (state.step === 2) {
          updateTimelineProgress(2, pct);
        }
      });

      video.addEventListener("ended", () => {
        if (state.autoCycle && state.step === 2) {
          stepTimer = setTimeout(() => setStep(0), 1200);
        }
      });
    }

    if (track && video) {
      track.addEventListener("click", (e) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = ratio * (video.duration || 10);
      });
    }

    // Controls Toolbar Listeners
    const playBtn = $("ctrl-play-btn");
    const centerBtn = $("video-center-btn");
    if (playBtn) playBtn.addEventListener("click", togglePlayPause);
    if (centerBtn) centerBtn.addEventListener("click", togglePlayPause);

    const repeatBtn = $("ctrl-repeat-btn");
    if (repeatBtn && video) {
      repeatBtn.addEventListener("click", () => {
        video.currentTime = 0;
        if (video.paused) togglePlayPause();
      });
    }

    const prevBtn = $("ctrl-prev-btn");
    if (prevBtn && video) {
      prevBtn.addEventListener("click", () => {
        video.currentTime = Math.max(0, video.currentTime - 2.5);
      });
    }

    const nextBtn = $("ctrl-next-btn");
    if (nextBtn && video) {
      nextBtn.addEventListener("click", () => {
        video.currentTime = Math.min(video.duration || 10, video.currentTime + 2.5);
      });
    }

    const speedBtn = $("ctrl-speed-btn");
    const speedText = $("ctrl-speed-text");
    if (speedBtn && video) {
      speedBtn.addEventListener("click", () => {
        if (state.speed === 1.0) state.speed = 1.2;
        else if (state.speed === 1.2) state.speed = 0.8;
        else state.speed = 1.0;
        video.playbackRate = state.speed;
        if (speedText) speedText.textContent = state.speed.toFixed(1) + "x";
      });
    }

    const muteBtn = $("ctrl-mute-btn");
    const muteIcon = $("ctrl-mute-icon");
    if (muteBtn && video) {
      muteBtn.addEventListener("click", () => {
        video.muted = !video.muted;
        if (muteIcon) muteIcon.textContent = video.muted ? "🔇" : "🔊";
      });
    }

    const maskBtn = $("ctrl-mask-btn");
    const headerMaskBtn = $("btn-mask-header");
    const sentenceCard = $("active-sentence-card");
    const toggleReveal = () => setSubtitleRevealed(!state.revealed);

    if (maskBtn) maskBtn.addEventListener("click", toggleReveal);
    if (headerMaskBtn) headerMaskBtn.addEventListener("click", toggleReveal);
    if (sentenceCard) sentenceCard.addEventListener("click", toggleReveal);

    const backBtn = $("player-back-step");
    if (backBtn) {
      backBtn.addEventListener("click", () => setStep(1, true));
    }

    // Step 0 & Step 1 Buttons
    const safariCopyBtn = $("yt-copy-btn");
    if (safariCopyBtn) {
      safariCopyBtn.addEventListener("click", () => {
        safariCopyBtn.classList.add("copied");
        const t = $("yt-copy-btn-text");
        if (t) t.textContent = "✓ 链接已复制";
        const omni = $("ear-omni-text");
        if (omni) {
          omni.classList.add("active");
          omni.textContent = "https://www.youtube.com/watch?v=jiHZqamCD8c";
        }
        const parse = $("ear-parse-info");
        if (parse) parse.classList.add("active");
        updateTimelineProgress(0, 75);
      });
    }

    const confirmDlBtn = $("btn-confirm-dl");
    if (confirmDlBtn) {
      confirmDlBtn.addEventListener("click", () => setStep(1, true));
    }

    const startPlayBtn = $("btn-start-play");
    if (startPlayBtn) {
      startPlayBtn.addEventListener("click", () => setStep(2, true));
    }

    // Start Step 0 sequence
    setStep(0);
  }

  window.initAppMockup = initAppMockup;
})();
