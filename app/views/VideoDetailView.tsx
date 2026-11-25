// Playback / sentence state and key bindings: app/views/playerController.ts
// Layout math (side-by-side vs stacked): app/views/playerLayout.ts
import {
  effect,
  Image,
  LayoutAnimation,
  type ScrollRef,
  signal,
  untracked,
  Video,
  View,
  type ViewRef,
} from "nsh";
import { windowState } from "nsh/desktop";
import { Button } from "nsh/base";
import type { LibraryEntry } from "../library/types";
import { Icon } from "../ui/Icon";
import { t } from "../ui/i18n";
import { MediaErrorNotice } from "../ui/MediaErrorNotice";
import { settings } from "../ui/settings";
import { SubtitleBlocker } from "../ui/SubtitleBlocker";
import { videoPosterUrl } from "../youtube/parse";
import { entryMediaAspect, isAudioEntry } from "./libraryViewHelpers";
import { createPlayerController } from "./playerController";
import {
  computePlayerLayout,
  isCompactStudio,
  resolveAutoLayoutMode,
  subtitleTextSize,
  type PlayerLayoutMode,
} from "./playerLayout";
import { SubtitleStudio } from "./SubtitleStudio";
import { VideoDetailHeader } from "./VideoDetailHeader";
import { shouldShowPlayerControls, VideoPlayerControls } from "./VideoPlayerControls";
import {
  animateLayoutTransition,
  calculateFallbackOriginRect,
  CLOSE_DURATION_MS,
  getViewTransitionHeroStyle,
  layoutTargetRect,
  setupViewTransitionEnter,
  type TransitionPhase,
  type ViewTransitionRect,
} from "./viewTransition";

export type VideoDetailViewProps = {
  entry: () => LibraryEntry;
  /** Absolute filesystem path or streaming URL for nsh <Video src>. */
  src: () => string;
  originRect?: () => ViewTransitionRect | null;
  disabled?: () => boolean;
  onMediaDimensions?: (videoId: string, width: number, height: number) => void;
  onClose: () => void;
};

function initialWindowSize(): { width: number; height: number } {
  try {
    const size = windowState()?.contentBounds.size;
    if (size && size.width > 0 && size.height > 0) return size;
  } catch {
    // off desktop
  }
  const g = globalThis as { innerWidth?: number; innerHeight?: number };
  return { width: g.innerWidth ?? 1200, height: g.innerHeight ?? 800 };
}

/**
 * Full-screen player page: floating header, video with YouTube-style bottom overlay
 * controls, and the subtitle list. Side-by-side or stacked by window aspect ratio.
 */
export function VideoDetailView(props: VideoDetailViewProps) {
  const entry = () => props.entry();
  const audioOnly = () => isAudioEntry(entry()) || !entry().videoPath;
  const poster = () => videoPosterUrl(entry().videoId, entry().thumbnailUrl);
  const language = () => (settings().language === "zh" ? "zh" : "en");
  const m = () => t(language());

  // Layout: seed aspect immediately from persisted entry dimensions so portrait videos
  // enter directly in side-by-side mode without a stacked→side jump; user can still override.
  const size = signal(untracked(initialWindowSize));
  const initialAspect = untracked(() => entryMediaAspect(entry()));
  const mediaAspect = signal<number | null>(initialAspect);
  const autoMode = signal<PlayerLayoutMode>(
    resolveAutoLayoutMode("stacked", size().width, size().height, initialAspect),
  );
  const layoutOverride = signal<PlayerLayoutMode | null>(null);
  const effectiveMode = (): PlayerLayoutMode => layoutOverride() ?? autoMode();
  const layout = () =>
    computePlayerLayout(effectiveMode(), size().width, size().height, mediaAspect());
  const textSize = () => subtitleTextSize(layout().subtitleWidth);
  const side = () => layout().mode === "side";
  const compactStudio = () => isCompactStudio(size().width, size().height);
  const largeStudio = () => size().width >= 1420;

  const toggleLayout = () => {
    const current = effectiveMode();
    const next: PlayerLayoutMode = current === "side" ? "stacked" : "side";
    try {
      LayoutAnimation.easeInEaseOut();
    } catch {
      // ignore on test host
    }
    // Returning to the automatic mode clears the manual override so resize auto-adapts again.
    layoutOverride.set(next === autoMode() ? null : next);
  };

  // Hero transition from the clicked card directly into the exact computed video stage.
  const origin = () =>
    props.originRect?.() ??
    calculateFallbackOriginRect(size().width, size().height);
  const target = () => layoutTargetRect(layout());
  const phase = signal<TransitionPhase>("initial");
  const closing = signal(false);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  // YouTube-style controls auto-hide: reveal on hover/activity, hide after 2.4s idle while playing.
  const videoHovered = signal(false);
  const controlsHovered = signal(false);
  let controlsIdleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearControlsTimer = () => {
    if (controlsIdleTimer) {
      clearTimeout(controlsIdleTimer);
      controlsIdleTimer = null;
    }
  };

  const scheduleControlsHide = () => {
    clearControlsTimer();
    controlsIdleTimer = setTimeout(() => {
      if (!untracked(controlsHovered)) {
        videoHovered.set(false);
      }
    }, 2400);
  };

  const revealControls = () => {
    videoHovered.set(true);
    if (!untracked(controlsHovered)) {
      scheduleControlsHide();
    }
  };

  effect(() => () => {
    clearControlsTimer();
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  });

  // Auto-scroll: keep the active row ~35% down the subtitle viewport.
  let scrollNode: ScrollRef | null = null;
  let scrollOffsetY = 0;
  let scrollViewportH = 0;
  const rowNodes = new Map<number, ViewRef>();

  const handleClose = () => {
    if (closing()) return;
    closing.set(true);
    ctl.paused.set(true);
    animateLayoutTransition(CLOSE_DURATION_MS);
    phase.set("closing");
    closeTimer = setTimeout(() => props.onClose(), CLOSE_DURATION_MS + 20);
  };

  const ctl = createPlayerController({
    entry,
    disabled: props.disabled,
    onClose: handleClose,
    onResegment: () => rowNodes.clear(),
  });

  effect(() => {
    const idx = ctl.activeIndex();
    if (ctl.sentences().length === 0) return;
    const row = rowNodes.get(idx);
    if (!row || !scrollNode) return;
    const scroll = scrollNode;
    void Promise.all([row.measure(), scroll.measure()]).then(([r, sc]) => {
      if (!r || !sc) return;
      const rowTop = r.pagePosition.y - sc.pagePosition.y;
      const viewH = scrollViewportH || sc.bounds.size.height;
      const rowH = r.bounds.size.height || 52;
      const targetY = Math.max(0, scrollOffsetY + rowTop - (viewH * 0.35 - rowH / 2));
      scroll.scrollTo({ y: targetY, animated: true });
    });
  });

  effect(() =>
    setupViewTransitionEnter(
      null,
      () => {},
      (p) => phase.set(p),
    ),
  );

  const shown = () => phase() === "settled" || phase() === "entering";
  const controlsVisible = () =>
    shouldShowPlayerControls(ctl.paused(), videoHovered() || controlsHovered());

  const videoBox = (
    <View
      onMouseEnter={revealControls}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        clearControlsTimer();
        videoHovered.set(false);
        controlsHovered.set(false);
      }}
      style={{
        width: layout().videoWidth,
        height: layout().videoHeight,
      }}
      class="relative shrink-0 overflow-hidden bg-black"
    >
      <Video
        ref={(node) => ctl.setVideoNode(node)}
        src={props.src()}
        paused={ctl.paused()}
        muted={ctl.muted()}
        rate={ctl.rate()}
        volume={ctl.volume()}
        controls={false}
        audioSession="playback"
        progressUpdateInterval={80}
        class="h-full w-full object-contain"
        onLoad={(e?: { duration?: number; size?: { width: number; height: number } }) => {
          ctl.errorMsg.set(null);
          if (e?.duration && e.duration > 0) {
            ctl.durationSec.set(e.duration);
          }
          const w = e?.size?.width ?? 0;
          const h = e?.size?.height ?? 0;
          if (!audioOnly() && w > 0 && h > 0) {
            const curEntry = untracked(entry);
            if (curEntry.videoWidth !== w || curEntry.videoHeight !== h) {
              props.onMediaDimensions?.(curEntry.videoId, w, h);
            }
            const nextAspect = w / h;
            const prevAspect = untracked(mediaAspect);
            if (prevAspect === null || Math.abs(nextAspect - prevAspect) >= 0.02) {
              mediaAspect.set(nextAspect);
              const curSize = untracked(size);
              const nextAuto = resolveAutoLayoutMode(
                untracked(autoMode),
                curSize.width,
                curSize.height,
                nextAspect,
              );
              if (nextAuto !== untracked(autoMode)) {
                if (untracked(phase) === "settled") {
                  try {
                    LayoutAnimation.easeInEaseOut();
                  } catch {
                    // ignore on test host
                  }
                }
                autoMode.set(nextAuto);
              }
            }
          }
        }}
        onProgress={ctl.onProgress}
        onError={(e: { message?: string; code?: string }) => {
          ctl.paused.set(true);
          const code = e?.code ? ` [${e.code}]` : "";
          ctl.errorMsg.set(`${e?.message ?? m().playerError}${code} · ${props.src()}`);
        }}
        onEnd={ctl.onEnd}
      />
      <If when={audioOnly()}>
        <Image
          src={poster()}
          class="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      </If>
      {/* Click video surface to play/pause; sits below SubtitleBlocker (z-10) and Controls (z-20) */}
      <Button
        onPress={ctl.togglePlay}
        class="absolute inset-0 items-center justify-center cursor-pointer"
        accessibilityLabel={ctl.paused() ? m().play : m().pause}
      >
        <If when={ctl.paused()}>
          <View class="h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-brand/90 shadow-xl backdrop-blur-sm transition hover:scale-105 hover:bg-brand active:scale-95">
            <Icon name="play" size={22} color="#ffffff" />
          </View>
        </If>
      </Button>
      <If when={!audioOnly()}>
        <SubtitleBlocker
          videoId={() => entry().videoId}
          enabled={ctl.blockerEnabled}
          language={language}
          onToggleEnabled={ctl.toggleBlocker}
        />
      </If>
      <VideoPlayerControls
        paused={ctl.paused}
        onTogglePlay={ctl.togglePlay}
        currentTimeSec={ctl.currentTimeSec}
        durationSec={ctl.durationSec}
        onSeek={ctl.seek}
        sentences={ctl.sentences}
        onPrevSentence={ctl.prevSentence}
        onRepeatSentence={ctl.repeatCurrent}
        onNextSentence={ctl.nextSentence}
        rate={ctl.rate}
        onCycleRate={ctl.cycleRate}
        muted={ctl.muted}
        onToggleMute={ctl.toggleMute}
        sentencePause={ctl.sentencePause}
        onToggleSentencePause={ctl.toggleSentencePause}
        maskAll={ctl.maskAll}
        onToggleMask={ctl.toggleMask}
        sentenceLength={ctl.sentenceLength}
        onChangeSentenceLength={ctl.changeSentenceLength}
        blockerEnabled={audioOnly() ? undefined : ctl.blockerEnabled}
        onToggleBlocker={audioOnly() ? undefined : ctl.toggleBlocker}
        language={language}
        visible={controlsVisible}
        compact={() => layout().videoWidth < 680}
        layoutMode={effectiveMode}
        layoutManual={() => layoutOverride() !== null}
        onToggleLayout={toggleLayout}
        onControlsMouseEnter={() => {
          clearControlsTimer();
          controlsHovered.set(true);
          videoHovered.set(true);
        }}
        onControlsMouseLeave={() => {
          controlsHovered.set(false);
          scheduleControlsHide();
        }}
      />
    </View>
  );

  const subtitleStyle = () => {
    const isHidden = phase() === "initial" || phase() === "closing";
    return {
      ...(side() ? { width: layout().subtitleWidth } : {}),
      opacity: isHidden ? 0 : 1,
      transform: isHidden
        ? side()
          ? "translateX(20px)"
          : "translateY(16px)"
        : "translateX(0px) translateY(0px)",
      transitionProperty: "transform, opacity",
      transitionDuration: (phase() === "closing" ? "200ms" : "280ms") as `${number}ms`,
      transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" as const,
    };
  };

  const subtitles = (
    <View
      style={subtitleStyle()}
      class={`relative min-h-0 flex-col ${
        side() ? "shrink-0 border-l border-border" : "w-full flex-1 border-t border-border"
      }`}
    >
      <If when={Boolean(ctl.errorMsg())}>
        <View class="shrink-0 bg-well/65 px-4 pt-3">
          <MediaErrorNotice
            errorMsg={ctl.errorMsg}
            mediaPath={() => entry().videoPath ?? entry().audioPath}
            language={language}
            onDismiss={() => ctl.errorMsg.set(null)}
          />
        </View>
      </If>
      <SubtitleStudio
        sentences={ctl.sentences}
        loading={ctl.loadingSentences}
        activeIndex={ctl.activeIndex}
        paused={ctl.paused}
        maskAll={ctl.maskAll}
        isRevealed={(idx) => Boolean(ctl.revealedMap()[idx])}
        onToggleReveal={ctl.toggleReveal}
        onListen={ctl.playSentence}
        onRepeatSentence={ctl.repeatCurrent}
        side={side}
        compact={compactStudio}
        large={largeStudio}
        language={language}
        textSize={textSize}
        scrollRef={(node) => {
          scrollNode = node;
        }}
        onStreamScroll={(offsetY, viewportH) => {
          scrollOffsetY = offsetY;
          scrollViewportH = viewportH;
        }}
        onStreamLayout={(viewportH) => {
          scrollViewportH = viewportH;
        }}
        rowRef={(idx, node) => {
          if (node) rowNodes.set(idx, node);
          else rowNodes.delete(idx);
        }}
      />
    </View>
  );

  return (
    <View
      class="fixed inset-0 z-50 overflow-hidden"
      onLayout={(e) => {
        const { width, height } = e.bounds.size;
        if (width <= 0 || height <= 0) return;
        const curSize = untracked(size);
        if (curSize.width !== width || curSize.height !== height) {
          size.set({ width, height });
        }
        const curAuto = untracked(autoMode);
        const nextAuto = resolveAutoLayoutMode(
          curAuto,
          width,
          height,
          untracked(mediaAspect),
        );
        if (nextAuto !== curAuto) {
          autoMode.set(nextAuto);
        }
      }}
    >
      <View
        style={{
          opacity: shown() ? 1 : 0,
          transitionProperty: "opacity",
          transitionDuration: phase() === "closing" ? "200ms" : "240ms",
          transitionTimingFunction: "ease-out",
        }}
        class={`absolute inset-0 bg-background ${shown() ? "" : "pointer-events-none"}`}
      />

      {/* Shared element hero: the card poster glides directly to the known portrait or landscape stage. */}
      <View
        style={getViewTransitionHeroStyle(phase(), origin(), target())}
        class="pointer-events-none bg-black"
      >
        <Image src={poster()} class="h-full w-full object-cover" />
        <If when={audioOnly()}>
          <View class="absolute inset-0 items-center justify-center bg-black/40">
            <Icon name="headphones" size={32} color="white" />
          </View>
        </If>
      </View>

      <View
        style={{
          opacity: shown() ? 1 : 0,
          transitionProperty: "opacity",
          transitionDuration: phase() === "closing" ? "200ms" : "240ms",
          transitionTimingFunction: "ease-out",
        }}
        class={`relative h-full flex-1 flex-col overflow-hidden ${
          shown() ? "" : "pointer-events-none"
        }`}
      >
        {/* One tree for both modes so the <Video> never remounts on a switch. */}
        <View class={`min-h-0 flex-1 ${side() ? "flex-row" : "flex-col"}`}>
          <View
            style={{ width: layout().mainWidth }}
            class={`shrink-0 bg-black ${side() ? "h-full" : ""}`}
          >
            {videoBox}
          </View>
          {subtitles}
        </View>
        <VideoDetailHeader
          title={() => entry().title}
          onBack={handleClose}
          language={language}
          paused={ctl.paused}
          overVideo={() => true}
          width={() => layout().mainWidth}
        />
      </View>
    </View>
  );
}
