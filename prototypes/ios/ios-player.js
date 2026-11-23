// PROTOTYPE. Top-bottom player: pinned 16:9 video, scrolling subtitles, blind mask,
// single-sentence loop, speed. Uses the globals `state`, `el`, `posterCss` from ios-mvp.js.
// Opened through the poster → video transition in ios-transition.js.

const SENTENCES = [
  { start: 0, end: 12, text: "When you acquire a second language, comprehension always comes first." },
  { start: 12, end: 25, text: "You do not memorize rules in order to speak fluently later." },
  { start: 25, end: 39, text: "Instead, you listen to messages you can mostly understand in context." },
  { start: 39, end: 52, text: "That gap between what you know and what you hear is called i plus one." },
  { start: 52, end: 66, text: "Repeating a short sentence offline lets your ear catch weak syllables naturally." },
  { start: 66, end: 80, text: "Once the rhythm feels effortless, your brain stores the whole phrase." }
];

let playTimer = null;

function formatSec(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

function openPlayer(item) {
  state.activeVideoId = item.id;
  state.currentSentenceIdx = 0;
  state.currentTime = 0;
  state.playing = true;
  el("playerTitle").textContent = item.title;
  // The poster covers the video until "playback" starts, so the hero lands on the same image.
  const poster = posterCss(item);
  el("ambientScene").dataset.poster = poster;
  const layer = el("posterLayer");
  layer.style.background = poster;
  layer.classList.remove("gone");
  setTimeout(() => layer.classList.add("gone"), 700);
  el("libraryView").classList.remove("active");
  el("playerView").classList.add("active");
  startPlayLoop();
  renderPlayer();
}

function closePlayer() {
  stopPlayLoop();
  state.activeVideoId = null;
  el("playerView").classList.remove("active");
  el("libraryView").classList.add("active");
}

function startPlayLoop() {
  stopPlayLoop();
  playTimer = setInterval(() => {
    if (!state.playing || !state.activeVideoId) return;
    state.currentTime += 0.25 * state.speeds[state.speedIndex];
    const cur = SENTENCES[state.currentSentenceIdx];
    if (state.currentTime >= cur.end) {
      if (state.loopSentence) state.currentTime = cur.start;
      else if (state.currentSentenceIdx < SENTENCES.length - 1) state.currentSentenceIdx += 1;
      else { state.currentSentenceIdx = 0; state.currentTime = 0; }
    }
    renderPlayer();
  }, 250);
}

function stopPlayLoop() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
}

function renderPlayer() {
  const totalSec = SENTENCES[SENTENCES.length - 1].end;
  const cur = SENTENCES[state.currentSentenceIdx];
  el("speedBtn").textContent = `${state.speeds[state.speedIndex].toFixed(1)}×`;
  el("videoTimeLabel").textContent = `${formatSec(state.currentTime)} / ${formatSec(totalSec)}`;
  el("ambientScene").classList.toggle("paused", !state.playing);
  el("playOverlay").classList.toggle("visible", !state.playing);
  el("playPauseGlyph").textContent = state.playing ? "⏸" : "▶";
  el("maskBtn").classList.toggle("on", state.masked);
  el("maskLabel").textContent = state.masked ? t("masking") : t("mask");
  el("loopBtn").classList.toggle("on", state.loopSentence);
  el("loopLabel").textContent = state.loopSentence ? t("looping") : t("sequential");
  el("timelineFill").style.width = `${(state.currentTime / totalSec) * 100}%`;
  el("loopHighlight").style.left = `${(cur.start / totalSec) * 100}%`;
  el("loopHighlight").style.width = `${((cur.end - cur.start) / totalSec) * 100}%`;

  const scroll = el("subtitleScroll");
  scroll.innerHTML = SENTENCES.map((s, idx) => {
    const display = state.masked ? "• ".repeat(Math.min(14, s.text.split(" ").length)) : s.text;
    return `<div class="sub-row ${idx === state.currentSentenceIdx ? "active" : ""}" data-idx="${idx}">
        <div class="sub-ts">${formatSec(s.start)} – ${formatSec(s.end)}</div><div>${display}</div></div>`;
  }).join("");
  const activeEl = scroll.querySelector(".sub-row.active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function jumpSentence(idx) {
  state.currentSentenceIdx = Math.max(0, Math.min(SENTENCES.length - 1, idx));
  state.currentTime = SENTENCES[state.currentSentenceIdx].start;
  state.playing = true;
  renderPlayer();
}

function bindPlayer() {
  el("backToLibBtn").onclick = closeDetail;
  el("videoTapArea").onclick = () => { state.playing = !state.playing; renderPlayer(); };
  el("playPauseBtn").onclick = () => { state.playing = !state.playing; renderPlayer(); };
  el("maskBtn").onclick = () => { state.masked = !state.masked; renderPlayer(); };
  el("loopBtn").onclick = () => { state.loopSentence = !state.loopSentence; renderPlayer(); };
  el("speedBtn").onclick = () => { state.speedIndex = (state.speedIndex + 1) % state.speeds.length; renderPlayer(); };
  el("prevSentBtn").onclick = () => jumpSentence(state.currentSentenceIdx - 1);
  el("nextSentBtn").onclick = () => jumpSentence(state.currentSentenceIdx + 1);
}
