import { effect, Image, keymap, Scroll, signal, Text, Video, View } from "nsh";
import { Button } from "nsh/base";
import { loadLessonFromEntry } from "../library/index";
import type { LibraryEntry } from "../library/types";
import { clipEnded, msToSeconds, type PlaybackRate } from "../player";
import { Icon } from "../ui/Icon";
import { hostFetch } from "../youtube/host";
import { loadLesson, videoPosterUrl } from "../youtube/parse";
import type { Sentence } from "../youtube/types";
import { maskCaption } from "./blindFlow";
import { isAudioEntry } from "./libraryView";
import { SentenceControlsBar } from "./SentenceControlsBar";
import {
  clampSentenceIndex,
  findSentenceIndexAtTime,
  getNextSentenceIndex,
  getPrevSentenceIndex,
  isSentenceMasked,
} from "./sentencePlayer";
import { SentenceRow } from "./SentenceRow";

export type VideoDetailViewProps = {
  entry: () => LibraryEntry;
  /** Absolute filesystem path or streaming URL for nsh <Video src>. */
  src: () => string;
  onClose: () => void;
};

/**
 * VideoDetailView:
 * Enlarged video player page with smooth page transition animation,
 * full sentence listing, caption masking (打码 + "去听"),
 * and quick sentence navigation (上一句 / 下一句 / 重复听 / 单句循环).
 *
 * Child components:
 * - Controls: app/views/SentenceControlsBar.tsx
 * - Sentence item: app/views/SentenceRow.tsx
 * - Helpers & logic: app/views/sentencePlayer.ts
 */
export function VideoDetailView(props: VideoDetailViewProps) {
  const entry = () => props.entry();
  const src = () => props.src();
  const audioOnly = () => isAudioEntry(entry()) || !entry().videoPath;
  const poster = () => videoPosterUrl(entry().videoId, entry().thumbnailUrl);

  // Transition animation state: mounts in initial state then expands smoothly
  const entered = signal(false);
  const closing = signal(false);

  // Playback & Sentence state
  const paused = signal(false);
  const rate = signal<PlaybackRate>(1);
  const currentTimeSec = signal(0);
  const durationSec = signal(
    entry().durationMs ? Math.round(entry().durationMs! / 1000) : 0,
  );
  const errorMsg = signal<string | null>(null);

  // Subtitle sentences state
  const sentences = signal<Sentence[]>([]);
  const loadingSentences = signal(true);
  const activeIndex = signal(0);
  const clipEndMs = signal<number | null>(null);
  const loopSingle = signal(false);

  // Mask state: default masked for listening practice (打码)
  const maskAll = signal(true);
  const revealedMap = signal<Record<number, boolean>>({});

  let videoNode: { seek(seconds: number): void } | null = null;

  // Trigger web page transition animation on mount
  effect(() => {
    const timer = setTimeout(() => {
      entered.set(true);
    }, 20);
    return () => clearTimeout(timer);
  });

  // Load sentences from local captions or remote parse
  effect(() => {
    const cur = entry();
    loadingSentences.set(true);
    void loadLessonFromEntry(cur)
      .then(async (loaded) => {
        if (loaded && loaded.sentences.length > 0) {
          return loaded;
        }
        if (cur.url) {
          return await loadLesson(cur.url, hostFetch).catch(() => null);
        }
        return null;
      })
      .then((res) => {
        if (res && res.sentences.length > 0) {
          sentences.set(res.sentences);
        } else {
          sentences.set([]);
        }
      })
      .catch(() => {
        sentences.set([]);
      })
      .finally(() => {
        loadingSentences.set(false);
      });
  });

  const handleClose = () => {
    if (closing()) return;
    closing.set(true);
    entered.set(false);
    setTimeout(() => {
      props.onClose();
    }, 240);
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
    }
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
      space: () => {
        if (clipEndMs() != null) {
          handleRepeatCurrent();
        } else {
          paused.set(!paused());
        }
      },
      m: () => maskAll.set(!maskAll()),
    },
    { when: "notEditing" },
  );

  return (
    <View
      class={`fixed inset-0 z-50 flex-col bg-background/95 backdrop-blur-md transition-all duration-300 ease-out ${
        entered() ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {/* 1. Header with back button, animated transition banner, and actions */}
      <View class="flex-row items-center justify-between border-b border-line bg-popover/80 px-4 py-2.5 shadow-sm">
        <View class="flex-row items-center gap-3">
          <Button
            onPress={handleClose}
            class="flex-row items-center gap-1.5 rounded-lg border border-line bg-well/60 px-3 py-1.5 transition hover:bg-well active:scale-95"
            accessibilityLabel="Back to library"
          >
            <Icon name="chevron-left" size={14} tone="foreground" />
            <Text class="text-xs font-medium text-foreground">返回列表</Text>
          </Button>

          {/* Web transition indicator badge */}
          <View class="flex-row items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5">
            <View class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <Text class="font-mono text-[11px] font-semibold text-primary">
              网页过渡动画 · 放大播放与字幕精听
            </Text>
          </View>
        </View>

        <View class="flex-row items-center gap-2">
          {/* Global mask toggle button */}
          <Button
            onPress={() => maskAll.set(!maskAll())}
            class={`flex-row items-center gap-1.5 rounded-lg border px-3 py-1.5 transition ${
              maskAll()
                ? "border-amber/50 bg-amber-soft text-amber"
                : "border-line bg-well/60 text-muted-foreground"
            }`}
          >
            <Icon
              name={maskAll() ? "eye-off" : "eye"}
              size={13}
              tone={maskAll() ? "foreground" : "muted-foreground"}
            />
            <Text
              class={`text-xs font-medium ${
                maskAll() ? "text-amber font-semibold" : "text-muted-foreground"
              }`}
            >
              {maskAll() ? "字幕已打码 (去听)" : "显示原文字幕"}
            </Text>
          </Button>

          {/* Close button */}
          <Button
            onPress={handleClose}
            class="h-8 w-8 items-center justify-center rounded-lg border border-line bg-well/60 active:bg-accent"
            accessibilityLabel="Close"
          >
            <Icon name="x" size={14} tone="foreground" />
          </Button>
        </View>
      </View>

      {/* 2. Main content area: Enlarged video on top, sentences list below */}
      <Scroll class="flex-1">
        <View
          class={`mx-auto w-full max-w-[960px] gap-4 p-4 md:p-5 transition-transform duration-300 ease-out ${
            entered() ? "scale-100 translate-y-0" : "scale-[0.97] translate-y-2"
          }`}
        >
          {/* Title and metadata */}
          <View class="gap-1">
            <Text class="line-clamp-2 text-base font-semibold text-foreground md:text-lg">
              {entry().title}
            </Text>
            <View class="flex-row flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Text class="font-mono text-xs">
                {entry().quality ?? (audioOnly() ? "Audio" : "Video")}
              </Text>
              <Text class="text-dim">·</Text>
              <Text class="font-mono text-xs">
                {sentences().length > 0
                  ? `共 ${sentences().length} 句字幕`
                  : loadingSentences()
                    ? "正在解析字幕…"
                    : "暂无字幕"}
              </Text>
              <If when={entry().subtitleLabel}>
                <Text class="text-dim">·</Text>
                <Text class="text-xs">{entry().subtitleLabel}</Text>
              </If>
            </View>
          </View>

          {/* 3. Enlarged Video Player Container (Feature 1: 把这个视频放大) */}
          <View class="relative aspect-video w-full max-h-[460px] overflow-hidden rounded-xl border border-line bg-black shadow-2xl">
            <Video
              ref={(node) => {
                videoNode = node;
              }}
              src={src()}
              paused={paused()}
              rate={rate()}
              volume={1}
              controls={false}
              audioSession="playback"
              progressUpdateInterval={80}
              class="h-full w-full object-contain"
              onLoad={() => errorMsg.set(null)}
              onProgress={(e: { currentTime: number; duration?: number }) => {
                currentTimeSec.set(e.currentTime);
                if (e.duration) durationSec.set(e.duration);

                // Clip playback: pauses or loops at clip end
                const end = clipEndMs();
                if (end != null && !paused()) {
                  if (clipEnded(e.currentTime, end)) {
                    if (loopSingle()) {
                      const cur = currentSentence();
                      if (cur && videoNode) {
                        videoNode.seek(msToSeconds(cur.startMs));
                      }
                    } else {
                      paused.set(true);
                      clipEndMs.set(null);
                    }
                  }
                } else if (!paused()) {
                  const sList = sentences();
                  if (sList.length > 0) {
                    const idx = findSentenceIndexAtTime(sList, e.currentTime);
                    if (idx !== activeIndex()) {
                      activeIndex.set(idx);
                    }
                  }
                }
              }}
              onError={(e: { message?: string; code?: string }) => {
                paused.set(true);
                const code = e?.code ? ` [${e.code}]` : "";
                errorMsg.set(
                  `${e?.message ?? "播放器加载失败"}${code} · ${src()}`,
                );
              }}
              onEnd={() => {
                paused.set(true);
                clipEndMs.set(null);
              }}
            />

            {/* Poster fallback when paused or audio-only */}
            <If when={audioOnly() && paused()}>
              <Image
                src={poster()}
                class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
              />
            </If>

            {/* In-video floating focal subtitle overlay */}
            <If when={currentSentence()}>
              {(getSentence) => {
                const s = getSentence();
                const masked = isSentenceMasked(
                  maskAll(),
                  Boolean(revealedMap()[s.index]),
                );
                return (
                  <View class="absolute inset-x-4 bottom-4 items-center">
                    <Button
                      onPress={() => toggleSentenceReveal(s.index)}
                      class="max-w-[90%] rounded-lg border border-white/20 bg-black/80 px-4 py-2 backdrop-blur-md active:bg-black/90"
                    >
                      <Text class="text-center text-sm font-medium leading-relaxed text-white md:text-base">
                        {masked ? maskCaption(s.text) : s.text}
                      </Text>
                      <If when={masked}>
                        <Text class="mt-0.5 text-center font-mono text-[10px] text-amber">
                          [字幕已打码 · 点击切换显示]
                        </Text>
                      </If>
                    </Button>
                  </View>
                );
              }}
            </If>

            {/* Big center play button overlay when paused */}
            <If when={paused()}>
              <Button
                onPress={() => {
                  errorMsg.set(null);
                  clipEndMs.set(null);
                  paused.set(false);
                }}
                class="absolute inset-0 items-center justify-center bg-black/20"
                accessibilityLabel="Play"
              >
                <View class="h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-black/70 shadow-lg active:scale-95">
                  <Icon name="play" size={24} color="#fafafa" />
                </View>
              </Button>
            </If>
          </View>

          {/* 4. Sentence Controls Toolbar (Feature 4: 快捷跳转上一句、下一句，重复听) */}
          <SentenceControlsBar
            activeIndex={activeIndex}
            totalSentences={() => sentences().length}
            currentTimeSec={currentTimeSec}
            durationSec={durationSec}
            rate={rate}
            loopSingle={loopSingle}
            onPrev={handlePrevSentence}
            onRepeat={handleRepeatCurrent}
            onNext={handleNextSentence}
            onToggleLoop={() => loopSingle.set(!loopSingle())}
            onCycleRate={handleCycleRate}
          />

          {/* Error notice if player fails */}
          <If when={errorMsg()}>
            <View class="rounded-lg border border-danger/40 bg-danger-soft p-3">
              <Text class="text-xs text-danger">{errorMsg()}</Text>
            </View>
          </If>

          {/* 5. Subtitle Sentences List (Feature 2 & 3: 列出每一句话 + 打码 + "去听") */}
          <View class="gap-2">
            <View class="flex-row items-center justify-between border-b border-line pb-2">
              <View class="flex-row items-center gap-2">
                <Icon name="subtitles" size={14} tone="foreground" />
                <Text class="text-sm font-bold text-foreground">
                  视频字幕句单 (逐句精听)
                </Text>
              </View>
              <Text class="font-mono text-xs text-muted-foreground">
                快捷键: ←/→ 切句 · 空格/R 重复听 · M 打码切换
              </Text>
            </View>

            {/* Loading state */}
            <If when={loadingSentences()}>
              <View class="items-center justify-center gap-2 py-8">
                <Icon name="loader" size={20} class="animate-spin" />
                <Text class="font-mono text-xs text-muted-foreground">
                  正在加载字幕句子与时间对齐…
                </Text>
              </View>
            </If>

            {/* Empty state */}
            <If when={!loadingSentences() && sentences().length === 0}>
              <View class="items-center justify-center gap-2 rounded-xl border border-line bg-well/30 p-8 text-center">
                <Icon name="subtitles" size={24} tone="muted-foreground" />
                <Text class="text-sm font-medium text-foreground">
                  未检测到当前视频的内嵌字幕
                </Text>
                <Text class="text-xs text-muted-foreground">
                  可通过上方播放器直接播放，或重新解析下载包含字幕的版本
                </Text>
              </View>
            </If>

            {/* Sentences rows */}
            <If when={sentences().length > 0}>
              <View class="gap-1.5">
                <Each of={sentences()} key="index">
                  {(item) => {
                    const s = item();
                    return (
                      <SentenceRow
                        sentence={() => s}
                        isActive={() => activeIndex() === s.index}
                        isPlaying={() => !paused()}
                        isMaskAll={maskAll}
                        isRevealed={() => Boolean(revealedMap()[s.index])}
                        onToggleReveal={toggleSentenceReveal}
                        onListen={playSentence}
                      />
                    );
                  }}
                </Each>
              </View>
            </If>
          </View>
        </View>
      </Scroll>
    </View>
  );
}
