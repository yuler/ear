import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { PlaybackRate } from "../player";
import { Icon } from "../ui/Icon";
import { formatSentenceTime } from "./sentencePlayer";

export type SentenceControlsBarProps = {
  activeIndex: () => number;
  totalSentences: () => number;
  currentTimeSec: () => number;
  durationSec: () => number;
  rate: () => PlaybackRate;
  loopSingle: () => boolean;
  onPrev: () => void;
  onRepeat: () => void;
  onNext: () => void;
  onToggleLoop: () => void;
  onCycleRate: () => void;
};

/**
 * Control toolbar for quick sentence navigation (Feature 4).
 * Previous sentence / Repeat current sentence / Next sentence / Loop mode.
 */
export function SentenceControlsBar(props: SentenceControlsBarProps) {
  const activeIdx = () => props.activeIndex();
  const total = () => props.totalSentences();
  const looping = () => props.loopSingle();

  return (
    <View class="flex-row flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-well/40 p-3 shadow-sm">
      {/* Left: Previous, Repeat, Next playback cluster */}
      <View class="flex-row items-center gap-2">
        {/* 上一句 */}
        <Button
          onPress={props.onPrev}
          disabled={activeIdx() <= 0}
          class={`flex-row items-center gap-1.5 rounded-lg border px-3 py-2 transition ${
            activeIdx() <= 0
              ? "border-line/40 bg-well/30 opacity-40"
              : "border-line bg-background shadow-xs active:scale-95 hover:bg-well"
          }`}
          accessibilityLabel="Previous sentence"
        >
          <Icon name="chevron-left" size={14} tone="foreground" />
          <Text class="text-xs font-semibold text-foreground">上一句</Text>
          <Text class="hidden font-mono text-[10px] text-dim sm:inline">(←)</Text>
        </Button>

        {/* 重复听 (Repeat) */}
        <Button
          onPress={props.onRepeat}
          class="flex-row items-center gap-2 rounded-lg bg-primary px-4 py-2 shadow-xs transition hover:opacity-90 active:scale-95"
          accessibilityLabel="Repeat current sentence"
        >
          <Icon name="repeat" size={14} tone="primary-foreground" />
          <Text class="text-xs font-bold text-primary-foreground">重复听</Text>
          <Text class="hidden font-mono text-[10px] text-primary-foreground opacity-75 sm:inline">
            (R)
          </Text>
        </Button>

        {/* 下一句 */}
        <Button
          onPress={props.onNext}
          disabled={total() === 0 || activeIdx() >= total() - 1}
          class={`flex-row items-center gap-1.5 rounded-lg border px-3 py-2 transition ${
            total() === 0 || activeIdx() >= total() - 1
              ? "border-line/40 bg-well/30 opacity-40"
              : "border-line bg-background shadow-xs active:scale-95 hover:bg-well"
          }`}
          accessibilityLabel="Next sentence"
        >
          <Text class="text-xs font-semibold text-foreground">下一句</Text>
          <Icon name="chevron-right" size={14} tone="foreground" />
          <Text class="hidden font-mono text-[10px] text-dim sm:inline">(→)</Text>
        </Button>
      </View>

      {/* Middle: Progress info */}
      <View class="flex-row items-center gap-2">
        <View class="rounded-md border border-line bg-background px-2.5 py-1">
          <Text class="font-mono text-xs font-semibold text-foreground">
            {total() > 0 ? `第 ${activeIdx() + 1} / ${total()} 句` : "0 / 0"}
          </Text>
        </View>
        <Text class="font-mono text-xs tabular-nums text-muted-foreground">
          {formatSentenceTime(props.currentTimeSec() * 1000)} /{" "}
          {formatSentenceTime(props.durationSec() * 1000)}
        </Text>
      </View>

      {/* Right: Loop toggle & Playback rate */}
      <View class="flex-row items-center gap-2">
        {/* 单句循环 toggle */}
        <Button
          onPress={props.onToggleLoop}
          class={`flex-row items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition ${
            looping()
              ? "border-primary bg-primary/10 text-primary"
              : "border-line bg-background text-muted-foreground"
          }`}
          accessibilityLabel="Loop current sentence toggle"
        >
          <Icon
            name="repeat"
            size={12}
            tone={looping() ? "primary" : "muted-foreground"}
          />
          <Text
            class={`text-xs font-medium ${
              looping() ? "text-primary font-bold" : "text-muted-foreground"
            }`}
          >
            {looping() ? "单句循环中" : "单句循环"}
          </Text>
        </Button>

        {/* 倍速 */}
        <Button
          onPress={props.onCycleRate}
          class="rounded-lg border border-line bg-background px-2.5 py-1.5 active:bg-accent"
        >
          <Text class="font-mono text-xs font-semibold text-foreground">
            {props.rate()}x
          </Text>
        </Button>
      </View>
    </View>
  );
}
