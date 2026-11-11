import {
  effect,
  Image,
  keymap,
  LayoutAnimation,
  Scroll,
  type ScrollRef,
  signal,
  Video,
  View,
  type ViewRef,
} from "nsh";
import type { LibraryEntry } from "../library/types";
import { clipEnded, msToSeconds, type PlaybackRate } from "../player";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import { videoPosterUrl } from "../youtube/parse";
import type { CaptionCue, Sentence } from "../youtube/types";
import type { SentenceLengthMode } from "../youtube/captions";
import { settings, updateSettings } from "../ui/settings";
import { isAudioEntry } from "./libraryView";
import {
  clampSentenceIndex,
  evaluatePlaybackProgress,
  findSentenceIndexAtTime,
  getNextSentenceIndex,
  getPrevSentenceIndex,
  resegmentSentences,
} from "./sentencePlayer";
// Caption data fetching & sentence segmentation helpers: app/views/videoDetailLoader.ts
import { fetchLessonCaptions } from "./videoDetailLoader";
import { SentenceList } from "./SentenceList";
import { VideoDetailHeader } from "./VideoDetailHeader";
import { VideoDetailMetaBar } from "./VideoDetailMetaBar";
import { VideoPlayerControls } from "./VideoPlayerControls";
import {
  calculateFallbackOriginRect,
  calculateTargetRect,
  getViewTransitionHeroStyle,
  setupViewTransitionEnter,
  type TransitionPhase,
  type ViewTransitionRect,
} from "./viewTransition";

export type VideoDetailViewProps = {
  entry: () => LibraryEntry;
  /** Absolute filesystem path or streaming URL for nsh <Video src>. */
  src: () => string;
  originRect?: () => ViewTransitionRect | null;
  onClose: () => void;
};

/**
 * VideoDetailView:
 * Enlarged video player page with smooth page transition animation,
 * full 100% width video player, fixed header & controls,
 * real-time scrolling subtitle list, and English-first i18n support.
 */
export function VideoDetailView(props: VideoDetailViewProps) {
  const entry = () => props.entry();
  const src = () => props.src();
  const audioOnly = () => isAudioEntry(entry()) || !entry().videoPath;
  const poster = () => videoPosterUrl(entry().videoId, entry().thumbnailUrl);

  // Internationalization: English first by default, reactive to settings
  const language = () => (settings().language === "zh" ? "zh" : "en");
  const m = () => t(language());

  // View Transition animation state: calculates position from originRect to targetRect
  const origin = () => props.originRect?.() ?? calculateFallbackOriginRect();
  const measuredTargetRect = signal<ViewTransitionRect | null>(null);
  const target = () => measuredTargetRect() ?? calculateTargetRect();
  const phase = signal<TransitionPhase>("initial");
  const closing = signal(false);
  let targetBoxRef: {
    measure(): Promise<{
      bounds: { size: { width: number; height: number } };
      pagePosition: { x: number; y: number };
    } | null>;
  } | null = null;

  // Playback & Sentence state
  const paused = signal(false);
  const rate = signal<PlaybackRate>(1);
  const currentTimeSec = signal(0);
  const durationSec = signal(
    entry().durationMs ? Math.round(entry().durationMs! / 1000) : 0,
  );
  const errorMsg = signal<string | null>(null);

  // Subtitle sentences & segmentation length state
  const sentenceLength = signal<SentenceLengthMode>(settings().sentenceLength ?? "short");
  const rawCues = signal<CaptionCue[]>([]);
  const rawSentences = signal<Sentence[]>([]);
  const sentences = signal<Sentence[]>([]);
  const loadingSentences = signal(true);
  const activeIndex = signal(0);
  const clipEndMs = signal<number | null>(null);
  const loopSingle = signal(false);
  const sentencePause = signal(false);
  const muted = signal(false);

  // Mask state: default masked for listening practice (打码)
  const maskAll = signal(true);
  const revealedMap = signal<Record<number, boolean>>({});

  // Immersive controls overlay auto-hide state (5-second countdown timer, mouse-driven only)
  const controlsVisible = signal(false);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const handlePointerActivity = () => {
    controlsVisible.set(true);
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    // 5-second countdown timer. Resets every time mouse moves inside the area.
    hideTimer = setTimeout(() => {
      controlsVisible.set(false);
    }, 5000);
  };

  const handlePointerLeave = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    hideTimer = setTimeout(() => {
      controlsVisible.set(false);
    }, 300);
  };

  const isControlsVisible = () => controlsVisible();

  const handleTogglePlay = () => {
    errorMsg.set(null);
    const next = !paused();
    paused.set(next);
    if (next) {
      if (hideTimer) clearTimeout(hideTimer);
    } else {
      // When unpausing, if sentencePause is on, bind to current sentence clip
      if (sentencePause()) {
        const cur = currentSentence();
        if (cur) {
          clipEndMs.set(cur.endMs);
        }
      } else {
        clipEndMs.set(null);
      }
    }
  };

  const handleToggleSentencePause = () => {
    const next = !sentencePause();
    sentencePause.set(next);
    if (!next) {
      clipEndMs.set(null);
    } else {
      const cur = currentSentence();
      if (cur) {
        clipEndMs.set(cur.endMs);
      }
    }
  };

  const handleToggleLoop = () => {
    const next = !loopSingle();
    loopSingle.set(next);
    if (next) {
      const cur = currentSentence();
      if (cur) {
        clipEndMs.set(cur.endMs);
      }
    }
  };

  const handleChangeSentenceLength = (mode: SentenceLengthMode) => {
    sentenceLength.set(mode);
    updateSettings({ sentenceLength: mode });
    rowNodes.clear();
    const next = resegmentSentences(rawCues(), rawSentences(), mode);
    sentences.set(next);
    const cur = currentTimeSec();
    const nextIdx = findSentenceIndexAtTime(next, cur);
    if (nextIdx >= 0) activeIndex.set(nextIdx);
  };

  const handleChangeLanguage = (lang: EarLocale) => {
    updateSettings({ language: lang });
  };

  let videoNode: { seek(seconds: number): void } | null = null;

  // Auto-scroll: keep the active sentence row centered in the roller while playing
  let scrollNode: ScrollRef | null = null;
  let scrollOffsetY = 0;
  let scrollViewportH = 0;
  const rowNodes = new Map<number, ViewRef>();

  effect(() => {
    const idx = activeIndex();
    if (sentences().length === 0) return;
    const row = rowNodes.get(idx);
    if (!row || !scrollNode) return;
    const scroll = scrollNode;
    void Promise.all([row.measure(), scroll.measure()]).then(([r, sc]) => {
      if (!r || !sc) return;
      const rowTop = r.pagePosition.y - sc.pagePosition.y;
      const viewH = scrollViewportH || sc.bounds.size.height;
      const rowH = r.bounds.size.height || 52;
      // Position active row at ~35% down the viewport, leaving ample room below for 2-3 upcoming sentences
      const targetY = Math.max(0, scrollOffsetY + rowTop - (viewH * 0.35 - rowH / 2));
      scroll.scrollTo({ y: targetY, animated: true });
    });
  });

  const handleSeek = (sec: number) => {
    currentTimeSec.set(sec);
    if (videoNode) {
      videoNode.seek(sec);
    }
  };

  // Trigger View Transition animation on mount: origin thumbnail zooms smoothly into hero player
  effect(() => {
    return setupViewTransitionEnter(
      targetBoxRef,
      (rect) => measuredTargetRect.set(rect),
      (p) => phase.set(p),
    );
  });

  // Load sentences from local captions or remote parse
  effect(() => {
    const cur = entry();
    loadingSentences.set(true);
    void fetchLessonCaptions(cur, sentenceLength())
      .then((data) => {
        rawCues.set(data.cues);
        rawSentences.set(data.rawSentences);
        sentences.set(data.sentences);
      })
      .finally(() => {
        loadingSentences.set(false);
      });
  });

  const handleClose = () => {
    if (closing()) return;
    closing.set(true);
    paused.set(true);
    try {
      LayoutAnimation.easeInEaseOut();
    } catch {
      // ignore
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    phase.set("closing");
    setTimeout(() => {
      props.onClose();
    }, 360);
  };

  // Play a targeted sentence clip from startMs to endMs
  const playSentence = (s: Sentence) => {
    if (!videoNode) return;
    errorMsg.set(null);
    activeIndex.set(s.index);
    clipEndMs.set(s.endMs);
    videoNode.seek(msToSeconds(s.startMs));
    paused.set(false);
  };

  // Quick navigation: repeat current sentence
  const handleRepeatCurrent = () => {
    const list = sentences();
    if (list.length === 0) {
      if (videoNode) {
        videoNode.seek(0);
        paused.set(false);
      }
      return;
    }
    const idx = clampSentenceIndex(activeIndex(), list.length);
    const cur = list[idx];
    if (cur) playSentence(cur);
  };

  // Quick navigation: previous sentence
  const handlePrevSentence = () => {
    const list = sentences();
    if (list.length === 0) return;
    const prevIdx = getPrevSentenceIndex(activeIndex());
    if (prevIdx != null && list[prevIdx]) {
      playSentence(list[prevIdx]!);
    }
  };

  // Quick navigation: next sentence
  const handleNextSentence = () => {
    const list = sentences();
    if (list.length === 0) return;
    const nextIdx = getNextSentenceIndex(activeIndex(), list.length);
    if (nextIdx != null && list[nextIdx]) {
      playSentence(list[nextIdx]!);
    } else {
      // Reached the end: repeat current sentence
      handleRepeatCurrent();
    }
  };

  // Space key handler:
  // - If sentencePause is ON: when paused advances to next sentence; when playing pauses.
  // - If sentencePause is OFF (continuous playback default): standard video play/pause toggle.
  const handleSpaceKey = () => {
    const list = sentences();
    if (list.length === 0) {
      handleTogglePlay();
      return;
    }
    if (sentencePause()) {
      if (activeIndex() === 0 && paused() && currentTimeSec() < 0.2) {
        playSentence(list[0]!);
        return;
      }
      if (paused()) {
        handleNextSentence();
      } else {
        handleTogglePlay();
      }
      return;
    }
    handleTogglePlay();
  };

  // Toggle mask for a single sentence
  const toggleSentenceReveal = (index: number) => {
    const cur = revealedMap();
    revealedMap.set({
      ...cur,
      [index]: !cur[index],
    });
  };

  // Cycle playback rates: 0.8 -> 1 -> 1.2 -> 0.8
  const handleCycleRate = () => {
    const r = rate();
    if (r === 0.8) rate.set(1);
    else if (r === 1) rate.set(1.2);
    else rate.set(0.8);
  };

  const currentSentence = (): Sentence | null => {
    const list = sentences();
    if (list.length === 0) return null;
    return list[clampSentenceIndex(activeIndex(), list.length)] ?? null;
  };

  keymap.bind(
    {
      escape: handleClose,
      left: handlePrevSentence,
      right: handleNextSentence,
      r: handleRepeatCurrent,
      space: handleSpaceKey,
      m: () => maskAll.set(!maskAll()),
    },
    { when: "notEditing" },
  );

  return (
    <View class="fixed inset-0 z-50 overflow-hidden">
      {/* 1. Backdrop dark blur surface: fades in on enter, fades out on close */}
      <View
        class={`absolute inset-0 bg-background/95 backdrop-blur-md transition-opacity duration-300 ease-out ${
          phase() === "settled" || phase() === "entering"
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {/* 2. Shared element transition hero */}
      <View
        style={getViewTransitionHeroStyle(phase(), origin(), target())}
        class="pointer-events-none border border-border bg-black"
      >
        <Image src={poster()} class="h-full w-full object-cover" />
        <If when={audioOnly()}>
          <View class="absolute inset-0 items-center justify-center bg-black/40">
            <Icon name="headphones" size={32} color="#ffffff" />
          </View>
        </If>
      </View>

      {/* 3. Detail contents: 100% Width Video with Immersive Floating Overlays + Controls + Scrollable Subtitles */}
      <View
        class={`relative flex-1 flex-col h-full overflow-hidden transition-all duration-300 ease-out ${
          phase() === "settled" || phase() === "entering"
            ? "opacity-100 translate-y-0"
            : "pointer-events-none opacity-0 translate-y-3"
        }`}
      >
        {/* 1. Video Display: 100% width with immersive floating overlays */}
        <View
          ref={(node) => {
            targetBoxRef = node;
          }}
          onMouseEnter={handlePointerActivity}
          onMouseMove={handlePointerActivity}
          onMouseLeave={handlePointerLeave}
          style={{
            opacity: phase() === "settled" ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: "160ms",
          }}
          class="relative aspect-video w-full shrink-0 overflow-hidden bg-black shadow-2xl"
        >
          <Video
            ref={(node) => {
              videoNode = node;
            }}
            src={src()}
            paused={paused()}
            muted={muted()}
            rate={rate()}
            volume={1}
            controls={false}
            audioSession="playback"
            progressUpdateInterval={80}
            class="h-full w-full object-contain bg-black"
            onLoad={() => errorMsg.set(null)}
            onProgress={(e: { currentTime: number; duration?: number }) => {
              currentTimeSec.set(e.currentTime);
              if (e.duration) durationSec.set(e.duration);

              const res = evaluatePlaybackProgress({
                currentTimeSec: e.currentTime,
                sentences: sentences(),
                paused: paused(),
                loopSingle: loopSingle(),
                sentencePause: sentencePause(),
                clipEndMs: clipEndMs(),
                activeIndex: activeIndex(),
              });

              if (res.action === "loop" && videoNode) {
                videoNode.seek(res.seekToSec);
              } else if (res.action === "pause") {
                paused.set(true);
                if (res.newClipEndMs !== undefined) {
                  clipEndMs.set(res.newClipEndMs);
                }
              } else if (res.action === "advance") {
                activeIndex.set(res.activeIndex);
                if (res.newClipEndMs !== undefined) {
                  clipEndMs.set(res.newClipEndMs);
                }
              } else if (res.newClipEndMs !== undefined) {
                clipEndMs.set(res.newClipEndMs);
              }
            }}
            onError={(e: { message?: string; code?: string }) => {
              paused.set(true);
              const code = e?.code ? ` [${e.code}]` : "";
              errorMsg.set(
                `${e?.message ?? m().playerError}${code} · ${src()}`,
              );
            }}
            onEnd={() => {
              paused.set(true);
              clipEndMs.set(null);
            }}
          />

          <If when={audioOnly() && paused()}>
            <Image
              src={poster()}
              class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
            />
          </If>

          {/* Top Header: Floating overlay (5s countdown timer, mouse-driven only) */}
          <VideoDetailHeader
            entry={entry}
            totalSentences={() => sentences().length}
            loadingSentences={loadingSentences}
            audioOnly={audioOnly}
            onBack={handleClose}
            visible={isControlsVisible}
            onActivity={handlePointerActivity}
            language={language}
          />

          {/* Bottom Player Controls */}
          <VideoPlayerControls
            paused={paused}
            onTogglePlay={handleTogglePlay}
            currentTimeSec={currentTimeSec}
            durationSec={durationSec}
            rate={rate}
            onCycleRate={handleCycleRate}
            loopSingle={loopSingle}
            onToggleLoop={handleToggleLoop}
            muted={muted}
            onToggleMute={() => {
              muted.set(!muted());
              handlePointerActivity();
            }}
            maskAll={maskAll}
            onToggleMask={() => {
              maskAll.set(!maskAll());
              handlePointerActivity();
            }}
            sentences={sentences}
            onPrevSentence={() => {
              handlePrevSentence();
              handlePointerActivity();
            }}
            onRepeatSentence={() => {
              handleRepeatCurrent();
              handlePointerActivity();
            }}
            onNextSentence={() => {
              handleNextSentence();
              handlePointerActivity();
            }}
            onSeek={(sec) => {
              handleSeek(sec);
              handlePointerActivity();
            }}
            language={language}
            visible={isControlsVisible}
            onActivity={handlePointerActivity}
          />
        </View>

        {/* 2. Fixed Section: 前面的标题与操作栏保持固定 */}
        <VideoDetailMetaBar
          entry={entry()}
          audioOnly={audioOnly()}
          totalSentences={sentences().length}
          loadingSentences={loadingSentences()}
          activeIndex={activeIndex}
          currentTimeSec={currentTimeSec}
          durationSec={durationSec}
          rate={rate}
          sentencePause={sentencePause}
          loopSingle={loopSingle}
          onPrevSentence={handlePrevSentence}
          onRepeatSentence={handleRepeatCurrent}
          onNextSentence={handleNextSentence}
          onToggleSentencePause={handleToggleSentencePause}
          onToggleLoop={handleToggleLoop}
          onCycleRate={handleCycleRate}
          sentenceLength={sentenceLength}
          onChangeSentenceLength={handleChangeSentenceLength}
          errorMsg={errorMsg}
          language={language}
        />

        {/* 3. Real-time scrolling subtitle roller with top & bottom subtle vignette fade */}
        <View class="relative flex-1 min-h-0 w-full overflow-hidden bg-background/40">
          {/* Top & bottom subtle fade gradients for 3D teleprompter roller wheel */}
          <View class="pointer-events-none absolute top-0 inset-x-0 h-6 sm:h-8 z-10 bg-gradient-to-b from-background via-background/60 to-transparent" />
          <View class="pointer-events-none absolute bottom-0 inset-x-0 h-8 sm:h-10 z-10 bg-gradient-to-t from-background via-background/60 to-transparent" />

          <Scroll
            ref={(node) => {
              scrollNode = node;
            }}
            scrollEventThrottle={50}
            onScroll={(e) => {
              scrollOffsetY = e.offset.y;
              scrollViewportH = e.size.height;
            }}
            onLayout={(e) => {
              scrollViewportH = e.bounds.size.height;
            }}
            class="flex-1 h-full min-h-0"
          >
            <View class="mx-auto w-full max-w-[1024px] px-4 md:px-6">
              <SentenceList
                showHeader={false}
                sentences={sentences}
                loading={loadingSentences}
                activeIndex={activeIndex}
                paused={paused}
                maskAll={maskAll}
                isRevealed={(idx) => Boolean(revealedMap()[idx])}
                onToggleReveal={toggleSentenceReveal}
                onListen={playSentence}
                language={language}
                rowRef={(idx, node) => {
                  if (node) rowNodes.set(idx, node);
                  else rowNodes.delete(idx);
                }}
              />
            </View>
          </Scroll>
        </View>
      </View>
    </View>
  );
}
