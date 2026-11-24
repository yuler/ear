import { signal, Text, View, type ViewStyle } from "nsh";
import type { EarLocale } from "../ui/i18n";
import type { Sentence } from "../youtube/types";
import type { SubtitleTextSize } from "./playerLayout";
import { displaySentenceText, formatTimeRange } from "./sentencePlayer";

export type SentenceRowProps = {
  sentence: () => Sentence;
  isActive: () => boolean;
  isPlaying: () => boolean;
  isMaskAll: () => boolean;
  isRevealed: () => boolean;
  onToggleReveal: (index: number) => void;
  onListen: (sentence: Sentence) => void;
  language?: () => EarLocale;
  activeIndex?: () => number;
  /** Picked from the subtitle column width (see subtitleTextSize). */
  textSize?: () => SubtitleTextSize;
};

const TEXT_SIZE_CLASS: Record<SubtitleTextSize, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
};

/**
 * Compute 3D cylinder wheel perspective transform and opacity based on distance from active sentence.
 * - Active (diff === 0): Faces straight forward (0deg), 100% scale, fully focused.
 * - Preceding ("前面" diff < 0): Curves backwards along the upper drum with rotateX and depth perspective.
 * - Upcoming ("后面" diff > 0): Curves gently downwards with multiple sentences visible ahead.
 */
export function getSentence3DStyle(diff: number): ViewStyle {
  const common = {
    transitionProperty: "transform, opacity",
    transitionDuration: "280ms" as const,
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" as const,
  };

  if (diff === 0) {
    return {
      ...common,
      transform: [
        { perspective: 800 },
        { rotateX: "0deg" },
        { scale: 1.02 },
      ],
      transformOrigin: "center center",
      opacity: 1,
    };
  }

  // Preceding sentences ("前面") - 3D curve backwards into the upper drum
  if (diff === -1) {
    return {
      ...common,
      transform: [
        { perspective: 800 },
        { rotateX: "16deg" },
        { translateY: -2 },
        { scale: 0.96 },
      ],
      transformOrigin: "center bottom",
      opacity: 0.55,
    };
  }
  if (diff === -2) {
    return {
      ...common,
      transform: [
        { perspective: 800 },
        { rotateX: "28deg" },
        { translateY: -6 },
        { scale: 0.91 },
      ],
      transformOrigin: "center bottom",
      opacity: 0.32,
    };
  }
  if (diff <= -3) {
    return {
      ...common,
      transform: [
        { perspective: 800 },
        { rotateX: "38deg" },
        { translateY: -10 },
        { scale: 0.85 },
      ],
      transformOrigin: "center bottom",
      opacity: 0.16,
    };
  }

  // Upcoming sentences ("后面") - 3D curve downwards with 2-3 sentences clearly readable
  if (diff === 1) {
    return {
      ...common,
      transform: [
        { perspective: 800 },
        { rotateX: "-10deg" },
        { translateY: 2 },
        { scale: 0.98 },
      ],
      transformOrigin: "center top",
      opacity: 0.72,
    };
  }
  if (diff === 2) {
    return {
      ...common,
      transform: [
        { perspective: 800 },
        { rotateX: "-18deg" },
        { translateY: 5 },
        { scale: 0.95 },
      ],
      transformOrigin: "center top",
      opacity: 0.52,
    };
  }
  if (diff === 3) {
    return {
      ...common,
      transform: [
        { perspective: 800 },
        { rotateX: "-26deg" },
        { translateY: 8 },
        { scale: 0.91 },
      ],
      transformOrigin: "center top",
      opacity: 0.36,
    };
  }
  return {
    ...common,
    transform: [
      { perspective: 800 },
      { rotateX: "-34deg" },
      { translateY: 12 },
      { scale: 0.87 },
    ],
    transformOrigin: "center top",
    opacity: 0.22,
  };
}

/**
 * Subtitle row: only the sentence text. The active row is highlighted;
 * the time range shows on hover. Pressing plays the sentence, and when
 * captions are masked pressing the text also reveals it.
 */
export function SentenceRow(props: SentenceRowProps) {
  const s = () => props.sentence();
  const active = () => props.isActive();
  const hovered = signal(false);
  const displayText = () =>
    displaySentenceText(s().text, props.isMaskAll(), props.isRevealed());
  const diff = () =>
    props.activeIndex != null ? s().index - props.activeIndex() : active() ? 0 : 1;
  const sizeClass = () => TEXT_SIZE_CLASS[props.textSize?.() ?? "md"];

  const handleTextPress = () => {
    if (props.isMaskAll()) props.onToggleReveal(s().index);
    props.onListen(s());
  };

  return (
    <View
      onPress={() => props.onListen(s())}
      onMouseEnter={() => hovered.set(true)}
      onMouseLeave={() => hovered.set(false)}
      style={getSentence3DStyle(diff())}
      class={`cursor-pointer rounded-lg border-l-2 px-4 py-2.5 ${
        active()
          ? "border-brand bg-brand-soft/60"
          : "border-transparent hover:bg-muted/40"
      }`}
    >
      <View onPress={handleTextPress} selectable class="select-text">
        <Text
          class={`select-text leading-relaxed ${sizeClass()} ${
            active() ? "font-medium text-foreground" : "text-muted-foreground"
          }`}
        >
          {displayText()}
        </Text>
      </View>
      <View style={{ opacity: hovered() ? 1 : 0 }} class="pt-1">
        <Text class="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTimeRange(s().startMs, s().endMs)}
        </Text>
      </View>
    </View>
  );
}
