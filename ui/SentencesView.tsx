import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { BlindTag } from "../modes/blindFlow";
import type { Difficulty, LoadedLesson, Sentence } from "../youtube/types";
import { Icon } from "./Icon";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function difficultyBadgeClass(d: Difficulty): string {
  if (d === "i-1") return "bg-ready-soft text-ready border-ready/30";
  if (d === "i+1") return "bg-amber-soft text-amber border-amber/30";
  return "bg-danger-soft text-danger border-danger/30";
}

function SentenceRow(props: {
  sentence: () => Sentence;
  tag: () => BlindTag | undefined;
  onSelect: () => void;
}) {
  return (
    <Button
      onPress={props.onSelect}
      class="w-full rounded-xl border border-line bg-panel p-4 transition hover:border-amber/40 active:bg-accent"
    >
      <View class="w-full gap-2">
        <View class="flex-row flex-wrap items-center justify-between gap-2">
          <View class="flex-row items-center gap-2">
            <View class="rounded-lg border border-line bg-raised px-2.5 py-1">
              <Text class="font-mono text-xs font-bold tabular-nums text-amber">
                #{props.sentence().index + 1}
              </Text>
            </View>
            <Text class="font-mono text-xs tabular-nums text-muted-foreground">
              {formatMs(props.sentence().startMs)}–
              {formatMs(props.sentence().endMs)} · {props.sentence().wpm} wpm
            </Text>
          </View>

          <View class="flex-row items-center gap-1.5">
            <If when={props.tag()}>
              <View
                class={`rounded-lg px-2.5 py-1 ${
                  props.tag() === "pass"
                    ? "bg-ready-soft"
                    : props.tag() === "lag"
                      ? "bg-amber-soft"
                      : "bg-danger-soft"
                }`}
              >
                <Text
                  class={`font-mono text-xs font-bold uppercase ${
                    props.tag() === "pass"
                      ? "text-ready"
                      : props.tag() === "lag"
                        ? "text-amber"
                        : "text-danger"
                  }`}
                >
                  {props.tag()}
                </Text>
              </View>
            </If>
            <View
              class={`rounded-lg border px-2.5 py-1 ${difficultyBadgeClass(props.sentence().difficulty)}`}
            >
              <Text class="font-mono text-xs font-bold">
                {props.sentence().difficulty}
              </Text>
            </View>
          </View>
        </View>
        <Text class="text-base leading-relaxed text-foreground">
          {props.sentence().text}
        </Text>
      </View>
    </Button>
  );
}

export function SentencesView(props: {
  lesson: () => LoadedLesson;
  tags: () => Record<number, BlindTag>;
  difficultyFilter: () => "all" | Difficulty;
  onDifficultyFilterChange: (df: "all" | Difficulty) => void;
  onPracticeInBlind: (sentenceIndex?: number) => void;
}) {
  const filteredSentences = (): Sentence[] => {
    const df = props.difficultyFilter();
    const list = props.lesson().sentences;
    if (df === "all") return list;
    return list.filter((s) => s.difficulty === df);
  };

  return (
    <View class="gap-3.5">
      {/* Header & Difficulty Filter Pills */}
      <View class="flex-row flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4">
        <View class="flex-row items-center gap-2.5">
          <View class="h-9 w-9 items-center justify-center rounded-xl bg-amber/15">
            <Icon name="list" size={16} tone="amber" />
          </View>
          <View class="gap-0.5">
            <Text class="text-base font-bold text-foreground">
              Sentences ({filteredSentences().length} /{" "}
              {props.lesson().sentences.length})
            </Text>
            <Text class="text-xs text-muted-foreground">
              {props.lesson().video.title} · Click any sentence to practice in
              Blind Flow
            </Text>
          </View>
        </View>

        <View class="flex-row flex-wrap items-center gap-1.5">
          {(["all", "i-1", "i+1", "Hard"] as const).map((df) => (
            <Button
              onPress={() => props.onDifficultyFilterChange(df)}
              class={`rounded-xl px-4 py-2 ${
                props.difficultyFilter() === df
                  ? "bg-amber"
                  : "border border-line bg-raised"
              }`}
            >
              <Text
                class={`font-mono text-xs font-bold ${
                  props.difficultyFilter() === df
                    ? "text-ink"
                    : "text-muted-foreground"
                }`}
              >
                {df === "all" ? "All Levels" : df}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      {/* Sentence Cards */}
      <View class="gap-2.5">
        <Each of={filteredSentences()} key="index">
          {(item) => (
            <SentenceRow
              sentence={item}
              tag={() => props.tags()[item().index]}
              onSelect={() => props.onPracticeInBlind(item().index)}
            />
          )}
        </Each>
      </View>
    </View>
  );
}
