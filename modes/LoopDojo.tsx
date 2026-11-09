import { Scroll, signal, Text, Video, View } from "nsh";
import { Button, Input } from "nsh/base";
import {
  clipEnded,
  msToSeconds,
  type PlaybackRate,
} from "../player/AudioEngine";
import { Icon } from "../ui/Icon";
import type { LoadedLesson, Sentence } from "../youtube/types";
import type { BlindTag } from "./blindFlow";
import {
  diffSummary,
  dojoQueue,
  LOOP_RATES,
  nextRate,
  wordDiff,
  type DiffToken,
} from "./loopDojo";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function DiffRow(props: { tokens: () => DiffToken[] }) {
  return (
    <View class="flex-row flex-wrap gap-1.5">
      <Each of={props.tokens()} key="index">
        {(item) => (
          <View
            class={`rounded-md border px-2 py-1 ${
              item().kind === "equal"
                ? "border-ready/30 bg-ready-soft text-ready"
                : item().kind === "mismatch"
                  ? "border-amber/30 bg-amber-soft text-amber"
                  : item().kind === "missing"
                    ? "border-danger/30 bg-danger-soft text-danger"
                    : "border-line bg-raised text-amber-text"
            }`}
          >
            <Text class="font-mono text-xs font-medium">
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
  lesson: LoadedLesson;
  /** From Blind Flow — Dojo only drills Lag + Blind. */
  tags: Record<number, BlindTag>;
  onBackToBlind?: () => void;
};

/**
 * Loop Dojo: Studio A–B loop workbench on Lag/Blind sentences at 0.8/1/1.2,
 * type what you hear, word Diff. Enter submits Diff.
 */
export function LoopDojo(props: Props) {
  const sentences = () => dojoQueue(props.lesson.sentences, props.tags);
  const mediaUrl = () =>
    props.lesson.video.videoUrl || props.lesson.video.audioUrl || null;
  const index = signal(0);
  const rate = signal<PlaybackRate>(1);
  const looping = signal(false);
  const typed = signal("");
  const diff = signal<DiffToken[] | null>(null);
  const showAnswer = signal(false);
  const checkedSet = signal<Record<number, boolean>>({});
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

  return (
    <View class="gap-3.5 md:flex-row md:items-start">
      {/* Left 2fr: Studio A–B Loop & Dictation Workbench */}
      <View class="min-w-0 flex-1 gap-3 rounded-2xl border border-line bg-panel p-4 md:flex-[2]">
        <View class="flex-row flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <View class="flex-row items-center gap-2.5">
            <View class="h-7 w-7 items-center justify-center rounded-lg bg-amber/15">
              <Icon name="repeat" size={14} tone="amber" />
            </View>
            <View class="gap-0.5">
              <View class="flex-row items-center gap-2">
                <Text class="text-base font-semibold text-foreground">
                  Loop Dojo
                </Text>
                <View class="rounded-full border border-line bg-raised px-2 py-0.5">
                  <Text class="font-mono text-[11px] tabular-nums text-amber">
                    {sentences().length} queued
                  </Text>
                </View>
              </View>
              <Text class="text-xs text-muted-foreground">
                A–B loop on Lag / Blind only · rate 0.8 / 1 / 1.2 · Enter
                submits Diff
              </Text>
            </View>
          </View>

          {/* Speed Preset Selector Pills */}
          <View class="flex-row items-center gap-1 rounded-full border border-line bg-well p-1">
            <Each of={LOOP_RATES}>
              {(r) => (
                <Button
                  onPress={() => rate.set(r())}
                  class={`rounded-full px-2.5 py-1 ${
                    rate() === r() ? "bg-amber" : "bg-transparent"
                  }`}
                >
                  <Text
                    class={`font-mono text-[11px] font-semibold tabular-nums ${
                      rate() === r() ? "text-ink" : "text-muted-foreground"
                    }`}
                  >
                    {r()}×
                  </Text>
                </Button>
              )}
            </Each>
          </View>
        </View>

        <If when={!mediaUrl()}>
          <View class="flex-row items-center justify-between rounded-xl border border-line bg-raised px-3 py-1.5">
            <View class="flex-row items-center gap-2">
              <Icon name="keyboard" size={13} tone="amber" />
              <Text class="text-xs text-muted-foreground">
                No audio URL - Diff still works; loop play disabled.
              </Text>
            </View>
            <Text class="font-mono text-[10px] uppercase tracking-wider text-dim">
              Dictation Ready
            </Text>
          </View>
        </If>

        <If when={sentence()}>
          {(get) => (
            <View class="gap-3">
              {/* Loop Video Screen */}
              <View class="relative flex aspect-video max-h-[300px] w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-black">
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
                <If when={!mediaUrl()}>
                  <View class="items-center justify-center gap-2 p-4">
                    <Icon name="repeat" size={28} tone="dim" />
                    <Text class="text-xs text-dim">
                      No video or audio media source
                    </Text>
                  </View>
                </If>

                {/* Loop status overlay */}
                <View class="absolute top-2.5 left-2.5 flex-row items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 backdrop-blur">
                  <View
                    class={`h-2 w-2 rounded-full ${
                      looping() ? "bg-amber" : "bg-dim"
                    }`}
                  />
                  <Text class="font-mono text-[10px] font-semibold text-white">
                    {looping()
                      ? `LOOPING A-B (${rate()}×)`
                      : "LOOP PAUSED"}
                  </Text>
                </View>

                <Button
                  onPress={() => (looping() ? stopLoop() : startLoop())}
                  class="absolute inset-0 items-center justify-center bg-transparent active:bg-black/10"
                  accessibilityLabel={looping() ? "Stop Loop" : "Start Loop"}
                >
                  <If when={!looping()}>
                    <View class="h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/60 shadow-lg backdrop-blur">
                      <Icon name="play" size={20} tone="primary-foreground" />
                    </View>
                  </If>
                </Button>
              </View>

              {/* Studio A–B Timeline Visualizer Card */}
              <View class="gap-2.5 rounded-xl border border-line bg-well p-3.5">
                <View class="flex-row flex-wrap items-center justify-between gap-2">
                  <View class="flex-row items-center gap-2">
                    <View class="rounded-md border border-line bg-raised px-2 py-0.5">
                      <Text class="font-mono text-xs font-semibold tabular-nums text-amber">
                        Drill #{index() + 1}/{sentences().length}
                      </Text>
                    </View>
                    <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                      #{get().index + 1}/{sentences().length} · A{" "}
                      {formatMs(get().startMs)} → B {formatMs(get().endMs)} ·{" "}
                      {get().wpm} wpm · {get().difficulty}
                    </Text>
                  </View>

                  <View class="flex-row items-center gap-1.5">
                    <If when={props.tags[get().index]}>
                      <View
                        class={`rounded-full px-2.5 py-0.5 ${
                          props.tags[get().index] === "blind"
                            ? "bg-danger-soft"
                            : "bg-amber-soft"
                        }`}
                      >
                        <Text
                          class={`font-mono text-[10px] font-semibold uppercase ${
                            props.tags[get().index] === "blind"
                              ? "text-danger"
                              : "text-amber"
                          }`}
                        >
                          From {props.tags[get().index]}
                        </Text>
                      </View>
                    </If>
                    <View class="rounded-full border border-line bg-raised px-2.5 py-0.5">
                      <Text class="font-mono text-[11px] tabular-nums text-faint">
                        Δ {((get().endMs - get().startMs) / 1000).toFixed(2)}s
                      </Text>
                    </View>
                  </View>
                </View>

                {/* A–B Loop Track Bar */}
                <View class="gap-1.5 rounded-lg border border-line/70 bg-panel p-2.5">
                  <View class="flex-row items-center justify-between">
                    <View class="flex-row items-center gap-1.5">
                      <View class="rounded bg-amber px-1.5 py-0.5">
                        <Text class="font-mono text-[10px] font-bold text-ink">
                          A
                        </Text>
                      </View>
                      <Text class="font-mono text-xs tabular-nums text-foreground">
                        {formatMs(get().startMs)}
                      </Text>
                    </View>

                    <View class="flex-row items-center gap-1.5">
                      <View
                        class={`h-2 w-2 rounded-full ${
                          looping() ? "bg-ready" : "bg-dim"
                        }`}
                      />
                      <Text class="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        {looping()
                          ? `LOOPING AT ${rate()}×`
                          : `READY · ${get().wordCount} WORDS`}
                      </Text>
                    </View>

                    <View class="flex-row items-center gap-1.5">
                      <Text class="font-mono text-xs tabular-nums text-foreground">
                        {formatMs(get().endMs)}
                      </Text>
                      <View class="rounded bg-amber px-1.5 py-0.5">
                        <Text class="font-mono text-[10px] font-bold text-ink">
                          B
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View class="h-2 overflow-hidden rounded-full bg-well">
                    <View
                      class={`h-full w-full rounded-full ${
                        looping() ? "bg-amber" : "bg-amber/45"
                      }`}
                    />
                  </View>
                </View>
              </View>

              {/* Transport Controls */}
              <View class="flex-row gap-2.5">
                <Button
                  onPress={() => go(-1)}
                  class="flex-row items-center gap-1.5 rounded-xl border border-line bg-raised px-4 py-3 active:bg-accent"
                >
                  <Icon name="chevron-left" size={15} tone="paper" />
                  <Text class="text-sm font-semibold text-foreground">Prev</Text>
                </Button>
                <Button
                  onPress={() => (looping() ? stopLoop() : startLoop())}
                  class="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 active:opacity-90"
                >
                  <Icon
                    name={looping() ? "pause" : "repeat"}
                    size={16}
                    tone="primary-foreground"
                  />
                  <Text class="text-base font-bold text-primary-foreground">
                    {looping() ? "Stop" : "Loop A–B"}
                  </Text>
                </Button>
                <Button
                  onPress={() => rate.set(nextRate(rate()))}
                  class="items-center justify-center rounded-xl border border-line bg-raised px-4 py-3 active:bg-accent"
                >
                  <Text class="font-mono text-sm font-bold tabular-nums text-foreground">
                    {rate()}×
                  </Text>
                </Button>
                <Button
                  onPress={() => go(1)}
                  class="flex-row items-center gap-1.5 rounded-xl border border-line bg-raised px-4 py-3 active:bg-accent"
                >
                  <Text class="text-sm font-semibold text-foreground">Next</Text>
                  <Icon name="chevron-right" size={15} tone="paper" />
                </Button>
              </View>

              {/* Dictation Input Field */}
              <View class="gap-1.5">
                <View class="flex-row items-center justify-between">
                  <Text class="text-xs font-medium text-muted-foreground">
                    Dictation · Type what you hear
                  </Text>
                  <Text class="font-mono text-[11px] text-faint">
                    Press Enter to Check Diff
                  </Text>
                </View>
                <Input
                  value={typed()}
                  onChange={(e) => {
                    typed.set(e.value);
                    diff.set(null);
                  }}
                  placeholder="Type what you hear..."
                  returnKeyType="done"
                  submitBehavior="submit"
                  onSubmit={() => onCheck()}
                  class="rounded-xl border border-line bg-well px-4 py-3 text-base text-foreground placeholder:text-dim focus:border-amber"
                />
              </View>

              {/* Action Buttons */}
              <View class="flex-row gap-2.5">
                <Button
                  onPress={onCheck}
                  class="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 active:opacity-90"
                >
                  <Icon name="check" size={16} tone="primary-foreground" />
                  <Text class="text-base font-bold text-primary-foreground">
                    Check Diff
                  </Text>
                </Button>
                <Button
                  onPress={() => showAnswer.set(!showAnswer())}
                  class="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-line bg-raised px-5 py-3.5 active:bg-accent"
                >
                  <Icon
                    name={showAnswer() ? "eye-off" : "eye"}
                    size={16}
                    tone="paper"
                  />
                  <Text class="text-base font-semibold text-foreground">
                    {showAnswer() ? "Hide answer" : "Show answer"}
                  </Text>
                </Button>
              </View>

              {/* Reference Answer Card */}
              <If when={showAnswer()}>
                <View class="gap-1 rounded-xl border border-line bg-well p-3.5">
                  <View class="flex-row items-center justify-between">
                    <Text class="font-mono text-[11px] uppercase tracking-wider text-amber">
                      Answer
                    </Text>
                    <Text class="font-mono text-[11px] text-faint">
                      {get().wordCount} words · {get().wpm} wpm
                    </Text>
                  </View>
                  <Text class="text-base font-medium leading-relaxed text-foreground">
                    {get().text}
                  </Text>
                </View>
              </If>

              {/* Word Diff Result Card */}
              <If when={diff()}>
                {(getDiff) => (
                  <View class="gap-2 rounded-xl border border-line bg-well p-3.5">
                    <View class="flex-row items-center justify-between">
                      <Text class="font-mono text-xs text-muted-foreground">
                        Diff · ={diffSummary(getDiff()).equal} ≠
                        {diffSummary(getDiff()).mismatch} −
                        {diffSummary(getDiff()).missing} +
                        {diffSummary(getDiff()).extra}
                      </Text>
                      <View class="rounded-full bg-ready-soft px-2.5 py-0.5">
                        <Text class="font-mono text-[11px] font-semibold text-ready">
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
                          % match
                        </Text>
                      </View>
                    </View>
                    <DiffRow tokens={() => getDiff()} />
                  </View>
                )}
              </If>
            </View>
          )}
        </If>

        <If when={sentences().length === 0}>
          <View class="gap-3 rounded-xl border border-line bg-well p-5">
            <View class="gap-1">
              <Text class="text-base font-semibold text-foreground">
                No Lag / Blind sentences yet
              </Text>
              <Text class="text-sm text-muted-foreground">
                Tag some as Lag or Blind in Blind Flow first. Pass is skipped
                here.
              </Text>
            </View>
            <If when={props.onBackToBlind}>
              <Button
                onPress={() => props.onBackToBlind?.()}
                class="flex-row items-center gap-2 self-start rounded-xl bg-amber px-4 py-2.5 active:opacity-90"
              >
                <Icon name="headphones" size={14} tone="ink" />
                <Text class="text-xs font-semibold text-ink">
                  Go to Blind Flow
                </Text>
              </Button>
            </If>
          </View>
        </If>
      </View>

      {/* Right 1fr: Dojo Queue Inspector */}
      <View class="w-full gap-2.5 rounded-2xl border border-line bg-panel p-3.5 md:w-[300px] md:shrink-0">
        <View class="flex-row items-center justify-between border-b border-line pb-2.5">
          <View class="flex-row items-center gap-2">
            <Icon name="layers" size={14} tone="amber" />
            <Text class="text-xs font-semibold uppercase tracking-wider text-foreground">
              Dojo Drill Queue
            </Text>
          </View>
          <Text class="font-mono text-[11px] tabular-nums text-muted-foreground">
            {sentences().length} items
          </Text>
        </View>

        <If when={sentences().length === 0}>
          <Text class="py-4 text-center text-xs text-muted-foreground">
            Queue is empty. Tag sentences as Lag or Blind in Blind Flow to
            populate your A–B drill queue.
          </Text>
        </If>

        <If when={sentences().length > 0}>
          <Scroll class="max-h-[380px]">
            <View class="gap-1.5">
              <Each of={sentences()} key="index">
                {(item, qIdx) => (
                  <Button
                    onPress={() => selectQueueIndex(qIdx(), true)}
                    class={`rounded-xl border px-3 py-2.5 transition ${
                      qIdx() === index()
                        ? "border-amber/60 bg-amber/10"
                        : "border-line/60 bg-raised hover:border-line"
                    }`}
                  >
                    <View class="w-full gap-1">
                      <View class="flex-row items-center justify-between">
                        <View class="flex-row items-center gap-1.5">
                          <Text class="font-mono text-[11px] font-semibold tabular-nums text-amber">
                            #{item().index + 1}
                          </Text>
                          <Text class="font-mono text-[11px] tabular-nums text-faint">
                            {formatMs(item().startMs)}–{formatMs(item().endMs)}
                          </Text>
                        </View>
                        <View class="flex-row items-center gap-1">
                          <If when={checkedSet()[item().index]}>
                            <View class="rounded bg-ready-soft px-1.5 py-0.5">
                              <Text class="font-mono text-[9px] font-semibold text-ready">
                                Drilled
                              </Text>
                            </View>
                          </If>
                          <View
                            class={`rounded px-1.5 py-0.5 ${
                              props.tags[item().index] === "blind"
                                ? "bg-danger-soft"
                                : "bg-amber-soft"
                            }`}
                          >
                            <Text
                              class={`font-mono text-[10px] font-semibold uppercase ${
                                props.tags[item().index] === "blind"
                                  ? "text-danger"
                                  : "text-amber"
                              }`}
                            >
                              {props.tags[item().index] ?? "lag"}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Text class="font-mono text-[11px] text-muted-foreground">
                        {item().wordCount} words · {item().wpm} wpm ·{" "}
                        {item().difficulty}
                      </Text>
                    </View>
                  </Button>
                )}
              </Each>
            </View>
          </Scroll>
        </If>
      </View>
    </View>
  );
}
