/* prototypes/www.js - Ear Landing Page Interactivity */

// State
const state = {
  theme: localStorage.getItem("ear_theme") || "dark",
  lang: localStorage.getItem("ear_lang") || "zh",
  step: 0,
  paused: false,
  progress: 0,
  revealed: false
};

const $ = (id) => document.getElementById(id);

// Theme Switcher
function setTheme(t) {
  state.theme = t;
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("ear_theme", t);
  const icon = $("theme-icon");
  if (icon) icon.textContent = t === "dark" ? "☀️" : "🌙";
  const btn = $("theme-btn");
  if (btn) btn.setAttribute("title", t === "dark" ? "切换到浅色模式" : "切换到深色模式");
}

// Language Switcher
function setLang(l) {
  state.lang = l;
  localStorage.setItem("ear_lang", l);
  document.documentElement.lang = l === "en" ? "en" : "zh-CN";
  const btn = $("lang-btn");
  if (btn) btn.textContent = l === "en" ? "中文" : "EN";

  document.querySelectorAll("[data-en]").forEach((el) => {
    if (el.dataset.zh === undefined) el.dataset.zh = el.innerHTML;
    el.innerHTML = l === "en" ? el.dataset.en : el.dataset.zh;
  });
}

// Subtitle Flashlight / Spotlight Peek
function initSpotlight() {
  const subArea = $("sub-area");
  if (!subArea) return;

  subArea.addEventListener("pointermove", (e) => {
    const r = subArea.getBoundingClientRect();
    subArea.style.setProperty("--x", (e.clientX - r.left) + "px");
    subArea.style.setProperty("--y", (e.clientY - r.top) + "px");
  });
  subArea.addEventListener("pointerleave", () => {
    subArea.style.setProperty("--x", "-999px");
  });

  subArea.addEventListener("click", () => {
    toggleReveal();
    playAudioSample();
  });
}

function toggleReveal() {
  const subArea = $("sub-area");
  if (!subArea) return;
  state.revealed = !state.revealed;
  subArea.classList.toggle("revealed", state.revealed);
}

// TTS Audio Playback
function playAudioSample() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const textEl = $("sub-real");
  const text = textEl ? textEl.textContent : "I used to think I understood English, until I turned the subtitles off.";
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

// 3-Step Animation Controller
const STEP_DURATION = 4800; // ms per step
const TICK = 40;

function setStep(idx) {
  state.step = idx;
  state.progress = 0;

  // Update Tab UI
  document.querySelectorAll(".step-tab").forEach((tab, i) => {
    tab.classList.toggle("active", i === idx);
    const sp = $("sp-" + i);
    if (sp) sp.style.width = i === idx ? "0%" : (i < idx ? "100%" : "0%");
  });

  // Update Screen Panes
  for (let i = 0; i < 3; i++) {
    const pane = $("pane-" + i);
    if (pane) pane.style.display = i === idx ? "block" : "none";
  }

  // Trigger step-specific mock animations
  if (idx === 0) {
    const toast = $("toast-copied");
    if (toast) {
      toast.style.opacity = "0";
      setTimeout(() => { toast.style.opacity = "1"; }, 1200);
    }
  } else if (idx === 1) {
    const bar = $("mock-bar");
    if (bar) {
      bar.style.width = "0%";
      setTimeout(() => { bar.style.width = "45%"; }, 600);
      setTimeout(() => { bar.style.width = "100%"; }, 2200);
    }
  } else if (idx === 2) {
    state.revealed = false;
    const subArea = $("sub-area");
    if (subArea) {
      subArea.classList.remove("revealed");
      // Simulate peek spotlight halfway
      setTimeout(() => {
        subArea.style.setProperty("--x", "120px");
        subArea.style.setProperty("--y", "24px");
      }, 1000);
    }
  }
}

// Init Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Theme & Lang
  const themeBtn = $("theme-btn");
  if (themeBtn) themeBtn.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
  setTheme(state.theme);

  const langBtn = $("lang-btn");
  if (langBtn) langBtn.addEventListener("click", () => setLang(state.lang === "en" ? "zh" : "en"));
  if (state.lang === "en") setLang("en");

  // Spotlight init
  initSpotlight();

  // Manual step tab clicks
  document.querySelectorAll(".step-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.step, 10);
      setStep(idx);
    });
  });

  // Copy button click in step 1
  const copyBtn = $("btn-copy-mock");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const toast = $("toast-copied");
      if (toast) toast.style.opacity = "1";
    });
  }

  // Pause toggle
  const pauseBadge = $("pause-badge");
  if (pauseBadge) {
    pauseBadge.addEventListener("click", () => {
      state.paused = !state.paused;
      pauseBadge.textContent = state.paused ? "▶ 已暂停" : "⏸ 自动切换";
    });
  }

  // Animation Loop
  setInterval(() => {
    if (state.paused) return;
    state.progress += TICK;
    const pct = Math.min(100, (state.progress / STEP_DURATION) * 100);
    const sp = $("sp-" + state.step);
    if (sp) sp.style.width = pct + "%";

    if (state.progress >= STEP_DURATION) {
      setStep((state.step + 1) % 3);
    }
  }, TICK);

  // Keyboard shortcut listener
  window.addEventListener("keydown", (e) => {
    if (e.key === " " && state.step === 2) {
      e.preventDefault();
      playAudioSample();
    } else if (e.key === "r" || e.key === "R") {
      toggleReveal();
    }
  });

  // Start with Step 0
  setStep(0);
});
