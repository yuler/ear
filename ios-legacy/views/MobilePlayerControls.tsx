import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Haptics } from "nsh/mobile";
import type { Locale } from "../i18n";
import {
  formatSentenceTime,
  type PlaybackRate,
  type Sentence,
  type SentenceLengthMode,
} from "../player/captions";
import { playerCopyFor } from "../player/playerI18n";

const LENGTH_ORDER: readonly SentenceLengthMode[] = ["short", "medium", "long"];

function nextLengthMode(cur: SentenceLengthMode): SentenceLengthMode {
  const i = LENGTH_ORDER.indexOf(cur);
  return LENGTH_ORDER[(i + 1) % LENGTH_ORDER.length]!;
}

/** Touch-friendly mobile player controls aligned with Desktop's VideoPlayerControls. */
export function MobilePlayerControls(props: {
  paused: () => boolean;
  onTogglePlay: () => void;
  currentTimeSec: () => number;
  durationSec: () => number;
  onSeek: (seconds: number) => void;
  sentences: () => Sentence[];
  onPrevSentence: () => void;
  onRepeatSentence: () => void;
  onNextSentence: () => void;
  rate: () => PlaybackRate;
  onCycleRate: () => void;
  sentencePause: () => boolean;
  onToggleSentencePause: () => void;
  maskAll: () => boolean;
  onToggleMask: () => void;
  blockerEnabled?: () => boolean;
  onToggleBlocker?: () => void;
  sentenceLength: () => SentenceLengthMode;
  onChangeSentenceLength: (mode: SentenceLengthMode) => void;
  onOpenRawSubtitles: () => void;
  locale: () => Locale;
}) {
  const pc = () => playerCopyFor(props.locale());
  let trackWidth = 0;

  const dur = () => Math.max(0.1, props.durationSec());
  const percent = () =>
    Math.min(100, Math.max(0, (Math.max(0, props.currentTimeSec()) / dur()) * 100));

  const lengthLabel = () => {
    const m = props.sentenceLength();
    if (m === "short") return pc().shortSentences;
    if (m === "long") return pc().longSentences;
    return pc().mediumSentences;
  };

  const pillClass = (active: boolean) =>
    `min-h-[32px] items-center justify-center rounded-full border px-3 py-1 active:opacity-75 ${
      active ? "border-tint bg-tint-soft" : "border-line/70 bg-well"
    }`;

  const pillTextClass = (active: boolean) =>
    `text-xs font-semibold ${active ? "text-tint" : "text-muted-foreground"}`;

  return (
    <View class="flex-col gap-2.5 border-b border-line/60 bg-card px-4 py-3">
      {/* Seekable progress bar with sentence ticks */}
      <View class="flex-col gap-1">
        <View
          onLayout={(e) => {
            trackWidth = e.bounds.size.width;
          }}
          onPress={(e: { position?: { x: number } }) => {
            const x = e?.position?.x;
            if (typeof x === "number" && trackWidth > 0) {
              Haptics.selection();
              props.onSeek(Math.max(0, Math.min(1, x / trackWidth)) * dur());
            }
          }}
          class="relative h-6 w-full justify-center"
        >
          <View class="relative h-1.5 w-full overflow-hidden rounded-full bg-well">
            <View style={{ width: `${percent()}%` }} class="h-full bg-tint" />
            {props.sentences().map((s) => (
              <View
                style={{ left: `${Math.min(99.5, (s.startMs / 1000 / dur()) * 100)}%` }}
                class="pointer-events-none absolute inset-y-0 w-px bg-card/70"
              />
            ))}
          </View>
          <View
            style={{ left: `${percent()}%` }}
            class="pointer-events-none absolute -ml-2 h-4 w-4 rounded-full border-2 border-card bg-tint shadow-sm"
          />
        </View>

        <View class="flex-row items-center justify-between">
          <Text class="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatSentenceTime(Math.max(0, props.currentTimeSec()) * 1000)}
          </Text>
          <Text class="font-mono text-[11px] tabular-nums text-dim">
            {formatSentenceTime(dur() * 1000)}
          </Text>
        </View>
      </View>

      {/* Primary transport row: Prev / Play-Pause / Next / Repeat / Speed */}
      <View class="flex-row items-center justify-between gap-2">
        <Button
          onPress={() => {
            Haptics.selection();
            props.onCycleRate();
          }}
          accessibilityLabel={pc().playbackSpeed}
          class={`min-h-[36px] min-w-[52px] items-center justify-center rounded-xl border px-2.5 active:opacity-75 ${
            props.rate() !== 1 ? "border-tint bg-tint-soft" : "border-line/70 bg-well"
          }`}
        >
          <Text
            class={`font-mono text-xs font-semibold ${
              props.rate() !== 1 ? "text-tint" : "text-foreground"
            }`}
          >
            {props.rate()}x
          </Text>
        </Button>

        <View class="flex-row items-center gap-3">
          <Button
            onPress={() => {
              Haptics.selection();
              props.onPrevSentence();
            }}
            accessibilityLabel={pc().prevSentence}
            class="h-10 w-10 items-center justify-center rounded-full bg-well active:opacity-70"
          >
            <Text class="text-[15px] font-bold text-foreground">⏮</Text>
          </Button>

          <Button
            testID="player-play-toggle"
            onPress={() => {
              Haptics.impact("light");
              props.onTogglePlay();
            }}
            accessibilityLabel={props.paused() ? pc().play : pc().pause}
            class="h-12 w-12 items-center justify-center rounded-full bg-primary shadow-sm active:opacity-80"
          >
            <Text class="text-[18px] font-bold text-primary-foreground">
              {props.paused() ? "▶" : "❚❚"}
            </Text>
          </Button>

          <Button
            onPress={() => {
              Haptics.selection();
              props.onNextSentence();
            }}
            accessibilityLabel={pc().nextSentence}
            class="h-10 w-10 items-center justify-center rounded-full bg-well active:opacity-70"
          >
            <Text class="text-[15px] font-bold text-foreground">⏭</Text>
          </Button>
        </View>

        <Button
          onPress={() => {
            Haptics.selection();
            props.onRepeatSentence();
          }}
          accessibilityLabel={pc().repeatSentence}
          class="min-h-[36px] min-w-[52px] items-center justify-center rounded-xl border border-line/70 bg-well px-2.5 active:opacity-75"
        >
          <Text class="text-xs font-semibold text-foreground">{`↻ ${pc().repeatSentence}`}</Text>
        </Button>
      </View>

      {/* Study toggles row: Sentence Pause, Mask, Blocker, Length, Raw Subtitles */}
      <View class="flex-row flex-wrap items-center gap-1.5 pt-0.5">
        <Button
          onPress={() => {
            Haptics.selection();
            props.onToggleSentencePause();
          }}
          class={pillClass(props.sentencePause())}
        >
          <Text class={pillTextClass(props.sentencePause())}>{pc().sentencePause}</Text>
        </Button>

        <Button
          onPress={() => {
            Haptics.selection();
            props.onToggleMask();
          }}
          class={pillClass(props.maskAll())}
        >
          <Text class={pillTextClass(props.maskAll())}>
            {props.maskAll() ? pc().masked : pc().captions}
          </Text>
        </Button>

        {props.onToggleBlocker ? (
          <Button
            onPress={() => {
              Haptics.selection();
              props.onToggleBlocker?.();
            }}
            class={pillClass(Boolean(props.blockerEnabled?.()))}
          >
            <Text class={pillTextClass(Boolean(props.blockerEnabled?.()))}>
              {pc().subtitleBlocker}
            </Text>
          </Button>
        ) : null}

        <Button
          onPress={() => {
            Haptics.selection();
            props.onChangeSentenceLength(nextLengthMode(props.sentenceLength()));
          }}
          class={pillClass(false)}
        >
          <Text class="text-xs font-semibold text-foreground">{lengthLabel()}</Text>
        </Button>

        <Button
          onPress={() => {
            Haptics.selection();
            props.onOpenRawSubtitles();
          }}
          class={pillClass(false)}
        >
          <Text class="text-xs font-semibold text-muted-foreground">{pc().rawSubtitles}</Text>
        </Button>
      </View>
    </View>
  );
}
