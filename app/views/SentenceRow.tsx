import { Text, View } from "nsh";
import type { EarLocale } from "../ui/i18n";
import type { Sentence } from "../youtube/types";
import type { SubtitleTextSize } from "./playerLayout";
import { displaySentenceText, formatSentenceTime } from "./sentencePlayer";

export type SentenceRowProps = {
  sentence: () => Sentence;
  isActive: () => boolean;
  isPlaying: () => boolean;
  isMaskAll: () => boolean;
  isRevealed: () => boolean;
  isBookmarked?: () => boolean;
  compact?: () => boolean;
  onToggleReveal: (index: number) => void;
  onListen: (sentence: Sentence) => void;
  language?: () => EarLocale;
  activeIndex?: () => number;
  /** Picked from the subtitle column width (see subtitleTextSize). */
  textSize?: () => SubtitleTextSize;
};

const TEXT_SIZE_CLASS: Record<SubtitleTextSize, string> = {
  sm: "text-sm",
  md: "text-sm",
  lg: "text-[15px]",
};

/**
 * Clean 2D transcript stream row for the Dual-Zone Studio.
 * Shows optional compact timestamp, sentence text (masked or revealed), and a
 * subtle brand dot when bookmarked; clicking jumps to and plays the sentence.
 */
export function SentenceRow(props: SentenceRowProps) {
  const s = () => props.sentence();
  const active = () => props.isActive();
  const compact = () => Boolean(props.compact?.());
  const bookmarked = () => Boolean(props.isBookmarked?.());
  const displayText = () =>
    displaySentenceText(s().text, props.isMaskAll(), props.isRevealed());
  const sizeClass = () => TEXT_SIZE_CLASS[props.textSize?.() ?? "md"];

  const handleTextPress = () => {
    if (props.isMaskAll() && active()) props.onToggleReveal(s().index);
    props.onListen(s());
  };

  return (
    <View
      onPress={() => props.onListen(s())}
      class={`cursor-pointer flex-row items-start gap-2.5 rounded-xl border-l-2 px-3 py-2 transition ${
        active()
          ? "border-brand bg-brand-soft/80"
          : "border-transparent hover:bg-card/70"
      }`}
    >
      <If when={!compact()}>
        <Text class="mt-0.5 w-9 shrink-0 font-mono text-[11px] tabular-nums text-dim">
          {formatSentenceTime(s().startMs)}
        </Text>
      </If>
      <View onPress={handleTextPress} selectable class="min-w-0 flex-1 select-text">
        <Text
          class={`select-text leading-snug ${sizeClass()} ${
            active()
              ? "font-semibold text-foreground"
              : "font-medium text-foreground/75"
          }`}
        >
          {displayText()}
        </Text>
      </View>
      <If when={bookmarked()}>
        <View class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
      </If>
    </View>
  );
}
