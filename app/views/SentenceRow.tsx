import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "../ui/Icon";
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
};

/**
 * Single sentence row in the video detail practice view.
 * Supports masked subtitle display, reveal toggle, and prominent "去听" action.
 */
export function SentenceRow(props: SentenceRowProps) {
  const s = () => props.sentence();
  const active = () => props.isActive();
  const playing = () => props.isPlaying();
  const masked = () => isSentenceMasked(props.isMaskAll(), props.isRevealed());
  const displayText = () =>
    displaySentenceText(s().text, props.isMaskAll(), props.isRevealed());

  return (
    <View
      class={`flex-row items-start justify-between gap-3 rounded-xl border p-3 transition ${
        active()
          ? "border-primary bg-primary/5 shadow-xs"
          : "border-line/60 bg-well/20 hover:border-line hover:bg-well/40"
      }`}
    >
      {/* Left: Sentence index and text */}
      <View class="min-w-0 flex-1 flex-row items-start gap-3">
        {/* Index badge */}
        <View
          class={`mt-0.5 h-6 min-w-[28px] items-center justify-center rounded px-1 ${
            active()
              ? "bg-primary text-primary-foreground"
              : "bg-well text-muted-foreground"
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
        <View class="min-w-0 flex-1 gap-1">
          <Text
            class={`text-sm leading-relaxed ${
              active()
                ? "font-semibold text-foreground"
                : "font-normal text-foreground"
            }`}
          >
            {displayText()}
          </Text>

          {/* Timestamp range & difficulty */}
          <View class="flex-row items-center gap-2">
            <Text class="font-mono text-[11px] tabular-nums text-dim">
              {formatTimeRange(s().startMs, s().endMs)}
            </Text>
            <If when={s().difficulty}>
              <Text class="font-mono text-[10px] text-muted-foreground">
                {s().difficulty}
              </Text>
            </If>
            <If when={masked()}>
              <Text class="font-mono text-[10px] font-medium text-amber">
                已打码
              </Text>
            </If>
          </View>
        </View>
      </View>

      {/* Right: Actions cluster - "去听" button and reveal toggle */}
      <View class="shrink-0 flex-row items-center gap-1.5">
        {/* Reveal toggle button (eye) */}
        <Button
          onPress={() => props.onToggleReveal(s().index)}
          class="h-8 w-8 items-center justify-center rounded-lg border border-line bg-background transition hover:bg-well active:scale-95"
          accessibilityLabel={masked() ? "Reveal sentence" : "Mask sentence"}
        >
          <Icon
            name={masked() ? "eye" : "eye-off"}
            size={13}
            tone={masked() ? "muted-foreground" : "foreground"}
          />
        </Button>

        {/* Feature 3: "去听" button (Listen to this sentence) */}
        <Button
          onPress={() => props.onListen(s())}
          class={`flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 shadow-xs transition active:scale-95 ${
            active() && playing()
              ? "bg-ready text-white"
              : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
          accessibilityLabel={`Listen sentence ${s().index + 1}`}
        >
          <Icon
            name={active() && playing() ? "pause" : "headphones"}
            size={13}
            tone="primary-foreground"
          />
          <Text class="text-xs font-bold text-primary-foreground">
            {active() && playing() ? "播放中" : "去听"}
          </Text>
        </Button>
      </View>
    </View>
  );
}
