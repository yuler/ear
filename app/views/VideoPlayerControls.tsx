import { signal, Text, View, type ViewRef } from "nsh";
import { Button } from "nsh/base";
import type { PlaybackRate } from "../player";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import type { Sentence } from "../youtube/types";
import { formatSentenceTime } from "./sentencePlayer";

export type VideoPlayerControlsProps = {
  paused: () => boolean;
  onTogglePlay: () => void;
  currentTimeSec: () => number;
  durationSec: () => number;
  rate: () => PlaybackRate;
  onCycleRate: () => void;
  loopSingle: () => boolean;
  onToggleLoop: () => void;
  muted: () => boolean;
  onToggleMute: () => void;
  maskAll: () => boolean;
  onToggleMask: () => void;
  sentences: () => Sentence[];
  onPrevSentence: () => void;
  onRepeatSentence: () => void;
  onNextSentence: () => void;
  onSeek: (seconds: number) => void;
  language?: () => EarLocale;
  visible?: () => boolean;
  onActivity?: () => void;
};

/**
 * 100% width video player controls and interactive progress bar.
 */
export function VideoPlayerControls(props: VideoPlayerControlsProps) {
  let trackRef: ViewRef | null = null;
  let trackWidth = 0;
  const isBottomVisible = () => (props.visible ? props.visible() : false);

  const lang = () => props.language?.() ?? "en";
  const m = () => t(lang());

  const curSec = () => Math.max(0, props.currentTimeSec());
  const durSec = () => Math.max(0.1, props.durationSec());
  const percent = () => Math.min(100, Math.max(0, (curSec() / durSec()) * 100));

  const handleTrackPress = (e: { position?: { x: number; y: number } }) => {
    const x = e?.position?.x;
    if (typeof x === "number" && trackWidth > 0) {
      const ratio = Math.max(0, Math.min(1, x / trackWidth));
      props.onSeek(ratio * durSec());
    } else if (trackRef && typeof x === "number") {
      void trackRef.measure().then((mRef) => {
        if (mRef && mRef.bounds && mRef.bounds.size.width > 0) {
          const ratio = Math.max(0, Math.min(1, x / mRef.bounds.size.width));
          props.onSeek(ratio * durSec());
        }
      });
    }
  };

  return (
    <View
      onMouseEnter={props.onActivity}
      onMouseMove={props.onActivity}
      class="absolute inset-0 flex-col justify-between pointer-events-none"
    >
      {/* 1. Big Center Play Overlay Button when paused (only shown when controls are active) */}
      <If when={props.paused() && isBottomVisible()}>
        <View class="absolute inset-0 items-center justify-center bg-black/25 pointer-events-auto">
          <Button
            onPress={props.onTogglePlay}
            class="h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-black/75 shadow-2xl transition hover:scale-105 active:scale-95"
            accessibilityLabel={m().playVideo}
          >
            <Icon name="play" size={26} color="#ffffff" />
          </Button>
        </View>
      </If>

      {/* Spacer to push controls to bottom */}
      <View class="pointer-events-none flex-1" />

      {/* 2. Bottom Area: progress bar + controls (no in-video subtitles) */}
      <View
        class={`w-full flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-8 pb-3 sm:px-4 sm:pb-3.5 transition-all duration-300 ease-out pointer-events-auto ${
          isBottomVisible()
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        {/* 4. Seekable Progress Bar */}
        <View class="mb-2 w-full flex-col">
          <View
            ref={(node) => {
              trackRef = node;
            }}
            onLayout={(e) => {
              trackWidth = e.bounds.size.width;
            }}
            onPress={(e) => handleTrackPress(e)}
            class="group relative h-4 w-full cursor-pointer justify-center"
            accessibilityLabel={m().seekProgress}
          >
            {/* Background Track */}
            <View class="relative h-1.5 w-full overflow-hidden rounded-full bg-white/25 transition group-hover:h-2.5">
              {/* Played Fill */}
              <View
                style={{ width: `${percent()}%` }}
                class="h-full rounded-full bg-[#2f7cf6]"
              />

              {/* Sentence marker ticks */}
              <Each of={props.sentences()} key={(s) => `${s.startMs}-${s.endMs}-${s.index}`}>
                {(s) => {
                  return (
                    <View
                      style={{ left: `${(s().startMs / 1000 / durSec()) * 100}%` }}
                      class="pointer-events-none absolute top-0 bottom-0 w-[1.5px] bg-white/40"
                    />
                  );
                }}
              </Each>
            </View>

            {/* Draggable Scrubber Thumb */}
            <View
              style={{ left: `${percent()}%` }}
              class="pointer-events-none absolute -ml-1.5 h-3 w-3 rounded-full border border-black/30 bg-white shadow-md transition group-hover:scale-125"
            />
          </View>
        </View>

        {/* 5. Controllers Toolbar */}
        <View class="flex-row items-center justify-between gap-2">
          {/* Left: Play/Pause, Sentence jumps, Time */}
          <View class="flex-row items-center gap-1.5 sm:gap-2">
            {/* Play / Pause Toggle */}
            <Button
              onPress={props.onTogglePlay}
              class="h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition hover:bg-white/25 active:scale-95"
              accessibilityLabel={props.paused() ? m().play : m().pause}
            >
              <Icon
                name={props.paused() ? "play" : "pause"}
                size={14}
                color="#ffffff"
              />
            </Button>

            {/* Previous Sentence (⏮) */}
            <Button
              onPress={props.onPrevSentence}
              class="h-8 flex-row items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 text-white transition hover:bg-white/20 active:scale-95 shrink-0"
              accessibilityLabel={m().previousSentenceFull}
            >
              <Icon name="chevron-left" size={13} color="#ffffff" />
              <Text class="font-mono text-[11px] text-white/90 whitespace-nowrap">
                {m().prevSentence}
              </Text>
            </Button>

            {/* Repeat Current Sentence (🔁) */}
            <Button
              onPress={props.onRepeatSentence}
              class="h-8 flex-row items-center gap-1.5 rounded-lg bg-[#2f7cf6] px-3 text-white shadow-xs transition hover:bg-[#2f7cf6]/90 active:scale-95 shrink-0"
              accessibilityLabel={m().repeatSentenceFull}
            >
              <Icon name="repeat" size={12} color="#ffffff" />
              <Text class="text-xs font-semibold text-white whitespace-nowrap">
                {m().repeatSentence}
              </Text>
            </Button>

            {/* Next Sentence (⏭) */}
            <Button
              onPress={props.onNextSentence}
              class="h-8 flex-row items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 text-white transition hover:bg-white/20 active:scale-95 shrink-0"
              accessibilityLabel={m().nextSentenceFull}
            >
              <Text class="font-mono text-[11px] text-white/90 whitespace-nowrap">
                {m().nextSentence}
              </Text>
              <Icon name="chevron-right" size={13} color="#ffffff" />
            </Button>

            {/* Time Display */}
            <View class="ml-1 flex-row items-center">
              <Text class="font-mono text-xs tabular-nums text-white">
                {formatSentenceTime(curSec() * 1000)}
              </Text>
              <Text class="font-mono text-xs text-white/60"> / </Text>
              <Text class="font-mono text-xs tabular-nums text-white/75">
                {formatSentenceTime(durSec() * 1000)}
              </Text>
            </View>
          </View>

          {/* Right: Loop, Rate, Mute, Mask */}
          <View class="flex-row items-center gap-1.5 sm:gap-2">
            {/* Single Sentence Loop Toggle */}
            <Button
              onPress={props.onToggleLoop}
              class={`h-8 flex-row items-center gap-1 rounded-lg border px-2 transition active:scale-95 ${
                props.loopSingle()
                  ? "border-[#2f7cf6] bg-[#2f7cf6]/20 text-[#2f7cf6]"
                  : "border-white/15 bg-white/10 text-white/80 hover:bg-white/20"
              }`}
              accessibilityLabel={m().loopSentenceToggle}
            >
              <Icon
                name="repeat"
                size={12}
                color={props.loopSingle() ? "#2f7cf6" : "#ffffff"}
              />
              <Text
                class={`font-mono text-xs font-semibold ${
                  props.loopSingle() ? "text-[#2f7cf6]" : "text-white"
                }`}
              >
                {props.loopSingle() ? m().looping : m().loopSingle}
              </Text>
            </Button>

            {/* Playback Speed / Rate */}
            <Button
              onPress={props.onCycleRate}
              class="h-8 items-center justify-center rounded-lg border border-white/15 bg-white/10 px-2 text-white transition hover:bg-white/20 active:scale-95"
              accessibilityLabel={m().playbackSpeed}
            >
              <Text class="font-mono text-xs font-bold text-white">
                {props.rate()}x
              </Text>
            </Button>

            {/* Mute Toggle */}
            <Button
              onPress={props.onToggleMute}
              class="h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
              accessibilityLabel={props.muted() ? m().unmute : m().mute}
            >
              <Icon
                name={props.muted() ? "volume-x" : "volume"}
                size={14}
                color="#ffffff"
              />
            </Button>

            {/* Subtitle Mask Quick Toggle */}
            <Button
              onPress={props.onToggleMask}
              class={`h-8 flex-row items-center gap-1 rounded-lg border px-2 transition active:scale-95 ${
                props.maskAll()
                  ? "border-amber-400/60 bg-amber-400/20 text-amber-400"
                  : "border-white/15 bg-white/10 text-white/80 hover:bg-white/20"
              }`}
              accessibilityLabel={m().toggleSubtitlesMask}
            >
              <Icon
                name={props.maskAll() ? "eye-off" : "eye"}
                size={12}
                color={props.maskAll() ? "#f59e0b" : "#ffffff"}
              />
              <Text
                class={`hidden text-xs font-semibold sm:inline ${
                  props.maskAll() ? "text-amber-400" : "text-white"
                }`}
              >
                {props.maskAll() ? m().masked : m().captions}
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}
