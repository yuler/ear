/* www/public/player-controls.js - Mock video player controls for the hero demo */
(function() {
  const $ = (id) => document.getElementById(id);
  const PAUSE_ICON = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
  const PLAY_ICON = `<polygon points="6 4 20 12 6 20 6 4"/>`;

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    return `00:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function setPlayingUi(playing) {
    const state = window.state;
    const wrapper = $("video-wrapper");
    const icon = $("ctrl-play-icon");
    state.isPlaying = playing;
    if (wrapper) wrapper.classList.toggle("paused", !playing);
    if (icon) icon.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  }

  function playVideo(fromStart) {
    const video = $("practice-video");
    if (!video) return;
    if (fromStart) video.currentTime = 0;
    video.muted = true;
    const muteIcon = $("ctrl-mute-icon");
    if (muteIcon) muteIcon.textContent = "🔇";
    video.play().then(() => setPlayingUi(true)).catch(() => setPlayingUi(false));
  }

  function pauseVideo() {
    const video = $("practice-video");
    if (video && !video.paused) video.pause();
    setPlayingUi(false);
  }

  function togglePlayPause() {
    const video = $("practice-video");
    if (!video) return;
    if (video.paused) playVideo(false);
    else pauseVideo();
  }

  // onProgress(pct) lets the demo keep its step timeline synced with the video.
  function bindVideoControls(onProgress, toggleReveal) {
    const state = window.state;
    const video = $("practice-video");
    const progressBox = $("video-progress-box");
    const curTime = $("video-cur-time");
    const totalTime = $("video-total-time");
    const track = $("video-track");
    if (!video) return;

    video.addEventListener("timeupdate", () => {
      const dur = video.duration || 10;
      const ratio = Math.min(1, Math.max(0, video.currentTime / dur));
      if (progressBox) progressBox.style.setProperty("--p", ratio);
      if (curTime) curTime.textContent = formatTime(video.currentTime);
      if (totalTime) totalTime.textContent = formatTime(dur);
      if (onProgress) onProgress(ratio * 100);
    });

    if (track) {
      track.addEventListener("click", (e) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = ratio * (video.duration || 10);
      });
    }

    const on = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener("click", fn);
    };

    on("ctrl-play-btn", togglePlayPause);
    on("video-center-btn", togglePlayPause);
    on("ctrl-repeat-btn", () => {
      video.currentTime = 0;
      if (video.paused) playVideo(false);
    });
    on("ctrl-prev-btn", () => {
      video.currentTime = Math.max(0, video.currentTime - 2.5);
    });
    on("ctrl-next-btn", () => {
      video.currentTime = Math.min(video.duration || 10, video.currentTime + 2.5);
    });
    on("ctrl-speed-btn", () => {
      if (state.speed === 1.0) state.speed = 1.2;
      else if (state.speed === 1.2) state.speed = 0.8;
      else state.speed = 1.0;
      video.playbackRate = state.speed;
      const speedText = $("ctrl-speed-text");
      if (speedText) speedText.textContent = state.speed.toFixed(1) + "x";
    });
    on("ctrl-mute-btn", () => {
      video.muted = !video.muted;
      const muteIcon = $("ctrl-mute-icon");
      if (muteIcon) muteIcon.textContent = video.muted ? "🔇" : "🔊";
    });

    on("ctrl-mask-btn", toggleReveal);
    on("btn-mask-header", toggleReveal);
    on("active-sentence-card", toggleReveal);
  }

  window.EarDemoVideo = { bindVideoControls, playVideo, pauseVideo };
})();
