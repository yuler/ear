import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { PlaybackRate } from "../player";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import type { SentenceLengthMode } from "../youtube/captions";

export type SentenceControlsBarProps = {
  activeIndex: () => number;
  totalSentences: () => number;
  currentTimeSec?: () => number;
  durationSec?: () => number;
  rate?: () => PlaybackRate;
  sentencePause?: () => boolean;
  autoNext?: () => boolean;
  onPrev: () => void;
  onRepeat: () => void;
  onNext: () => void;
  onToggleSentencePause?: () => void;
  onToggleAutoNext?: () => void;
  onCycleRate?: () => void;
  sentenceLength: () => SentenceLengthMode;
  onChangeSentenceLength: (mode: SentenceLengthMode) => void;
  language?: () => EarLocale;
};

/**
 * Pinned single-line toolbar for sentence playback navigation:
 * Prev / Repeat / Next, sentence index counter,
 * [Short | Medium | Long] length segmented switch,
 * and Sentence Pause flow switch.
 */
export function SentenceControlsBar(props: SentenceControlsBarProps) {
  const activeIdx = () => props.activeIndex();
  const total = () => props.totalSentences();
  const pauseActive = () =>
    props.sentencePause
      ? props.sentencePause()
      : props.autoNext
      ? !props.autoNext()
      : false;
  const handleTogglePause = () => {
    if (props.onToggleSentencePause) {
      props.onToggleSentencePause();
    } else if (props.onToggleAutoNext) {
      props.onToggleAutoNext();
    }
  };
  const lang = () => props.language?.() ?? "en";
  const m = () => t(lang());
  const len = () => props.sentenceLength();

  return (
    <View class="flex-row flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border/70 bg-card/70 px-3 py-2 shadow-xs backdrop-blur-xs">
      {/* 1. Left: Previous, Repeat, Next sentence playback controls */}
      <View class="flex-row items-center gap-1.5 sm:gap-2">
        {/* Previous sentence */}
        <Button
          onPress={props.onPrev}
          disabled={activeIdx() <= 0}
          class={`flex-row items-center gap-1.5 rounded-lg border px-3 py-1.5 transition ${
            activeIdx() <= 0
              ? "border-border/40 bg-muted/30 opacity-40"
              : "border-border bg-background shadow-xs active:scale-95 hover:bg-muted"
          }`}
          accessibilityLabel={m().previousSentenceFull}
        >
          <Icon name="chevron-left" size={13} tone="foreground" />
          <Text class="text-xs font-semibold text-foreground">
            {m().previousSentenceFull}
          </Text>
          <Text class="hidden font-mono text-[10px] text-muted-foreground sm:inline">
            (←)
          </Text>
        </Button>

        {/* Repeat current sentence */}
        <Button
          onPress={props.onRepeat}
          class="flex-row items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 shadow-xs transition hover:opacity-90 active:scale-95"
          accessibilityLabel={m().repeatSentenceFull}
        >
          <Icon name="repeat" size={13} tone="primary-foreground" />
          <Text class="text-xs font-bold text-primary-foreground">
            {m().repeatSentenceFull}
          </Text>
          <Text class="hidden font-mono text-[10px] text-primary-foreground opacity-80 sm:inline">
            (R)
          </Text>
        </Button>

        {/* Next sentence */}
        <Button
          onPress={props.onNext}
          disabled={total() === 0 || activeIdx() >= total() - 1}
          class={`flex-row items-center gap-1.5 rounded-lg border px-3 py-1.5 transition ${
            total() === 0 || activeIdx() >= total() - 1
              ? "border-border/40 bg-muted/30 opacity-40"
              : "border-border bg-background shadow-xs active:scale-95 hover:bg-muted"
          }`}
          accessibilityLabel={m().nextSentenceFull}
        >
          <Text class="text-xs font-semibold text-foreground">
            {m().nextSentenceFull}
          </Text>
          <Icon name="chevron-right" size={13} tone="foreground" />
          <Text class="hidden font-mono text-[10px] text-muted-foreground sm:inline">
            (→)
          </Text>
        </Button>
      </View>

      {/* 2. Middle: Sentence Progress Counter */}
      <View class="flex-row items-center">
        <View class="rounded-md border border-border/80 bg-background/80 px-2.5 py-1 shadow-2xs">
          <Text class="font-mono text-xs font-semibold text-foreground">
            {m().sentenceCounter(activeIdx() + 1, total())}
          </Text>
        </View>
      </View>

      {/* 3. Right: Subtitle length selector + Flow switches (Auto-Next & Single Loop) */}
      <View class="flex-row items-center gap-2">
        {/* Sentence length mode switcher: Short | Medium | Long */}
        <View class="flex-row items-center rounded-lg border border-border bg-muted/60 p-0.5">
          <Button
            onPress={() => props.onChangeSentenceLength("short")}
            class={`rounded-md px-2 py-0.5 transition ${
              len() === "short"
                ? "bg-[#2f7cf6] text-white shadow-2xs"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
            accessibilityLabel={m().shortSentencesDesc}
          >
            <Text
              class={`text-xs font-medium ${
                len() === "short" ? "font-bold text-white" : "text-muted-foreground"
              }`}
            >
              {m().shortSentences}
            </Text>
          </Button>
          <Button
            onPress={() => props.onChangeSentenceLength("medium")}
            class={`rounded-md px-2 py-0.5 transition ${
              len() === "medium"
                ? "bg-[#2f7cf6] text-white shadow-2xs"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
            accessibilityLabel={m().mediumSentencesDesc}
          >
            <Text
              class={`text-xs font-medium ${
                len() === "medium" ? "font-bold text-white" : "text-muted-foreground"
              }`}
            >
              {m().mediumSentences}
            </Text>
          </Button>
          <Button
            onPress={() => props.onChangeSentenceLength("long")}
            class={`rounded-md px-2 py-0.5 transition ${
              len() === "long"
                ? "bg-[#2f7cf6] text-white shadow-2xs"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
            accessibilityLabel={m().longSentencesDesc}
          >
            <Text
              class={`text-xs font-medium ${
                len() === "long" ? "font-bold text-white" : "text-muted-foreground"
              }`}
            >
              {m().longSentences}
            </Text>
          </Button>
        </View>

        {/* Switch 1: Sentence Pause Toggle Button (Default OFF) */}
        <Button
          onPress={handleTogglePause}
          class={`flex-row items-center gap-1.5 rounded-lg border px-2.5 py-1 transition active:scale-95 ${
            pauseActive()
              ? "border-amber-500/70 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
          accessibilityLabel={m().sentencePauseToggle}
        >
          <Icon
            name="pause"
            size={11}
            tone={pauseActive() ? "foreground" : "muted-foreground"}
          />
          <Text
            class={`text-xs ${
              pauseActive()
                ? "font-bold text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {pauseActive() ? m().sentencePauseOn : m().sentencePauseOff}
          </Text>
        </Button>

        {/* Playback rate speed button */}
        <If when={Boolean(props.rate && props.onCycleRate)}>
          <Button
            onPress={props.onCycleRate}
            class="rounded-lg border border-border bg-background px-2 py-1 active:bg-accent"
            accessibilityLabel={m().playbackSpeed}
          >
            <Text class="font-mono text-xs font-semibold text-foreground">
              {props.rate?.()}x
            </Text>
          </Button>
        </If>
      </View>
    </View>
  );
}
