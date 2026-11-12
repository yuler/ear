/* www/public/player-mock.js - DOM Template for Interactive Desktop App Walkthrough */
window.MOCK_WINDOW_HTML = `<div class="window-titlebar">
  <div class="window-dots">
    <div class="dot dot-red"></div>
    <div class="dot dot-yellow"></div>
    <div class="dot dot-green"></div>
  </div>

  <!-- Prominent Demo Play/Pause Controller -->
  <button class="demo-play-pill" id="demo-play-btn" title="点击切换自动演示/暂停演示">
    <span class="status-indicator" id="demo-indicator"></span>
    <span id="demo-play-icon" style="font-size:10px;">⏸</span>
    <span id="auto-cycle-label">自动演示中</span>
  </button>

  <div class="window-meta-info">
    <span class="window-app-name">Ear Desktop</span>
  </div>
</div>

<!-- 3-Step Animated Timeline Progress Bar (Directly below Titlebar) -->
<div class="demo-timeline-bar" id="demo-timeline">
  <div class="timeline-step active" data-step="0" id="step-tab-0">
    <div class="step-label-row">
      <span class="step-num">01</span>
      <span class="step-name">复制与解析</span>
    </div>
    <div class="step-track">
      <div class="step-track-fill" id="step-fill-0"></div>
    </div>
  </div>

  <div class="timeline-step" data-step="1" id="step-tab-1">
    <div class="step-label-row">
      <span class="step-num">02</span>
      <span class="step-name">极速下载</span>
    </div>
    <div class="step-track">
      <div class="step-track-fill" id="step-fill-1"></div>
    </div>
  </div>

  <div class="timeline-step" data-step="2" id="step-tab-2">
    <div class="step-label-row">
      <span class="step-num">03</span>
      <span class="step-name">播放练习</span>
    </div>
    <div class="step-track">
      <div class="step-track-fill" id="step-fill-2"></div>
    </div>
  </div>
</div>

<div class="camera-viewport" id="camera-viewport">
  <!-- Virtual Mouse Pointer for High-Fidelity Simulation -->
  <div class="virtual-cursor" id="virtual-cursor">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 3l7 18 3-7 7-3L3 3z" fill="#000000" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  </div>
  <div class="cursor-ripple-layer" id="cursor-ripple-layer"></div>

  <!-- Camera Rig (3D viewport transforms) -->
  <div class="camera-rig camera-step-0" id="camera-rig">
    <div class="app-frame">
      <!-- Sidebar -->
      <aside class="app-sidebar">
        <div>
          <div class="sidebar-brand">
            <div class="brand-icon" style="width:22px; height:22px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>
              </svg>
            </div>
            <span style="font-size:13px; font-weight:700;">Ear</span>
          </div>
          <div class="sidebar-nav">
            <div class="sidebar-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
              <span>推荐发现</span>
            </div>
            <div class="sidebar-item active">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
              <span>视频练习</span>
              <span class="sidebar-badge">8</span>
            </div>
            <div class="sidebar-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <span>音频播客</span>
              <span class="sidebar-badge">3</span>
            </div>
          </div>
        </div>
        <div class="sidebar-item" style="color:var(--text-dim);">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/></svg>
          <span>偏好设置</span>
        </div>
      </aside>

      <!-- Main Workspace Area -->
      <div class="app-main">
        <!-- Stage 0: Abstract YouTube Browser -> Copy Link -> Ear Ingest & Parse -->
        <div class="stage-pane active" id="pane-0">
          <div class="step-guide-tag" data-i18n="step_0_guide">第 1 步 · 打开 YouTube 网页复制视频链接 → Ear 自动解析并确认下载</div>
          <div class="step0-container">
            <!-- Simulated Safari Browser Window -->
            <div class="safari-card">
              <div class="safari-header">
                <div class="safari-dots">
                  <span></span><span></span><span></span>
                </div>
                <div class="safari-nav-arrows">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <div class="safari-url-pill">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span>youtube.com/watch?v=jiHZqamCD8c</span>
                </div>
                <button class="safari-copy-btn" id="yt-copy-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span id="yt-copy-btn-text">复制视频链接</span>
                </button>
              </div>

              <!-- Safari Page Content (YouTube Video Preview) -->
              <div class="safari-page">
                <div class="safari-yt-box">
                  <div class="safari-thumb-wrap">
                    <img src="/sample-poster.jpg" alt="Steve Jobs Stanford" class="safari-thumb-img" />
                    <span class="safari-thumb-time">10:00</span>
                    <div class="safari-thumb-play">▶</div>
                  </div>
                  <div class="safari-meta-wrap">
                    <div class="safari-yt-title">Steve Jobs' 2005 Stanford Commencement Address</div>
                    <div class="safari-yt-sub">Stanford University · 44M views · English CC Subtitles</div>
                    <div class="safari-yt-tag">✦ 适合托福/雅思/日常听力 Comprehensible Input 精听材料</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Ear Application Omnibar & Ingestion Card -->
            <div class="ear-ingest-card" id="ear-ingest-card">
              <div class="ear-omni-header">
                <div class="ear-omni-input-box">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2f7cf6" stroke-width="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  <span id="ear-omni-text" class="ear-omni-text">粘贴 YouTube 链接开始精听练习...</span>
                </div>
              </div>
              <div class="ear-parse-info" id="ear-parse-info">
                <div>
                  <div class="ear-parse-title">Steve Jobs' 2005 Stanford Commencement Address</div>
                  <div class="ear-badges">
                    <span class="badge-tag accent">1080p Full HD</span>
                    <span class="badge-tag">时长: 10:00</span>
                    <span class="badge-tag">4 线程极速并发</span>
                    <span class="badge-tag">智能断句 (142 句)</span>
                  </div>
                </div>
                <button class="confirm-dl-btn" id="btn-confirm-dl">确认下载 ↗</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Stage 1: Downbit-Style Active Download Row -->
        <div class="stage-pane" id="pane-1">
          <div class="step-guide-tag" data-i18n="step_1_guide">第 2 步 · 我们的应用极速下载 (Downbit 风格横条与灰度渐变过渡)</div>
          <div class="dl-library-container">
            <!-- Downbit-style Active Download Row with Large 16:9 Thumbnail -->
            <div class="active-download-row" id="active-dl-row">
              <!-- Video Thumbnail with Color-to-Grayscale Reveal -->
              <div class="dl-thumb-container">
                <!-- Base Grayscale Layer -->
                <img src="/sample-poster.jpg" alt="Grayscale base" class="dl-thumb-base" />
                <!-- Top Color Reveal Layer -->
                <div class="dl-thumb-color-clip" id="dl-thumb-color">
                  <img src="/sample-poster.jpg" alt="Vibrant color" class="dl-thumb-color-img" />
                </div>
                <span class="dl-thumb-chip" id="dl-thumb-badge">1080p</span>
              </div>

              <!-- Telemetry & Progress Details -->
              <div class="dl-details-box">
                <div class="dl-title-row">
                  <span class="dl-title-text">Steve Jobs' 2005 Stanford Commencement Address</span>
                  <span class="dl-tag-engine" id="dl-engine-tag">4-Thread Range Engine</span>
                </div>

                <div class="dl-status-text" id="dl-stage-text">Starting background download…</div>

                <!-- Downbit Progress Bar -->
                <div class="dl-bar-track">
                  <div class="dl-bar-fill" id="dl-progress-bar"></div>
                </div>

                <!-- Live Speed, ETA, and Bytes Transferred -->
                <div class="dl-metrics-row">
                  <span class="dl-metrics-left" id="dl-telemetry-text">速度: 24.8 MB/s · ETA: 2s · 0 MB / 46.8 MB</span>
                  <span class="dl-metrics-right" id="dl-percent-text">0%</span>
                </div>
              </div>
            </div>

            <!-- Complete Callout Action -->
            <div class="dl-complete-action" id="dl-complete-action">
              <div class="dl-complete-msg">
                <span class="dl-check-icon">✓</span>
                <div>
                  <div style="font-size:13px; font-weight:700; color:#27c93f;">下载已完成</div>
                  <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">1080p 全高清 · 142 个独立精听练习单元已就绪</div>
                </div>
              </div>
              <button class="btn-start-play" id="btn-start-play">▶ 点开播放 (进入练习)</button>
            </div>
          </div>
        </div>

        <!-- Stage 2: VideoDetailView Player with Box 2 Consistent Controls -->
        <div class="stage-pane" id="pane-2">
          <div class="player-stage">
            <!-- Header Bar -->
            <div class="player-top-header">
              <div class="player-header-left">
                <button class="player-back-btn" id="player-back-step" title="返回上一步">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="player-video-title">Steve Jobs' 2005 Stanford Commencement Address</div>
                <span class="badge-tag">1080p</span>
                <span class="badge-tag">10:00</span>
                <span class="badge-tag">142 句</span>
              </div>
              <button class="mask-toggle-btn" id="btn-mask-header">
                <span id="mask-icon">👁️</span>
                <span id="mask-label">遮罩已开启</span>
              </button>
            </div>

            <!-- Video Container with Large Aspect Ratio & Real HTML5 10s Video -->
            <div class="video-container" id="video-wrapper">
              <video id="practice-video" src="/sample.mp4" poster="/sample-poster.jpg" playsinline preload="auto" loop muted></video>
              <div class="video-center-play" id="video-center-btn">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
              </div>

              <!-- Box 2: Video Player Controls Bar (Strictly Matching VideoPlayerControls.tsx) -->
              <div class="vctrl-overlay" id="video-controls-overlay">
                <!-- 1. Seekable Progress Bar with Sentence Ticks -->
                <div class="vctrl-progress-box">
                  <div class="vctrl-track" id="video-track">
                    <div class="vctrl-fill" id="video-fill"></div>
                    <!-- Sentence marker ticks across the track -->
                    <div class="vctrl-tick" style="left: 0%;"></div>
                    <div class="vctrl-tick" style="left: 14%;"></div>
                    <div class="vctrl-tick" style="left: 28%;"></div>
                    <div class="vctrl-tick" style="left: 45%;"></div>
                    <div class="vctrl-tick" style="left: 62%;"></div>
                    <div class="vctrl-tick" style="left: 78%;"></div>
                    <div class="vctrl-tick" style="left: 92%;"></div>
                  </div>
                  <div class="vctrl-thumb" id="video-thumb"></div>
                </div>

                <!-- 2. Controls Toolbar Row -->
                <div class="vctrl-toolbar">
                  <!-- Left: Play/Pause, Sentence jumps, Time -->
                  <div class="vctrl-group-left">
                    <button class="vctrl-btn-icon" id="ctrl-play-btn" title="播放 / 暂停 (Space)">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" id="ctrl-play-icon"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </button>
                    <button class="vctrl-btn-text" id="ctrl-prev-btn" title="上一句">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"/></svg>
                      <span>上一句</span>
                    </button>
                    <button class="vctrl-btn-primary" id="ctrl-repeat-btn" title="重播本句 (R)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                      <span>重播本句</span>
                    </button>
                    <button class="vctrl-btn-text" id="ctrl-next-btn" title="下一句">
                      <span>下一句</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    <div class="vctrl-time">
                      <span id="video-cur-time">00:00:00</span>
                      <span class="vctrl-time-sep"> / </span>
                      <span id="video-total-time">00:00:10</span>
                    </div>
                  </div>

                  <!-- Right: Loop single, Speed, Mute, Mask -->
                  <div class="vctrl-group-right">
                    <button class="vctrl-btn-text" id="ctrl-loop-btn" title="单句循环">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                      <span>单句循环</span>
                    </button>
                    <button class="vctrl-btn-text" id="ctrl-speed-btn" title="播放速度">
                      <span id="ctrl-speed-text">1.0x</span>
                    </button>
                    <button class="vctrl-btn-icon" id="ctrl-mute-btn" title="静音切换">
                      <span id="ctrl-mute-icon">🔊</span>
                    </button>
                    <button class="vctrl-btn-text" id="ctrl-mask-btn" title="遮罩字幕 (M)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      <span id="ctrl-mask-text">遮罩</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Subtitle Meta Bar -->
            <div class="sentence-meta-bar">
              <span class="s-tag-idx">Sentence 08 / 142 · 00:01:20 - 00:01:28</span>
              <span class="s-hint-tip">💡 默认遮蔽字幕阻断看字幻觉 · 盲听后按 Space 偷看揭晓</span>
            </div>

            <!-- Real-Time Subtitle Roller Area -->
            <div class="sentence-roller-area">
              <div class="sentence-row preceding">
                <span class="s-time">00:01:16</span>
                <span class="s-text">You have to trust that the dots will somehow connect in your future.</span>
              </div>
              <div class="sentence-row active" id="active-sentence-card" title="点击或按 Space/R 偷看揭晓字幕">
                <div class="s-caption-box" id="s-caption-box">
                  <div class="s-mask-line" id="s-mask-line">•••••••• ••••• •• ••••• •••• ••• ••••• •••• •••• •• ••••</div>
                  <div class="s-real-line" id="s-real-line">My second story is about love and loss. I was lucky — I found what I loved to do early in life.</div>
                </div>
              </div>
              <div class="sentence-row upcoming">
                <span class="s-time">00:01:28</span>
                <span class="s-text">Woz and I started Apple in my parents garage when I was 20.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
