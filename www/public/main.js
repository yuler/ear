/* www/public/main.js - Ear Landing Page Interactivity */

// Chinese is the strict priority/default unless explicitly chosen and saved as "en"
const savedLang = localStorage.getItem("ear_lang");
window.state = Object.assign(window.state || {}, {
  theme: localStorage.getItem("ear_theme") || "dark",
  lang: savedLang === "en" ? "en" : "zh",
  step: 0,
  autoCycle: true,
  currentSentenceIdx: 1,
  revealed: false,
  masked: true,
  isPlaying: false,
  counts: { pass: 14, lag: 3, blind: 2 },
});
const $ = (id) => document.getElementById(id);
window.$ = $;
const state = window.state;

const OS_ICONS = {
  mac: '<svg width="18" height="18" fill="currentColor"><use href="#icon-mac"/></svg>',
  windows: '<svg width="18" height="18" fill="currentColor"><use href="#icon-win"/></svg>',
  linux: '<svg width="18" height="18" fill="currentColor"><use href="#icon-linux"/></svg>',
  default: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
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

// ── 3. Language Switcher (Chinese by default if not chosen before) ──
function setLang(l) {
  state.lang = l === "en" ? "en" : "zh";
  localStorage.setItem("ear_lang", state.lang);
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
  const btn = $("lang-btn");
  if (btn) {
    btn.textContent = state.lang === "en" ? "中文" : "EN";
    btn.title = state.lang === "en" ? "切换为中文 / Switch to Chinese" : "切换为英文 / Switch to English";
  }

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (el.dataset.zh === undefined) el.dataset.zh = el.innerHTML;
    if (state.lang === "en" && typeof I18N !== "undefined" && I18N.en && I18N.en[key]) {
      el.innerHTML = I18N.en[key];
    } else {
      el.innerHTML = el.dataset.zh;
    }
  });

  initOsDetection();
  if (typeof window.updateMockDemoLang === "function") {
    window.updateMockDemoLang(state.lang);
  }
}

function initLang() {
  const saved = localStorage.getItem("ear_lang");
  // Default to Chinese if user hasn't explicitly chosen before
  const initial = saved === "en" ? "en" : "zh";
  if (initial === "en") {
    setLang("en");
  } else {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (el.dataset.zh === undefined) el.dataset.zh = el.innerHTML;
    });
    const btn = $("lang-btn");
    if (btn) {
      btn.textContent = "EN";
      btn.title = "切换为英文 / Switch to English";
    }
  }

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
// Sourced from /player-demo.js to keep concerns isolated and file tokens bounded.
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
  if (window.initAppMockup) window.initAppMockup();
  initAiCopy();
  syncLatestRelease();
});
