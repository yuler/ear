import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import type { Sentence } from "../youtube/types";
import {
  displaySentenceText,
  formatTimeRange,
  isSentenceMasked,
} from "./sentencePlayer";

export type SentenceRowProps = {
  sentence: () => Sentence;
  isActive: () => boolean;
  isPlaying: () => boolean;
  isMaskAll: () => boolean;
  isRevealed: () => boolean;
  onToggleReveal: (index: number) => void;
  onListen: (sentence: Sentence) => void;
  language?: () => EarLocale;
};

/**
 * Immersive subtitle row:
 * Inactive sentences are soft, secondary, and button-free (click to jump & play).
 * Active sentence is prominently focused as the cinema center stage with inline reveal and repeat actions.
 */
export function SentenceRow(props: SentenceRowProps) {
  const s = () => props.sentence();
  const active = () => props.isActive();
  const playing = () => props.isPlaying();
  const masked = () => isSentenceMasked(props.isMaskAll(), props.isRevealed());
  const displayText = () =>
    displaySentenceText(s().text, props.isMaskAll(), props.isRevealed());
  const lang = () => props.language?.() ?? "en";
  const m = () => t(lang());

  const handleRowPress = () => {
    props.onListen(s());
  };

  return (
    <View
      onPress={handleRowPress}
      class={`group relative flex-row items-center justify-between gap-3 rounded-2xl transition-all duration-300 ease-out cursor-pointer ${
        active()
          ? "border border-primary/35 bg-primary/10 dark:bg-white/10 px-4 py-3.5 shadow-md ring-1 ring-primary/20 scale-[1.01] opacity-100"
          : "border border-transparent bg-transparent px-3 py-2.5 opacity-40 hover:opacity-85 hover:bg-muted/30"
      }`}
    >
      {/* Left: Index badge + Subtitle text + Timestamp */}
      <View class="min-w-0 flex-1 flex-row items-center gap-3">
        {/* Index indicator */}
        <View
          class={`h-6 min-w-[28px] items-center justify-center rounded-md px-1 transition ${
            active()
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "bg-muted/70 text-muted-foreground group-hover:bg-muted"
          }`}
        >
          <Text
            class={`font-mono text-xs font-semibold ${
              active() ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {s().index + 1}
          </Text>
        </View>

        {/* Subtitle text container */}
        <View selectable class="min-w-0 flex-1 flex-col justify-center gap-1 select-text">
          <Text
            class={`select-text transition leading-relaxed ${
              active()
                ? "text-base sm:text-lg font-bold text-foreground drop-shadow-xs"
                : "text-sm sm:text-base font-normal text-muted-foreground"
            }`}
          >
            {displayText()}
          </Text>

          {/* Subtitle metadata (timestamp & difficulty) */}
          <View class="flex-row items-center gap-2 select-text">
            <Text class="select-text font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatTimeRange(s().startMs, s().endMs)}
            </Text>
            <If when={Boolean(s().difficulty)}>
              <Text class="select-text font-mono text-[10px] text-muted-foreground">
                {s().difficulty}
              </Text>
            </If>
            <If when={masked()}>
              <Text class="font-mono text-[10px] font-medium text-amber-500">
                {m().maskedBadge}
              </Text>
            </If>
          </View>
        </View>
      </View>

      {/* Right: Actions - ONLY shown on the focused active sentence to avoid visual noise */}
      <If when={active()}>
        <View class="shrink-0 flex-row items-center gap-1.5 pointer-events-auto">
          {/* Quick Reveal / Mask button */}
          <Button
            onPress={() => {
              props.onToggleReveal(s().index);
            }}
            class="h-8 items-center justify-center rounded-lg border border-border/80 bg-background/90 px-2.5 shadow-2xs transition hover:bg-muted active:scale-95"
            accessibilityLabel={masked() ? m().revealSentence : m().maskSentence}
          >
            <Icon
              name={masked() ? "eye" : "eye-off"}
              size={13}
              tone={masked() ? "muted-foreground" : "foreground"}
            />
            <Text class="hidden text-xs font-medium text-foreground sm:inline ml-1">
              {masked() ? m().revealSentence : m().maskSentence}
            </Text>
          </Button>

          {/* Play/Repeat active sentence button */}
          <Button
            onPress={() => {
              props.onListen(s());
            }}
            class={`h-8 flex-row items-center gap-1.5 rounded-lg px-3 shadow-xs transition active:scale-95 ${
              playing()
                ? "bg-emerald-600 text-white"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
            accessibilityLabel={`${m().listen} ${s().index + 1}`}
          >
            <Icon
              name={playing() ? "pause" : "repeat"}
              size={12}
              tone="primary-foreground"
            />
            <Text class="text-xs font-bold text-primary-foreground">
              {playing() ? m().playing : m().repeatSentence}
            </Text>
          </Button>
        </View>
      </If>
    </View>
  );
}
