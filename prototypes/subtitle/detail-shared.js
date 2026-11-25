// Data, dictionary, and SVG icons live in ./detail-data.js
(() => {
  const { TRANSCRIPT, DICT, ICONS } = window.EarDetailData;

  const VIEWPORTS = {
    sm: { label: "最小 800×560", w: 800, h: 560 },
    md: { label: "默认 1200×800", w: 1200, h: 800 },
    lg: { label: "大屏 1600×920", w: 1600, h: 920 },
    full: { label: "铺满自适应", w: 0, h: 0 },
  };

  const PROPOSALS = [
    { id: "a", label: "方案 A · 焦点卡片", href: "./detail-a-focus-card.html" },
    { id: "b", label: "方案 B · 双区工作台", href: "./detail-b-dual-studio.html" },
    { id: "c", label: "方案 C · 声波提词卡", href: "./detail-c-tactile-stage.html" },
  ];

  const cleanWord = (w) => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");

  function lookupWord(raw) {
    const key = cleanWord(raw);
    const hit = DICT[key];
    return {
      term: raw.replace(/[.,!?]+$/, ""),
      key,
      ipa: hit ? hit.ipa : "/ˈwɜːrd/",
      meaning: hit ? hit.meaning : "点击查词示例释义",
    };
  }

  function renderWordsHtml(sentence, state) {
    const phraseWords = new Set((sentence.phrase?.words || []).map((w) => w.toLowerCase()));
    const tokens = sentence.en.split(" ");
    return tokens
      .map((raw, idx) => {
        const key = cleanWord(raw);
        const inPhrase = phraseWords.has(key);
        const isSelected = state.selectedWordKey === key && state.selectedWordIdx === idx;
        const isMasked = state.blind && !state.revealedWords.has(`${sentence.id}:${idx}`);
        const gloss = !isMasked && sentence.gloss?.[key] ? `<span class="w-gloss">${sentence.gloss[key]}</span>` : "";
        const cls = [
          "w-btn",
          inPhrase && !isMasked ? "in-phrase" : "",
          isSelected && !isMasked ? "is-selected" : "",
          isMasked ? "is-masked" : "",
        ].filter(Boolean).join(" ");
        return `<span class="w-slot"><button class="${cls}" data-word-idx="${idx}" data-word-raw="${raw.replace(/"/g, "&quot;")}">${raw}</button>${gloss}</span>`;
      })
      .join("");
  }

  function renderCalloutHtml(sentence, state) {
    if (state.selectedWordRaw) {
      const info = lookupWord(state.selectedWordRaw);
      const starred = state.starredTerms.has(info.key);
      return `
        <div class="callout-strip is-word-mode">
          <div class="callout-main">
            <span class="callout-term">${info.term}</span>
            <span class="callout-ipa">${info.ipa}</span>
            <span class="callout-meaning">${info.meaning}</span>
          </div>
          <button class="star-btn ${starred ? "on" : ""}" data-act="star" data-term="${info.key}" title="收藏生词">${starred ? ICONS.starFill : ICONS.star}</button>
        </div>`;
    }
    if (sentence.phrase) {
      const pKey = sentence.phrase.text.toLowerCase();
      const starred = state.starredTerms.has(pKey);
      return `
        <div class="callout-strip">
          <div class="callout-main">
            <span class="callout-term">${sentence.phrase.text}</span>
            <span class="callout-meaning">${sentence.phrase.meaning}</span>
          </div>
          <button class="star-btn ${starred ? "on" : ""}" data-act="star" data-term="${pKey}" title="收藏表达">${starred ? ICONS.starFill : ICONS.star}</button>
        </div>`;
    }
    return `
      <div class="callout-strip is-word-mode">
        <div class="callout-main">
          <span class="callout-meaning">点击句子中任意单词，可原地查看释义与收藏</span>
        </div>
      </div>`;
  }

  function renderActionBarHtml(sentence, state) {
    const bookmarked = state.bookmarks.has(sentence.id);
    return `
      <div class="card-actions">
        <div class="action-icons">
          <button class="act-btn ${state.showTrans ? "on" : ""}" data-act="trans" title="切换译文 (T)">${ICONS.lang}</button>
          <button class="act-btn ${state.loopOne ? "on" : ""}" data-act="loop" title="单句循环 (R)">${ICONS.repeat1}</button>
          <button class="act-btn ${state.blind ? "on" : ""}" data-act="blind" title="盲听打码 (M)">${state.blind ? ICONS.eyeOff : ICONS.eye}</button>
          <button class="act-btn" data-act="copy" title="复制当前句">${ICONS.copy}</button>
          <button class="act-btn ${bookmarked ? "on" : ""}" data-act="bookmark" title="收藏句子">${bookmarked ? ICONS.bookmarkFill : ICONS.bookmark}</button>
          <button class="act-btn ${state.showAi ? "on" : ""}" data-act="ai" title="句法精讲">${ICONS.sparkles}</button>
        </div>
        <span class="card-meta-tag">${sentence.id + 1}/${TRANSCRIPT.length} · ${sentence.wpm} wpm</span>
      </div>`;
  }

  function mountPrototype(config) {
    const params = new URLSearchParams(location.search);
    const state = {
      proposal: config.id,
      orientation: params.get("o") === "portrait" ? "portrait" : "landscape",
      viewport: VIEWPORTS[params.get("v")] ? params.get("v") : "md",
      theme: params.get("t") === "light" ? "light" : "dark",
      blind: false,
      showTrans: true,
      loopOne: false,
      showAi: false,
      blocker: false,
      playing: true,
      activeIdx: 2,
      selectedWordKey: "is",
      selectedWordIdx: 3,
      selectedWordRaw: null,
      starredTerms: new Set(),
      bookmarks: new Set(),
      revealedWords: new Set(),
      notes: { 2: "核心句型：The bottom line is ... 适合跟读 3 遍" },
    };

    document.documentElement.setAttribute("data-theme", state.theme);
    document.body.innerHTML = `
      <header class="proto-bar">
        <div class="proto-group">
          ${PROPOSALS.map((p) => `<a class="proto-pill ${p.id === state.proposal ? "active" : ""}" data-nav="${p.id}" href="${p.href}">${p.label}</a>`).join("")}
        </div>
        <div class="proto-group">
          <span class="proto-label">视频</span>
          <button class="proto-pill" data-ori="landscape">横屏 16:9</button>
          <button class="proto-pill" data-ori="portrait">竖屏 9:16</button>
          <span class="proto-sep"></span>
          <span class="proto-label">窗口</span>
          ${Object.entries(VIEWPORTS).map(([k, v]) => `<button class="proto-pill" data-vp="${k}">${v.label}</button>`).join("")}
          <span class="proto-sep"></span>
          <button class="proto-pill" data-theme-toggle>浅色 / 深色</button>
          <button class="proto-pill" data-blind-toggle>盲听态 (M)</button>
        </div>
      </header>
      <main class="proto-stage" id="stage">
        <section class="app-window" id="appWin">
          <div class="detail-root" id="detailRoot">
            <div class="video-stage is-playing" id="videoStage">
              <div class="video-header">
                <button class="back-btn" id="backBtn">${ICONS.back}<span>Library</span></button>
                <span class="video-title">Mel Robbins — The Bottom Line Is No One's Coming</span>
                <span class="video-ratio-tag" id="ratioTag">16:9</span>
              </div>
              <div class="video-canvas" id="videoCanvas">
                <div class="video-art"></div>
                <svg class="video-silhouette" viewBox="0 0 140 170" fill="none">
                  <circle cx="70" cy="48" r="24" fill="rgba(255,255,255,0.52)"/>
                  <path d="M26 156c4-38 22-56 44-56s40 18 44 56" fill="rgba(255,255,255,0.36)"/>
                  <rect x="52" y="42" width="14" height="9" rx="3" stroke="rgba(10,10,12,0.75)" stroke-width="2.5"/>
                  <rect x="74" y="42" width="14" height="9" rx="3" stroke="rgba(10,10,12,0.75)" stroke-width="2.5"/>
                </svg>
                <div class="hard-sub" id="hardSub">no one's coming</div>
              </div>
              <div class="video-controls">
                <div class="prog-track" id="progTrack"><div class="prog-fill" id="progFill"></div></div>
                <div class="ctrl-row">
                  <div class="ctrl-left">
                    <button class="vbtn" data-vc="prev" title="上一句 (←)">${ICONS.prev}</button>
                    <button class="vbtn primary" data-vc="play" id="playBtn" title="播放/暂停 (Space)">${ICONS.pause}</button>
                    <button class="vbtn" data-vc="next" title="下一句 (→)">${ICONS.next}</button>
                    <span class="vtime" id="vTime">0:12 / 0:29</span>
                  </div>
                  <div class="ctrl-right">
                    <button class="vbtn" data-vc="blocker" id="blockerBtn" title="马赛克遮挡硬字幕 (B)">遮挡条 B</button>
                    <button class="vbtn" data-vc="mask" id="maskBtn" title="盲听模式 (M)">盲听 M</button>
                    <button class="vbtn" data-vc="trans" id="transBtn" title="双语译文 (T)">译文 T</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="sub-stage" id="subStage"></div>
          </div>
          <div class="app-toast" id="toast"></div>
        </section>
      </main>
      <div class="size-badge" id="sizeBadge">1200 × 800</div>
    `;

    const stage = document.getElementById("stage");
    const appWin = document.getElementById("appWin");
    const detailRoot = document.getElementById("detailRoot");
    const videoStage = document.getElementById("videoStage");
    const subStage = document.getElementById("subStage");
    const hardSub = document.getElementById("hardSub");
    const progFill = document.getElementById("progFill");
    const playBtn = document.getElementById("playBtn");
    const vTime = document.getElementById("vTime");
    const ratioTag = document.getElementById("ratioTag");
    const sizeBadge = document.getElementById("sizeBadge");
    const toast = document.getElementById("toast");

    let toastTimer = null;
    const showToast = (msg) => {
      toast.textContent = msg;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
    };

    const syncLinks = () => {
      const qs = `?o=${state.orientation}&v=${state.viewport}&t=${state.theme}`;
      document.querySelectorAll("[data-nav]").forEach((a) => {
        const base = a.getAttribute("href").split("?")[0];
        a.setAttribute("href", base + qs);
      });
    };

    const updateSizeClass = () => {
      const rect = appWin.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      appWin.classList.toggle("win-sm", w <= 860 || h <= 600);
      appWin.classList.toggle("win-lg", w >= 1420);
      sizeBadge.textContent = `${w} × ${h} · ${state.orientation === "landscape" ? "横屏上下" : "竖屏左右"}`;
    };

    const selectSentence = (idx) => {
      const next = Math.max(0, Math.min(TRANSCRIPT.length - 1, idx));
      state.activeIdx = next;
      const s = TRANSCRIPT[next];
      state.selectedWordRaw = null;
      if (s.defaultWord) {
        const parts = s.en.split(" ");
        const wi = parts.findIndex((p) => cleanWord(p) === s.defaultWord);
        state.selectedWordKey = s.defaultWord;
        state.selectedWordIdx = wi >= 0 ? wi : -1;
      } else {
        state.selectedWordKey = "";
        state.selectedWordIdx = -1;
      }
      render();
    };

    const api = {
      transcript: TRANSCRIPT,
      icons: ICONS,
      renderWordsHtml: (s) => renderWordsHtml(s, state),
      renderCalloutHtml: (s) => renderCalloutHtml(s, state),
      renderActionBarHtml: (s) => renderActionBarHtml(s, state),
      selectSentence,
      showToast,
      render: () => render(),
    };

    function render() {
      document.documentElement.setAttribute("data-theme", state.theme);
      const vp = VIEWPORTS[state.viewport];
      stage.classList.toggle("is-full", state.viewport === "full");
      if (state.viewport !== "full") {
        appWin.style.width = `${vp.w}px`;
        appWin.style.height = `${vp.h}px`;
      } else {
        appWin.style.width = "";
        appWin.style.height = "";
      }

      detailRoot.classList.toggle("is-landscape", state.orientation === "landscape");
      detailRoot.classList.toggle("is-portrait", state.orientation === "portrait");
      videoStage.classList.toggle("is-playing", state.playing);

      const s = TRANSCRIPT[state.activeIdx];
      hardSub.textContent = s.en;
      hardSub.classList.toggle("is-blocked", state.blocker);
      ratioTag.textContent = state.orientation === "landscape" ? "16:9 横屏" : "9:16 竖屏";
      playBtn.innerHTML = state.playing ? ICONS.pause : ICONS.play;
      progFill.style.width = `${Math.round(((state.activeIdx + 0.65) / TRANSCRIPT.length) * 100)}%`;
      vTime.textContent = `${s.time.split("–")[0].trim()} / 0:29`;

      document.getElementById("blockerBtn").classList.toggle("on", state.blocker);
      document.getElementById("maskBtn").classList.toggle("on", state.blind);
      document.getElementById("transBtn").classList.toggle("on", state.showTrans);

      document.querySelectorAll("[data-ori]").forEach((b) => b.classList.toggle("active", b.dataset.ori === state.orientation));
      document.querySelectorAll("[data-vp]").forEach((b) => b.classList.toggle("active", b.dataset.vp === state.viewport));
      document.querySelector("[data-theme-toggle]").textContent = state.theme === "dark" ? "切浅色 Light" : "切深色 Dark";
      document.querySelector("[data-blind-toggle]").classList.toggle("active", state.blind);

      config.renderSubtitle(subStage, state, api);
      syncLinks();
      requestAnimationFrame(updateSizeClass);
    }

    document.querySelectorAll("[data-ori]").forEach((b) =>
      b.addEventListener("click", () => { state.orientation = b.dataset.ori; render(); }),
    );
    document.querySelectorAll("[data-vp]").forEach((b) =>
      b.addEventListener("click", () => { state.viewport = b.dataset.vp; render(); }),
    );
    document.querySelector("[data-theme-toggle]").addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      render();
    });
    document.querySelector("[data-blind-toggle]").addEventListener("click", () => {
      state.blind = !state.blind;
      state.revealedWords.clear();
      render();
    });

    videoStage.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-vc]");
      if (!btn) {
        if (e.target.closest(".video-canvas")) { state.playing = !state.playing; render(); }
        return;
      }
      const act = btn.dataset.vc;
      if (act === "play") state.playing = !state.playing;
      else if (act === "prev") selectSentence(state.activeIdx - 1);
      else if (act === "next") selectSentence(state.activeIdx + 1);
      else if (act === "blocker") state.blocker = !state.blocker;
      else if (act === "mask") { state.blind = !state.blind; state.revealedWords.clear(); }
      else if (act === "trans") state.showTrans = !state.showTrans;
      render();
    });

    subStage.addEventListener("click", (e) => {
      const wordBtn = e.target.closest("[data-word-idx]");
      if (wordBtn) {
        e.stopPropagation();
        const idx = Number(wordBtn.dataset.wordIdx);
        const raw = wordBtn.dataset.wordRaw;
        const s = TRANSCRIPT[state.activeIdx];
        const revKey = `${s.id}:${idx}`;
        if (state.blind && !state.revealedWords.has(revKey)) state.revealedWords.add(revKey);
        state.selectedWordKey = cleanWord(raw);
        state.selectedWordIdx = idx;
        state.selectedWordRaw = raw;
        render();
        return;
      }
      const actBtn = e.target.closest("[data-act]");
      if (actBtn) {
        e.stopPropagation();
        const act = actBtn.dataset.act;
        const s = TRANSCRIPT[state.activeIdx];
        if (act === "trans") state.showTrans = !state.showTrans;
        else if (act === "loop") { state.loopOne = !state.loopOne; showToast(state.loopOne ? "已开启单句循环" : "已关闭单句循环"); }
        else if (act === "blind") { state.blind = !state.blind; state.revealedWords.clear(); }
        else if (act === "copy") { navigator.clipboard?.writeText(s.en).catch(() => {}); showToast("已复制当前句"); }
        else if (act === "bookmark") {
          if (state.bookmarks.has(s.id)) state.bookmarks.delete(s.id); else state.bookmarks.add(s.id);
          showToast(state.bookmarks.has(s.id) ? "已收藏该句" : "已取消收藏");
        } else if (act === "ai") state.showAi = !state.showAi;
        else if (act === "star") {
          const term = actBtn.dataset.term;
          if (state.starredTerms.has(term)) state.starredTerms.delete(term); else state.starredTerms.add(term);
          showToast(state.starredTerms.has(term) ? "已加入生词本" : "已移出生词本");
        }
        render();
        return;
      }
      const jumpRow = e.target.closest("[data-jump]");
      if (jumpRow) selectSentence(Number(jumpRow.dataset.jump));
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === " ") { e.preventDefault(); state.playing = !state.playing; render(); }
      else if (e.key === "ArrowRight") selectSentence(state.activeIdx + 1);
      else if (e.key === "ArrowLeft") selectSentence(state.activeIdx - 1);
      else if (e.key === "m" || e.key === "M") { state.blind = !state.blind; state.revealedWords.clear(); render(); }
      else if (e.key === "t" || e.key === "T") { state.showTrans = !state.showTrans; render(); }
      else if (e.key === "b" || e.key === "B") { state.blocker = !state.blocker; render(); }
      else if (e.key === "r" || e.key === "R") { state.loopOne = !state.loopOne; showToast(state.loopOne ? "已开启单句循环" : "已关闭单句循环"); render(); }
    });

    window.addEventListener("resize", updateSizeClass);
    render();
  }

  window.EarDetailProto = { mountPrototype };
})();
