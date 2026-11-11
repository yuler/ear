import { Text, View, type TransformStep, type ViewStyle } from "nsh";
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
  activeIndex?: () => number;
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
 * 3D Rolling Subtitle Item:
 * Pure typography with zero button clutter.
 * Preceding sentences tilt back in 3D perspective; upcoming sentences roll in smoothly below.
 */
export function SentenceRow(props: SentenceRowProps) {
  const s = () => props.sentence();
  const active = () => props.isActive();
  const masked = () => isSentenceMasked(props.isMaskAll(), props.isRevealed());
  const displayText = () =>
    displaySentenceText(s().text, props.isMaskAll(), props.isRevealed());
  const lang = () => props.language?.() ?? "en";
  const m = () => t(lang());

  const diff = () =>
    props.activeIndex != null ? s().index - props.activeIndex() : active() ? 0 : 1;

  const style3D = () => getSentence3DStyle(diff());

  const handleRowPress = () => {
    props.onListen(s());
  };

  const handleTextPress = () => {
    if (props.isMaskAll()) {
      props.onToggleReveal(s().index);
    }
    props.onListen(s());
  };

  return (
    <View
      onPress={handleRowPress}
      style={style3D()}
      class={`group relative flex-row items-center justify-between gap-3 rounded-2xl transition cursor-pointer select-text ${
        active()
          ? "border border-primary/35 bg-primary/10 dark:bg-white/10 px-4 py-3 shadow-md ring-1 ring-primary/20"
          : "border border-transparent bg-transparent px-3 py-2 hover:bg-muted/30"
      }`}
    >
      {/* Index badge + Subtitle text + Timestamp */}
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
        <View
          onPress={handleTextPress}
          selectable
          class="min-w-0 flex-1 flex-col justify-center gap-1 select-text"
        >
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
    </View>
  );
}
