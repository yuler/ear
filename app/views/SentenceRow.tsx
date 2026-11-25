import { Text, View } from "nsh";
import type { EarLocale } from "../ui/i18n";
import type { Sentence } from "../youtube/types";
import type { SubtitleTextSize } from "./playerLayout";
import { formatSentenceTime, isSentenceMasked } from "./sentencePlayer";

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
 * Keeps the real text mounted at all times and cross-fades translucent mask bars
 * over it when masked so toggling mask/reveal causes zero height jump or flicker.
 */
export function SentenceRow(props: SentenceRowProps) {
  const s = () => props.sentence();
  const active = () => props.isActive();
  const compact = () => Boolean(props.compact?.());
  const bookmarked = () => Boolean(props.isBookmarked?.());
  const masked = () => isSentenceMasked(props.isMaskAll(), props.isRevealed());
  const sizeClass = () => TEXT_SIZE_CLASS[props.textSize?.() ?? "md"];

  const handleTextPress = () => {
    if (props.isMaskAll() && active()) props.onToggleReveal(s().index);
    props.onListen(s());
  };

  return (
    <View
      onPress={() => props.onListen(s())}
      style={{
        transitionProperty: "background-color, opacity",
        transitionDuration: "200ms",
        transitionTimingFunction: "ease-out",
      }}
      class={`cursor-pointer flex-row items-start gap-2.5 rounded-xl px-2.5 py-2 ${
        active() ? "bg-brand-soft/85" : "hover:bg-card/70"
      }`}
    >
      <View
        style={{
          transitionProperty: "background-color, transform, opacity",
          transitionDuration: "200ms",
          transitionTimingFunction: "ease-out",
          transform: active() ? [{ scaleY: 1 }] : [{ scaleY: 0.4 }],
          opacity: active() ? 1 : 0,
        }}
        class="mt-1 h-3.5 w-[3px] shrink-0 rounded-full bg-brand"
      />
      <If when={!compact()}>
        <Text
          class={`mt-0.5 w-9 shrink-0 font-mono text-[11px] tabular-nums ${
            active() ? "text-brand/80" : "text-dim"
          }`}
        >
          {formatSentenceTime(s().startMs)}
        </Text>
      </If>
      <View
        onPress={handleTextPress}
        selectable
        class="relative min-w-0 flex-1 select-text"
      >
        <Text
          style={{
            opacity: masked() ? 0 : 1,
            transitionProperty: "opacity",
            transitionDuration: "180ms",
            transitionTimingFunction: "ease-out",
          }}
          class={`select-text leading-snug ${sizeClass()} ${
            active()
              ? "font-semibold text-foreground"
              : "font-medium text-foreground/75"
          }`}
        >
          {s().text}
        </Text>
        <View
          style={{
            opacity: masked() ? 1 : 0,
            pointerEvents: "none",
            transitionProperty: "opacity",
            transitionDuration: "180ms",
            transitionTimingFunction: "ease-out",
          }}
          class="absolute inset-0 justify-center gap-1.5 py-0.5"
        >
          <View
            class={`h-2.5 w-4/5 rounded-full ${
              active() ? "bg-brand/25" : "bg-foreground/10"
            }`}
          />
          <If when={s().wordCount > 7}>
            <View
              class={`h-2.5 w-3/5 rounded-full ${
                active() ? "bg-brand/18" : "bg-foreground/10"
              }`}
            />
          </If>
        </View>
      </View>
      <If when={bookmarked()}>
        <View class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
      </If>
    </View>
  );
}
