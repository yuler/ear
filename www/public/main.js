/* www/public/main.js - Ear Landing Page Interactivity */

const state = {
  theme: localStorage.getItem("ear_theme") || "dark",
  lang: localStorage.getItem("ear_lang") || "zh",
  step: 0,
  autoCycle: true,
  cycleTimer: null,
  revealed: false,
  rate: 1.0,
  scores: { pass: 14, lag: 3, blind: 2 },
};

const $ = (id) => document.getElementById(id);

const OS_ICONS = {
  mac: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.14.65-2.8 1.43-.58.67-1.1 1.74-1.01 2.78 1.08.08 2.19-.58 2.8-1.34z"/></svg>`,
  windows: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.951-1.801"/></svg>`,
  linux: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.012 0c-3.13 0-5.32 2.45-5.32 5.79 0 1.25.32 2.57.86 3.65-.24.58-.58 1.41-.74 1.95-.54 1.77-.38 2.94.34 3.79.46.54 1.15.82 2.05.82.2 0 .42-.02.66-.05.52.88 1.28 1.5 2.15 1.78v1.75c-1.36.42-3.18 1.22-3.18 2.39 0 .61.47 1.05 1.51 1.43 1.18.43 2.87.7 4.67.7 1.8 0 3.49-.27 4.67-.7 1.04-.38 1.51-.82 1.51-1.43 0-1.17-1.82-1.97-3.18-2.39v-1.75c.87-.28 1.63-.9 2.15-1.78.24.03.46.05.66.05.9 0 1.59-.28 2.05-.82.72-.85.88-2.02.34-3.79-.16-.54-.5-1.37-.74-1.95.54-1.08.86-2.4.86-3.65C17.332 2.45 15.142 0 12.012 0z"/></svg>`,
  default: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
};

// ── 1. OS Detection for Hero Download Button ──
function initOsDetection() {
  const ua = navigator.userAgent || "";
  const dlBtn = $("hero-dl-btn");
  const dlIcon = $("hero-dl-icon");
  const dlText = $("hero-dl-text");

  if (!dlBtn || !dlText) return;

  if (/Macintosh|Mac OS X/i.test(ua)) {
    dlBtn.href = "/download/mac";
    if (dlIcon) dlIcon.innerHTML = OS_ICONS.mac;
    dlText.textContent = state.lang === "en" ? "Download for macOS (Apple Silicon) ↗" : "下载 macOS 版 (Apple Silicon) ↗";
    dlBtn.setAttribute("data-en", "Download for macOS (Apple Silicon) ↗");
  } else if (/Windows/i.test(ua)) {
    dlBtn.href = "/download/windows";
    if (dlIcon) dlIcon.innerHTML = OS_ICONS.windows;
    dlText.textContent = state.lang === "en" ? "Download for Windows (64-bit) ↗" : "下载 Windows 版 (64 位) ↗";
    dlBtn.setAttribute("data-en", "Download for Windows (64-bit) ↗");
  } else if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    dlBtn.href = "/download/linux";
    if (dlIcon) dlIcon.innerHTML = OS_ICONS.linux;
    dlText.textContent = state.lang === "en" ? "Download for Linux (x64) ↗" : "下载 Linux 版 (x64) ↗";
    dlBtn.setAttribute("data-en", "Download for Linux (x64) ↗");
  } else {
    dlBtn.href = "#download";
    if (dlIcon) dlIcon.innerHTML = OS_ICONS.default;
    dlText.textContent = state.lang === "en" ? "Get Ear for Desktop ↗" : "获取 Ear 桌面版 ↗";
  }
}

// ── 2. Theme Toggle ──
function setTheme(t) {
  state.theme = t;
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("ear_theme", t);
  const icon = $("theme-icon");
  if (icon) icon.textContent = t === "dark" ? "☀️" : "🌙";
  const btn = $("theme-btn");
  if (btn) btn.setAttribute("title", t === "dark" ? "切换到浅色模式" : "切换到深色模式");
}

function initTheme() {
  setTheme(state.theme);
  const btn = $("theme-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      setTheme(state.theme === "dark" ? "light" : "dark");
    });
  }
}

// ── 3. Language Switcher ──
function setLang(l) {
  state.lang = l;
  localStorage.setItem("ear_lang", l);
  document.documentElement.lang = l === "en" ? "en" : "zh-CN";
  const btn = $("lang-btn");
  if (btn) btn.textContent = l === "en" ? "中文" : "EN";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (el.dataset.zh === undefined) el.dataset.zh = el.innerHTML;
    if (l === "en" && typeof I18N !== "undefined" && I18N.en && I18N.en[key]) {
      el.innerHTML = I18N.en[key];
    } else {
      el.innerHTML = el.dataset.zh;
    }
  });

  initOsDetection();
}

function initLang() {
  if (state.lang === "en") setLang("en");
  const btn = $("lang-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      setLang(state.lang === "zh" ? "en" : "zh");
    });
  }
}

// ── 4. Web Speech Synthesis TTS ──
function speakText(text, rate = 1.0) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

// ── 5. Interactive Desktop App Walkthrough & Video Practice ──
let stepTimer = null;
let sliceInterval = null;

function setStep(idx) {
  state.step = idx;
  if (stepTimer) clearTimeout(stepTimer);
  if (sliceInterval) clearInterval(sliceInterval);

  // Update nav buttons
  document.querySelectorAll(".step-btn").forEach((btn) => {
    const s = parseInt(btn.dataset.step, 10);
    btn.classList.toggle("active", s === idx);
  });

  // Switch panes
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
    // Stage 1: Copy Link
    if (video) video.pause();
    if (videoWrapper) videoWrapper.classList.add("paused");
    const urlText = $("mock-url-text");
    if (urlText) urlText.textContent = "https://www.youtube.com/watch?v=UF8uR6Z6KLc";

    if (state.autoCycle) {
      stepTimer = setTimeout(() => {
        setStep(1);
      }, 3500);
    }
  } else if (idx === 1) {
    // Stage 2: Fast Parallel Download & Slicing
    if (video) video.pause();
    if (videoWrapper) videoWrapper.classList.add("paused");
    runSliceAnimation(() => {
      if (state.autoCycle) {
        stepTimer = setTimeout(() => {
          setStep(2);
        }, 1200);
      }
    });
  } else if (idx === 2) {
    // Stage 3: Real Video Practice
    startVideoPractice();
    if (state.autoCycle) {
      stepTimer = setTimeout(() => {
        setStep(0);
      }, 11000);
    }
  }
}

function runSliceAnimation(onDone) {
  const bar = $("slice-bar");
  const pctText = $("slice-pct-text");
  const statusText = $("slice-status-text");

  let pct = 0;
  if (bar) bar.style.width = "0%";
  if (pctText) pctText.textContent = "0%";

  sliceInterval = setInterval(() => {
    pct += Math.floor(Math.random() * 8) + 6;
    if (pct > 100) pct = 100;

    if (bar) bar.style.width = pct + "%";
    if (pctText) pctText.textContent = pct + "%";

    if (statusText) {
      if (pct < 35) {
        statusText.textContent = state.lang === "en" ? "Downloading 1080p stream: 5.4 MB/s (Range HTTP)" : "并行极速下载中：5.4 MB/s · 4 线程 Range HTTP";
      } else if (pct < 75) {
        statusText.textContent = state.lang === "en" ? "Extracting captions & analyzing speech pauses..." : "提取官方英文字幕 → 分析语音停顿特征...";
      } else if (pct < 100) {
        statusText.textContent = state.lang === "en" ? "Slicing into sentence units (142 sentences)..." : "正在切分句子单元... (共 142 句)";
      } else {
        statusText.textContent = state.lang === "en" ? "✓ Done! Loading immersion practice player..." : "✓ 切片就绪！自动载入练习播放器";
      }
    }

    if (pct >= 100) {
      clearInterval(sliceInterval);
      sliceInterval = null;
      if (onDone) onDone();
    }
  }, 90);
}

function startVideoPractice() {
  const video = $("practice-video");
  const videoWrapper = $("video-wrapper");
  const card = $("active-sentence-card");

  if (card) card.classList.remove("revealed");

  if (video) {
    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        if (videoWrapper) videoWrapper.classList.remove("paused");
        updatePlayIcon(true);
      }).catch(() => {
        // Autoplay muted fallback
        video.muted = true;
        updateSoundIcon(true);
        video.play().then(() => {
          if (videoWrapper) videoWrapper.classList.remove("paused");
          updatePlayIcon(true);
        }).catch(() => {});
      });
    }
  }

  // Auto reveal peek after 1.8s
  setTimeout(() => {
    if (state.step === 2 && card) {
      card.classList.add("revealed");
    }
  }, 1800);

  // Auto simulate pass feedback after 4.5s
  setTimeout(() => {
    if (state.step === 2 && state.autoCycle) {
      state.scores.pass++;
      const el = $("player-count-pass");
      if (el) el.textContent = `(${state.scores.pass})`;
      flashPlayerFeedback("✓ 听懂！自动流转", "#22c55e");
    }
  }, 4500);
}

function updatePlayIcon(isPlaying) {
  const icon = $("ctrl-play-icon");
  if (!icon) return;
  if (isPlaying) {
    icon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
  } else {
    icon.innerHTML = `<polygon points="6 4 20 12 6 20 6 4"/>`;
  }
}

function updateSoundIcon(isMuted) {
  const txt = $("sound-icon-text");
  if (txt) txt.textContent = isMuted ? "🔇" : "🔊";
}

function togglePlayerReveal() {
  const card = $("active-sentence-card");
  if (!card) return;
  const isRev = card.classList.toggle("revealed");
  const btnText = $("player-reveal-text");
  if (btnText) {
    btnText.textContent = isRev
      ? (state.lang === "en" ? "Hide" : "遮住字幕")
      : (state.lang === "en" ? "Reveal / Speak" : "揭晓字幕");
  }
}

function flashPlayerFeedback(msg, color) {
  const hint = document.querySelector(".s-hint-line");
  if (!hint) return;
  const orig = hint.innerHTML;
  hint.style.color = color;
  hint.innerHTML = `<strong>${msg}</strong>`;
  setTimeout(() => {
    hint.style.color = "";
    hint.innerHTML = orig;
  }, 1200);
}

function initAppMockup() {
  // Step button click navigation
  document.querySelectorAll(".step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = parseInt(btn.dataset.step, 10);
      setStep(s);
      pauseAutoCycle();
    });
  });

  // Stage 1 button
  const btnStart = $("btn-mock-start");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      setStep(1);
      pauseAutoCycle();
    });
  }

  // Back button in player
  const btnBack = $("player-back-step");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      setStep(0);
      pauseAutoCycle();
    });
  }

  // Video element setup
  const video = $("practice-video");
  const videoWrapper = $("video-wrapper");
  const scrubber = $("video-scrubber");
  const scrubberBar = $("video-scrubber-bar");
  const curTimeEl = $("video-cur-time");

  if (video) {
    video.addEventListener("timeupdate", () => {
      if (!video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      if (scrubberBar) scrubberBar.style.width = pct + "%";
      if (curTimeEl) {
        const baseSec = 80 + Math.floor(video.currentTime);
        const m = Math.floor(baseSec / 60);
        const s = baseSec % 60;
        curTimeEl.textContent = `00:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
    });

    video.addEventListener("ended", () => {
      video.currentTime = 0;
      video.play().catch(() => {});
    });
  }

  // Center play & bottom play button
  const togglePlay = () => {
    if (!video) return;
    if (video.paused) {
      video.play();
      if (videoWrapper) videoWrapper.classList.remove("paused");
      updatePlayIcon(true);
    } else {
      video.pause();
      if (videoWrapper) videoWrapper.classList.add("paused");
      updatePlayIcon(false);
    }
  };

  $("video-center-btn")?.addEventListener("click", () => {
    togglePlay();
    pauseAutoCycle();
  });
  $("ctrl-play-btn")?.addEventListener("click", () => {
    togglePlay();
    pauseAutoCycle();
  });

  // Sound toggle button
  $("ctrl-sound-btn")?.addEventListener("click", () => {
    if (!video) return;
    video.muted = !video.muted;
    updateSoundIcon(video.muted);
    pauseAutoCycle();
  });

  // Scrubber click
  if (scrubber && video) {
    scrubber.addEventListener("click", (e) => {
      const rect = scrubber.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      video.currentTime = ratio * video.duration;
      pauseAutoCycle();
    });
  }

  // Subtitle card click & reveal button
  $("s-caption-box")?.addEventListener("click", () => {
    togglePlayerReveal();
    pauseAutoCycle();
  });
  $("btn-player-reveal")?.addEventListener("click", () => {
    togglePlayerReveal();
    pauseAutoCycle();
  });

  // Subtitle mask toggle
  $("btn-mask-toggle")?.addEventListener("click", () => {
    togglePlayerReveal();
    pauseAutoCycle();
  });

  // 1 Pass, 2 Lag, 3 Blind buttons
  $("btn-player-pass")?.addEventListener("click", () => {
    state.scores.pass++;
    const el = $("player-count-pass");
    if (el) el.textContent = `(${state.scores.pass})`;
    flashPlayerFeedback("✓ 听懂！自动推进", "#22c55e");
    pauseAutoCycle();
  });

  $("btn-player-lag")?.addEventListener("click", () => {
    state.scores.lag++;
    const el = $("player-count-lag");
    if (el) el.textContent = `(${state.scores.lag})`;
    flashPlayerFeedback("? 迟疑已收拢至难句单环", "#f59e0b");
    pauseAutoCycle();
  });

  $("btn-player-blind")?.addEventListener("click", () => {
    state.scores.blind++;
    const el = $("player-count-blind");
    if (el) el.textContent = `(${state.scores.blind})`;
    flashPlayerFeedback("✕ 盲区已加入单句道场", "#ef4444");
    pauseAutoCycle();
  });

  $("btn-player-loop")?.addEventListener("click", () => {
    flashPlayerFeedback("🔁 A-B 单句无缝循环锁定中", "#2f7cf6");
    pauseAutoCycle();
  });

  // Speed badge cycle
  const speeds = [1.0, 1.2, 0.8];
  let speedIdx = 0;
  $("ctrl-speed-btn")?.addEventListener("click", () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    const sp = speeds[speedIdx];
    if (video) video.playbackRate = sp;
    const btn = $("ctrl-speed-btn");
    if (btn) btn.textContent = `${sp}x`;
    pauseAutoCycle();
  });

  // Keyboard controls
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "Space" || e.key.toLowerCase() === "r") {
      e.preventDefault();
      togglePlayerReveal();
      pauseAutoCycle();
    } else if (e.key === "1") {
      $("btn-player-pass")?.click();
    } else if (e.key === "2") {
      $("btn-player-lag")?.click();
    } else if (e.key === "3") {
      $("btn-player-blind")?.click();
    }
  });

  // Auto cycle label trigger
  const cycleLabel = $("auto-cycle-label");
  if (cycleLabel) {
    cycleLabel.addEventListener("click", () => {
      if (state.autoCycle) {
        pauseAutoCycle();
        cycleLabel.textContent = state.lang === "en" ? "Paused (Click to play)" : "已暂停演示";
      } else {
        state.autoCycle = true;
        cycleLabel.textContent = state.lang === "en" ? "Auto Playing" : "演示播放中";
        setStep(0);
      }
    });
  }

  // Start with Step 0
  setStep(0);
}

function pauseAutoCycle() {
  state.autoCycle = false;
  if (stepTimer) clearTimeout(stepTimer);
  const cycleLabel = $("auto-cycle-label");
  if (cycleLabel) {
    cycleLabel.textContent = state.lang === "en" ? "Manual Mode" : "手动探索模式";
  }
}

// ── 6. Dynamically Sync Latest Release ──
async function syncLatestRelease() {
  try {
    const res = await fetch("/api/latest");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.tag) {
      const macLink = $("dl-mac-link");
      const winLink = $("dl-win-link");
      const linuxLink = $("dl-linux-link");
      if (macLink && data.assets?.mac) macLink.href = data.assets.mac;
      if (winLink && data.assets?.windows) winLink.href = data.assets.windows;
      if (linuxLink && data.assets?.linux) linuxLink.href = data.assets.linux;
    }
  } catch (err) {
    // Keep standard fallback links
  }
}

// ── 7. AI Prompt 1-Click Copy ──
function initAiCopy() {
  const btn = $("btn-copy-prompt");
  const promptEl = $("ai-prompt-text");
  const btnText = $("copy-btn-text");

  if (!btn || !promptEl) return;

  const copy = () => {
    const text = promptEl.textContent.trim();
    const handleCopied = () => {
      btn.classList.add("copied");
      if (btnText) btnText.textContent = state.lang === "en" ? "✓ Copied!" : "✓ 已复制提示词";
      setTimeout(() => {
        btn.classList.remove("copied");
        if (btnText) btnText.textContent = state.lang === "en" ? "Copy Prompt" : "复制提示词";
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(handleCopied).catch(() => {
        fallbackCopy(text, handleCopied);
      });
    } else {
      fallbackCopy(text, handleCopied);
    }
  };

  btn.addEventListener("click", copy);
  promptEl.addEventListener("click", copy);
}

function fallbackCopy(text, cb) {
  const input = document.createElement("textarea");
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
  cb();
}

// ── Initializer ──
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initLang();
  initOsDetection();
  initAppMockup();
  initAiCopy();
  syncLatestRelease();
});
