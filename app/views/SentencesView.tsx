import { Image, Text, View } from "nsh";
import { Button } from "nsh/base";
import { videoPosterUrl } from "../youtube/parse";
import type { Difficulty, LoadedLesson, Sentence } from "../youtube/types";
import type { BlindTag } from "./blindFlow";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function tagDotClass(tag: BlindTag): string {
  if (tag === "pass") return "bg-ready";
  if (tag === "blind") return "bg-danger";
  return "bg-muted-foreground";
}

function SentenceRow(props: {
  sentence: () => Sentence;
  tag: () => BlindTag | undefined;
  onSelect: () => void;
}) {
  return (
    <View
      class="w-full flex-row items-baseline justify-between gap-4 border-b border-line py-3.5 transition hover:bg-well/30"
    >
      <View selectable class="min-w-0 flex-1 flex-row items-baseline gap-3 select-text">
        <Text class="select-text shrink-0 font-mono text-xs tabular-nums text-dim">
          {props.sentence().index + 1}
        </Text>
        <Text class="select-text min-w-0 flex-1 text-base leading-relaxed text-foreground">
          {props.sentence().text}
        </Text>
      </View>

      <View class="shrink-0 flex-row items-center gap-2.5">
        <If when={props.tag()}>
          <View class="flex-row items-center gap-1.5">
            <View class={`h-1.5 w-1.5 rounded-full ${tagDotClass(props.tag()!)}`} />
            <Text class="font-mono text-[11px] uppercase text-muted-foreground">
              {props.tag()}
            </Text>
          </View>
        </If>
        <Text class="font-mono text-xs text-dim">
          {props.sentence().difficulty}
        </Text>
        <Text class="font-mono text-xs tabular-nums text-muted-foreground">
          {formatMs(props.sentence().startMs)}
        </Text>
        <Button
          onPress={props.onSelect}
          class="rounded bg-well px-2 py-1 text-xs text-foreground hover:bg-accent active:scale-95"
          accessibilityLabel="Practice sentence"
        >
          <Text class="text-xs text-foreground">练习</Text>
        </Button>
      </View>
    </View>
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
    <View class="mx-auto w-full max-w-[760px] gap-3">
      {/* Header with video poster & pure-text difficulty tabs */}
      <View class="flex-row flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <View class="min-w-0 flex-1 flex-row items-center gap-3">
          <View class="h-10 w-[72px] shrink-0 overflow-hidden rounded-md border border-line bg-black">
            <Image
              src={videoPosterUrl(
                props.lesson().video.videoId,
                props.lesson().video.thumbnailUrl,
              )}
              class="h-full w-full object-cover"
            />
          </View>
          <View class="min-w-0 flex-1 gap-0.5">
            <Text class="line-clamp-1 text-sm font-medium text-foreground">
              {props.lesson().video.title}
            </Text>
            <Text class="font-mono text-xs tabular-nums text-muted-foreground">
              YouTube · {props.lesson().video.videoId} ·{" "}
              {filteredSentences().length} / {props.lesson().sentences.length}{" "}
              sentences
            </Text>
          </View>
        </View>

        <View class="flex-row items-center gap-4">
          {(["all", "i-1", "i+1", "Hard"] as const).map((df) => (
            <Button
              onPress={() => props.onDifficultyFilterChange(df)}
              class="py-0.5"
            >
              <Text
                class={`font-mono text-xs ${
                  props.difficultyFilter() === df
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {df === "all" ? "All" : df}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      {/* Divider list */}
      <View>
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
