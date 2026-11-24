// Playback / sentence state and key bindings: app/views/playerController.ts
// Layout math (side-by-side vs stacked): app/views/playerLayout.ts
import {
  effect,
  Image,
  LayoutAnimation,
  Scroll,
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
import { isAudioEntry } from "./libraryViewHelpers";
import { createPlayerController } from "./playerController";
import {
  computePlayerLayout,
  nextLayoutMode,
  PLAYER_SIDE_PAD,
  subtitleTextSize,
  type PlayerLayoutMode,
} from "./playerLayout";
import { SentenceList } from "./SentenceList";
import { VideoDetailHeader } from "./VideoDetailHeader";
import { VideoPlayerControls } from "./VideoPlayerControls";
import {
  calculateFallbackOriginRect,
  calculateTargetRect,
  getViewTransitionHeroStyle,
  setupViewTransitionEnter,
  type TransitionPhase,
  type ViewNodeMeasureTarget,
  type ViewTransitionRect,
} from "./viewTransition";

export type VideoDetailViewProps = {
  entry: () => LibraryEntry;
  /** Absolute filesystem path or streaming URL for nsh <Video src>. */
  src: () => string;
  originRect?: () => ViewTransitionRect | null;
  disabled?: () => boolean;
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
 * Full-screen player page: fixed header, video with a fixed control bar under it,
 * and the subtitle list. Side-by-side or stacked by window aspect ratio.
 */
export function VideoDetailView(props: VideoDetailViewProps) {
  const entry = () => props.entry();
  const audioOnly = () => isAudioEntry(entry()) || !entry().videoPath;
  const poster = () => videoPosterUrl(entry().videoId, entry().thumbnailUrl);
  const language = () => (settings().language === "zh" ? "zh" : "en");
  const m = () => t(language());

  // Layout: the overlay covers the window, so its own size is the window's.
  const size = signal(untracked(initialWindowSize));
  const mode = signal<PlayerLayoutMode>(
    nextLayoutMode("stacked", size().width, size().height),
  );
  const layout = () => computePlayerLayout(mode(), size().width, size().height);
  const textSize = () => subtitleTextSize(layout().subtitleWidth);
  const side = () => layout().mode === "side";

  // Hero transition from the clicked card into the video box.
  const origin = () => props.originRect?.() ?? calculateFallbackOriginRect();
  const measuredTargetRect = signal<ViewTransitionRect | null>(null);
  const target = () => measuredTargetRect() ?? calculateTargetRect();
  const phase = signal<TransitionPhase>("initial");
  const closing = signal(false);
  let targetBoxRef: ViewNodeMeasureTarget | null = null;

  // Auto-scroll: keep the active row ~35% down the subtitle viewport.
  let scrollNode: ScrollRef | null = null;
  let scrollOffsetY = 0;
  let scrollViewportH = 0;
  const rowNodes = new Map<number, ViewRef>();

  const handleClose = () => {
    if (closing()) return;
    closing.set(true);
    ctl.paused.set(true);
    try {
      LayoutAnimation.easeInEaseOut();
    } catch {
      // ignore
    }
    phase.set("closing");
    setTimeout(() => props.onClose(), 360);
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
      targetBoxRef,
      (rect) => measuredTargetRect.set(rect),
      (p) => phase.set(p),
    ),
  );

  const shown = () => phase() === "settled" || phase() === "entering";

  const videoBox = (
    <View
      ref={(node) => {
        targetBoxRef = node;
      }}
      style={{
        width: layout().videoWidth,
        height: layout().videoHeight,
        opacity: phase() === "settled" ? 1 : 0,
        transitionProperty: "opacity",
        transitionDuration: "160ms",
      }}
      class={`relative shrink-0 overflow-hidden bg-black ${side() ? "rounded-lg" : ""}`}
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
        onLoad={() => ctl.errorMsg.set(null)}
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
      {/* Click video surface to play/pause; sits below SubtitleBlocker (z-10) */}
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
    </View>
  );

  const controls = (
    <View style={{ width: layout().videoWidth }} class="shrink-0">
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
      />
    </View>
  );

  const subtitles = (
    <View
      style={side() ? { width: layout().subtitleWidth } : undefined}
      class={`relative min-h-0 ${
        side() ? "shrink-0 border-l border-border" : "w-full flex-1 border-t border-border"
      }`}
    >
      <If when={Boolean(ctl.errorMsg())}>
        <View class="shrink-0 px-4 pt-3">
          <MediaErrorNotice
            errorMsg={ctl.errorMsg}
            mediaPath={() => entry().videoPath ?? entry().audioPath}
            language={language}
            onDismiss={() => ctl.errorMsg.set(null)}
          />
        </View>
      </If>
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
        class="min-h-0 flex-1"
      >
        <View class="mx-auto w-full max-w-[880px] px-3">
          <SentenceList
            showHeader={false}
            sentences={ctl.sentences}
            loading={ctl.loadingSentences}
            activeIndex={ctl.activeIndex}
            paused={ctl.paused}
            maskAll={ctl.maskAll}
            isRevealed={(idx) => Boolean(ctl.revealedMap()[idx])}
            onToggleReveal={ctl.toggleReveal}
            onListen={ctl.playSentence}
            language={language}
            textSize={textSize}
            rowRef={(idx, node) => {
              if (node) rowNodes.set(idx, node);
              else rowNodes.delete(idx);
            }}
          />
        </View>
      </Scroll>
    </View>
  );

  return (
    <View
      class="fixed inset-0 z-50 overflow-hidden"
      onLayout={(e) => {
        const { width, height } = e.bounds.size;
        if (width <= 0 || height <= 0) return;
        size.set({ width, height });
        mode.set(nextLayoutMode(untracked(mode), width, height));
      }}
    >
      <View
        class={`absolute inset-0 bg-background transition-opacity duration-300 ease-out ${
          shown() ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Shared element hero: the card poster zooms into the video box. */}
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
        class={`relative h-full flex-1 flex-col overflow-hidden transition-opacity duration-300 ease-out ${
          shown() ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* One tree for both modes so the <Video> never remounts on a switch. */}
        <View class={`min-h-0 flex-1 ${side() ? "flex-row" : "flex-col"}`}>
          <View
            style={
              side()
                ? { width: layout().mainWidth, padding: PLAYER_SIDE_PAD }
                : { width: layout().mainWidth }
            }
            class={`shrink-0 items-center ${side() ? "justify-center" : ""}`}
          >
            {videoBox}
            {controls}
          </View>
          {subtitles}
        </View>
        <VideoDetailHeader
          title={() => entry().title}
          onBack={handleClose}
          language={language}
          paused={ctl.paused}
          overVideo={() => !side()}
        />
      </View>
    </View>
  );
}
