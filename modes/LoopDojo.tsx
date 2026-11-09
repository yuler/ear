import { signal, Text, View, Video } from "nsh";
import { Button, Input } from "nsh/base";
import type { LoadedLesson, Sentence } from "../youtube/types";
import {
  clipEnded,
  msToSeconds,
  type PlaybackRate,
} from "../player/AudioEngine";
import {
  diffSummary,
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

function DiffRow(props: { tokens: DiffToken[] }) {
  return (
    <View class="flex-row flex-wrap gap-1">
      <Each of={props.tokens} key="index">
        {(item) => {
          const t = item();
          const label =
            t.kind === "equal"
              ? t.expected!
              : t.kind === "mismatch"
                ? `${t.actual!}≠${t.expected!}`
                : t.kind === "missing"
                  ? `−${t.expected!}`
                  : `+${t.actual!}`;
          const color =
            t.kind === "equal"
              ? "text-green-600"
              : t.kind === "mismatch"
                ? "text-amber-600"
                : t.kind === "missing"
                  ? "text-red-600"
                  : "text-blue-600";
          return (
            <Text class={`text-sm ${color}`}>{label}</Text>
          );
        }}
      </Each>
    </View>
  );
}

type Props = { lesson: LoadedLesson };

/**
 * Loop Dojo: A–B loop the current sentence at 0.8/1/1.2, type what you hear, word Diff.
 */
export function LoopDojo(props: Props) {
  const sentences = props.lesson.sentences;
  const audioUrl = props.lesson.video.audioUrl;
  const index = signal(0);
  const rate = signal<PlaybackRate>(1);
  const looping = signal(false);
  const typed = signal("");
  const diff = signal<DiffToken[] | null>(null);
  const showAnswer = signal(false);
  let video: { seek(seconds: number): void } | null = null;

  const sentence = (): Sentence | null => {
    if (sentences.length === 0) return null;
    return sentences[Math.min(index(), sentences.length - 1)] ?? null;
  };

  const seekToA = (s: Sentence) => {
    if (!video) return;
    video.seek(msToSeconds(s.startMs));
  };

  const startLoop = () => {
    const s = sentence();
    if (!s || !audioUrl || !video) return;
    seekToA(s);
    looping.set(true);
  };

  const stopLoop = () => looping.set(false);

  const onCheck = () => {
    const s = sentence();
    if (!s) return;
    diff.set(wordDiff(s.text, typed()));
    showAnswer.set(true);
  };

  const go = (delta: number) => {
    stopLoop();
    diff.set(null);
    showAnswer.set(false);
    typed.set("");
    const next = Math.max(0, Math.min(sentences.length - 1, index() + delta));
    index.set(next);
  };

  return (
    <View class="gap-3 rounded-xl border border-border bg-card p-4">
      <View class="gap-1">
        <Text class="text-lg font-semibold text-foreground">Loop Dojo</Text>
        <Text class="text-xs text-muted-foreground">
          A–B loop · rate 0.8 / 1 / 1.2 · type + word Diff
        </Text>
      </View>

      <If when={audioUrl}>
        <Video
          ref={(node) => {
            video = node;
          }}
          src={audioUrl!}
          paused={!looping()}
          rate={rate()}
          volume={1}
          audioSession="playback"
          controls={false}
          progressUpdateInterval={80}
          style={{ width: 1, height: 1, opacity: 0 }}
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

      <If when={!audioUrl}>
        <Text class="text-xs text-destructive">
          No audio URL — Diff still works; loop play disabled.
        </Text>
      </If>

      <If when={sentence()}>
        {(get) => {
          const s = get();
          return (
            <View class="gap-3">
              <Text class="text-xs text-muted-foreground">
                #{s.index + 1}/{sentences.length} · A {formatMs(s.startMs)} → B{" "}
                {formatMs(s.endMs)} · {s.wpm} wpm · {s.difficulty}
              </Text>

              <View class="flex-row gap-2">
                <Button
                  onPress={() => go(-1)}
                  class="items-center rounded-lg border border-border px-3 py-2 active:bg-muted"
                >
                  <Text class="text-foreground">Prev</Text>
                </Button>
                <Button
                  onPress={() => (looping() ? stopLoop() : startLoop())}
                  class="flex-1 items-center rounded-lg bg-primary px-3 py-2 active:bg-primary/90"
                >
                  <Text class="text-primary-foreground">
                    {looping() ? "Stop" : "Loop A–B"}
                  </Text>
                </Button>
                <Button
                  onPress={() => rate.set(nextRate(rate()))}
                  class="items-center rounded-lg border border-border px-3 py-2 active:bg-muted"
                >
                  <Text class="text-foreground">{rate()}×</Text>
                </Button>
                <Button
                  onPress={() => go(1)}
                  class="items-center rounded-lg border border-border px-3 py-2 active:bg-muted"
                >
                  <Text class="text-foreground">Next</Text>
                </Button>
              </View>

              <Input
                value={typed()}
                onChange={(e) => typed.set(e.value)}
                placeholder="Type what you hear…"
                class="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />

              <View class="flex-row gap-2">
                <Button
                  onPress={onCheck}
                  class="flex-1 items-center rounded-lg bg-primary px-3 py-3 active:bg-primary/90"
                >
                  <Text class="text-primary-foreground">Check Diff</Text>
                </Button>
                <Button
                  onPress={() => showAnswer.set(!showAnswer())}
                  class="flex-1 items-center rounded-lg border border-border px-3 py-3 active:bg-muted"
                >
                  <Text class="text-foreground">
                    {showAnswer() ? "Hide answer" : "Show answer"}
                  </Text>
                </Button>
              </View>

              <If when={showAnswer()}>
                <View class="gap-1 rounded-lg border border-border bg-background p-3">
                  <Text class="text-xs text-muted-foreground">Answer</Text>
                  <Text class="text-base text-foreground">{s.text}</Text>
                </View>
              </If>

              <If when={diff()}>
                {(getDiff) => {
                  const tokens = getDiff()!;
                  const sum = diffSummary(tokens);
                  return (
                    <View class="gap-2 rounded-lg border border-border bg-background p-3">
                      <Text class="text-xs text-muted-foreground">
                        Diff · ={sum.equal} ≠{sum.mismatch} −{sum.missing} +
                        {sum.extra}
                      </Text>
                      <DiffRow tokens={tokens} />
                    </View>
                  );
                }}
              </If>
            </View>
          );
        }}
      </If>

      <If when={sentences.length === 0}>
        <Text class="text-sm text-muted-foreground">No sentences to loop.</Text>
      </If>
    </View>
  );
}
