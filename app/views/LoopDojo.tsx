import { Image, keymap, Scroll, signal, Text, Video, View } from "nsh";
import { Button, Input } from "nsh/base";
import {
  clipEnded,
  msToSeconds,
  resolvePlaybackSource,
  type PlaybackRate,
} from "../player";
import { Icon } from "../ui/Icon";
import { settings, subtitleClass } from "../ui/settings";
import { setBlockerEnabled } from "../store";
import { SubtitleBlocker } from "../ui/SubtitleBlocker";
import { videoPosterUrl } from "../youtube/parse";
import type { LoadedLesson, Sentence } from "../youtube/types";
import type { BlindTag } from "./blindFlowLogic";
import {
  diffSummary,
  dojoQueue,
  LOOP_RATES,
  wordDiff,
  type DiffToken,
} from "./loopDojoLogic";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function DiffRow(props: { tokens: () => DiffToken[] }) {
  return (
    <View selectable class="flex-row flex-wrap gap-1.5 select-text">
      <Each of={props.tokens()} key="index">
        {(item) => (
          <View
            class={`rounded px-2 py-0.5 ${
              item().kind === "equal"
                ? "bg-ready-soft"
                : item().kind === "mismatch" || item().kind === "missing"
                  ? "bg-danger-soft"
                  : "bg-well"
            }`}
          >
            <Text
              class={`font-mono text-xs ${
                item().kind === "equal"
                  ? "text-ready"
                  : item().kind === "mismatch" || item().kind === "missing"
                    ? "text-danger"
                    : "text-muted-foreground"
              }`}
            >
              {item().kind === "equal"
                ? item().expected!
                : item().kind === "mismatch"
                  ? `${item().actual!}≠${item().expected!}`
                  : item().kind === "missing"
                    ? `−${item().expected!}`
                    : `+${item().actual!}`}
            </Text>
          </View>
        )}
      </Each>
    </View>
  );
}

type Props = {
  /** Accessor so download completion (file:// swap) updates the player. */
  lesson: () => LoadedLesson;
  /** From Blind Flow — Dojo only drills Lag + Blind. */
  tags: Record<number, BlindTag>;
  onBackToBlind?: () => void;
  onDownload?: () => void;
  saving?: () => boolean;
};

/**
 * Loop Dojo: minimal single-column A–B loop & dictation workbench.
 * Queue panel is collapsed by default.
 */
export function LoopDojo(props: Props) {
  const lesson = () => props.lesson();
  const sentences = () => dojoQueue(lesson().sentences, props.tags);
  const playback = () => resolvePlaybackSource(lesson().video);
  const mediaUrl = () => playback().url;
  const hasVideoStream = () => playback().hasPicture;
  const posterUrl = () =>
    videoPosterUrl(lesson().video.videoId, lesson().video.thumbnailUrl);
  const index = signal(0);
  const rate = signal<PlaybackRate>(settings().preferredRate);
  const looping = signal(false);
  const typed = signal("");
  const diff = signal<DiffToken[] | null>(null);
  const showAnswer = signal(false);
  const showQueue = signal(false);
  const checkedSet = signal<Record<number, boolean>>({});
  const blockerEnabled = signal(settings().subtitleBlockerEnabled ?? false);
  const handleToggleBlocker = () => {
    const next = !blockerEnabled();
    blockerEnabled.set(next);
    setBlockerEnabled(next);
  };
  let video: { seek(seconds: number): void } | null = null;

  const sentence = (): Sentence | null => {
    const q = sentences();
    if (q.length === 0) return null;
    return q[Math.min(index(), q.length - 1)] ?? null;
  };

  const seekToA = (s: Sentence) => {
    if (!video) return;
    video.seek(msToSeconds(s.startMs));
  };

  const startLoop = () => {
    const s = sentence();
    if (!s || !mediaUrl() || !video) return;
    seekToA(s);
    looping.set(true);
  };

  const stopLoop = () => looping.set(false);

  const onCheck = () => {
    const s = sentence();
    if (!s) return;
    diff.set(wordDiff(s.text, typed()));
    showAnswer.set(true);
    checkedSet.set({ ...checkedSet(), [s.index]: true });
  };

  const selectQueueIndex = (nextIdx: number, autoStart = true) => {
    const q = sentences();
    stopLoop();
    diff.set(null);
    showAnswer.set(false);
    typed.set("");
    const clamped = Math.max(0, Math.min(q.length - 1, nextIdx));
    index.set(clamped);
    if (autoStart) {
      const s = q[clamped];
      if (s && mediaUrl() && video) {
        seekToA(s);
        looping.set(true);
      }
    }
  };

  const go = (delta: number) => {
    selectQueueIndex(index() + delta, true);
  };

  keymap.bind(
    {
      b: handleToggleBlocker,
    },
    { when: "notEditing" },
  );

  return (
    <View class="mx-auto w-full max-w-[720px] gap-5 py-2">
      <If when={sentence()}>
        {(get) => (
          <View class="gap-5">
            {/* Clean video frame with video poster */}
            <View class="relative flex aspect-video max-h-[340px] w-full items-center justify-center overflow-hidden rounded-md bg-black">
              <If when={mediaUrl()}>
                <Video
                  ref={(node) => {
                    video = node;
                  }}
                  src={mediaUrl()!}
                  paused={!looping()}
                  rate={rate()}
                  volume={1}
                  audioSession="playback"
                  controls={false}
                  progressUpdateInterval={80}
                  class="h-full w-full object-contain"
                  onProgress={(e) => {
                    const s = sentence();
                    if (!s || !looping()) return;
                    if (clipEnded(e.currentTime, s.endMs)) {
                      seekToA(s);
                    }
                  }}
                  onEnd={() => {
                    const s = sentence();
                    if (s && looping()) seekToA(s);
                    else stopLoop();
                  }}
                  onError={() => stopLoop()}
                />
              </If>

              {/* Video poster overlay when paused, audio-only, or dictation-only */}
              <If when={!looping() || !hasVideoStream()}>
                <Image
                  src={posterUrl()}
                  class="absolute inset-0 h-full w-full object-cover"
                />
                <View class="absolute inset-0 bg-black/25" />
              </If>

              <If when={!mediaUrl()}>
                <View class="absolute bottom-2.5 left-2.5 rounded bg-black/75 px-2 py-0.5">
                  <Text class="font-mono text-[11px] text-white">
                    Dictation only
                  </Text>
                </View>
              </If>

              <Button
                onPress={() => (looping() ? stopLoop() : startLoop())}
                class="absolute inset-0 items-center justify-center bg-transparent"
                accessibilityLabel={looping() ? "Stop Loop" : "Start Loop"}
              >
                <If when={!looping() && mediaUrl()}>
                  <View class="h-12 w-12 items-center justify-center rounded-full bg-black/65">
                    <Icon name="play" size={18} color="#fafafa" />
                  </View>
                </If>
              </Button>

              {/* Subtitle Blocker Overlay */}
              <If when={hasVideoStream()}>
                <SubtitleBlocker
                  videoId={() => lesson().video.videoId}
                  enabled={blockerEnabled}
                  onToggleEnabled={handleToggleBlocker}
                />
              </If>
            </View>

            {/* Thin A–B loop line */}
            <View class="gap-2">
              <View class="flex-row items-center justify-between">
                <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                  {index() + 1} / {sentences().length}
                </Text>
                <Text class="font-mono text-xs tabular-nums text-dim">
                  A {formatMs(get().startMs)} – B {formatMs(get().endMs)}
                </Text>
              </View>
              <View class="h-1 w-full overflow-hidden rounded-full bg-line">
                <View
                  class={`h-full w-full ${
                    looping() ? "bg-foreground" : "bg-muted-foreground"
                  }`}
                />
              </View>
            </View>

            {/* Single-row transport + text rate segments + queue toggle */}
            <View class="flex-row flex-wrap items-center justify-between gap-2">
              <View class="flex-row items-center gap-2">
                <Button
                  onPress={() => go(-1)}
                  class="rounded-md border border-line px-3 py-2 active:bg-accent"
                  accessibilityLabel="Previous"
                >
                  <Icon name="chevron-left" size={14} tone="foreground" />
                </Button>
                <Button
                  onPress={() => (looping() ? stopLoop() : startLoop())}
                  class="flex-row items-center gap-2 rounded-md bg-primary px-4 py-2 active:opacity-90"
                >
                  <Icon
                    name={looping() ? "pause" : "repeat"}
                    size={14}
                    tone="primary-foreground"
                  />
                  <Text class="text-sm font-medium text-primary-foreground">
                    {looping() ? "Stop" : "Loop A–B"}
                  </Text>
                </Button>
                <Button
                  onPress={() => go(1)}
                  class="rounded-md border border-line px-3 py-2 active:bg-accent"
                  accessibilityLabel="Next"
                >
                  <Icon name="chevron-right" size={14} tone="foreground" />
                </Button>
              </View>

              <View class="flex-row items-center gap-3">
                {/* Pure text speed segments */}
                <View class="flex-row items-center gap-2">
                  <Each of={LOOP_RATES}>
                    {(r) => (
                      <Button onPress={() => rate.set(r())} class="px-1 py-1">
                        <Text
                          class={`font-mono text-xs tabular-nums ${
                            rate() === r()
                              ? "font-semibold text-foreground underline"
                              : "text-muted-foreground"
                          }`}
                        >
                          {r() === 2 ? "2.0" : r()}×
                        </Text>
                      </Button>
                    )}
                  </Each>
                </View>

                <If when={props.onDownload}>
                  <Button
                    onPress={() => props.onDownload?.()}
                    class="rounded-md border border-line px-2.5 py-1.5 active:bg-accent"
                  >
                    <Text class="text-xs text-muted-foreground">
                      {props.saving?.() ? "Saving…" : "Download"}
                    </Text>
                  </Button>
                </If>

                <If when={hasVideoStream()}>
                  <Button
                    onPress={handleToggleBlocker}
                    class={`flex-row items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition active:scale-95 ${
                      blockerEnabled()
                        ? "border-amber-400/60 bg-amber-400/20 text-amber-400"
                        : "border-line text-muted-foreground hover:bg-accent"
                    }`}
                    accessibilityLabel="Toggle subtitle blocker"
                  >
                    <Icon
                      name="subtitle-block"
                      size={12}
                      color={blockerEnabled() ? "#f59e0b" : "#94a3b8"}
                    />
                    <Text
                      class={`text-xs ${
                        blockerEnabled()
                          ? "font-semibold text-amber-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {blockerEnabled() ? "Blocker: On" : "Blocker"}
                    </Text>
                  </Button>
                </If>

                <Button
                  onPress={() => showQueue.set(!showQueue())}
                  class={`rounded-md border px-2.5 py-1.5 active:bg-accent ${
                    showQueue() ? "border-foreground" : "border-line"
                  }`}
                >
                  <Text class="text-xs text-muted-foreground">
                    Queue ({sentences().length})
                  </Text>
                </Button>
              </View>
            </View>

            {/* Dictation input + actions */}
            <View class="gap-2.5">
              <Input
                value={typed()}
                onChange={(e) => {
                  typed.set(e.value);
                  diff.set(null);
                }}
                placeholder="Type what you hear…"
                returnKeyType="done"
                submitBehavior="submit"
                onSubmit={() => onCheck()}
                class="rounded-md border border-line bg-well px-3.5 py-2.5 text-base text-foreground placeholder:text-dim"
              />

              <View class="flex-row items-center gap-2">
                <Button
                  onPress={onCheck}
                  class="rounded-md bg-primary px-4 py-2 active:opacity-90"
                >
                  <Text class="text-sm font-medium text-primary-foreground">
                    Check Diff
                  </Text>
                </Button>
                <Button
                  onPress={() => showAnswer.set(!showAnswer())}
                  class="rounded-md border border-line px-3.5 py-2 active:bg-accent"
                >
                  <Text class="text-sm text-foreground">
                    {showAnswer() ? "Hide answer" : "Show answer"}
                  </Text>
                </Button>
              </View>
            </View>

            {/* Answer */}
            <If when={showAnswer()}>
              <View selectable class="border-t border-line pt-3 select-text">
                <Text
                  class={`select-text font-medium text-foreground ${subtitleClass(
                    settings().subtitleSize,
                  )}`}
                >
                  {get().text}
                </Text>
              </View>
            </If>

            {/* Word diff */}
            <If when={diff()}>
              {(getDiff) => (
                <View class="gap-2 border-t border-line pt-3">
                  <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                    {Math.round(
                      (diffSummary(getDiff()).equal /
                        Math.max(
                          1,
                          diffSummary(getDiff()).equal +
                            diffSummary(getDiff()).mismatch +
                            diffSummary(getDiff()).missing,
                        )) *
                        100,
                    )}
                    % · ={diffSummary(getDiff()).equal} ≠
                    {diffSummary(getDiff()).mismatch} −
                    {diffSummary(getDiff()).missing} +
                    {diffSummary(getDiff()).extra}
                  </Text>
                  <DiffRow tokens={() => getDiff()} />
                </View>
              )}
            </If>
          </View>
        )}
      </If>

      <If when={sentences().length === 0}>
        <View class="gap-3 py-6">
          <Text class="text-base font-medium text-foreground">
            No Lag or Blind sentences queued
          </Text>
          <Text class="text-sm text-muted-foreground">
            Tag sentences as Lag or Blind in Blind Flow to practice them here.
          </Text>
          <If when={props.onBackToBlind}>
            <Button
              onPress={() => props.onBackToBlind?.()}
              class="self-start rounded-md bg-primary px-4 py-2 active:opacity-90"
            >
              <Text class="text-sm font-medium text-primary-foreground">
                Go to Blind Flow
              </Text>
            </Button>
          </If>
        </View>
      </If>

      {/* Collapsible queue panel (collapsed by default) */}
      <If when={showQueue() && sentences().length > 0}>
        <View class="border-t border-line pt-4">
          <Scroll class="max-h-[280px]">
            <Each of={sentences()} key="index">
              {(item, qIdx) => (
                <Button
                  onPress={() => selectQueueIndex(qIdx(), true)}
                  class={`w-full flex-row items-center justify-between gap-4 border-b border-line py-2.5 ${
                    qIdx() === index()
                      ? "border-l-2 border-l-foreground pl-2.5"
                      : ""
                  }`}
                >
                  <View class="flex-row items-center gap-3">
                    <Text class="font-mono text-xs tabular-nums text-dim">
                      #{item().index + 1}
                    </Text>
                    <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatMs(item().startMs)}–{formatMs(item().endMs)}
                    </Text>
                    <Text class="font-mono text-xs text-dim">
                      {item().wordCount}w
                    </Text>
                  </View>
                  <View class="flex-row items-center gap-2">
                    <If when={checkedSet()[item().index]}>
                      <Text class="font-mono text-[11px] text-ready">Done</Text>
                    </If>
                    <Text
                      class={`font-mono text-[11px] uppercase ${
                        props.tags[item().index] === "blind"
                          ? "text-danger"
                          : "text-muted-foreground"
                      }`}
                    >
                      {props.tags[item().index] ?? "lag"}
                    </Text>
                  </View>
                </Button>
              )}
            </Each>
          </Scroll>
        </View>
      </If>
    </View>
  );
}
