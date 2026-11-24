import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { PlaybackRate } from "../player";
import { Icon, type IconName } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import type { SentenceLengthMode } from "../youtube/captions";
import type { Sentence } from "../youtube/types";
import { formatSentenceTime } from "./sentencePlayer";

export type VideoPlayerControlsProps = {
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
  muted?: () => boolean;
  onToggleMute?: () => void;
  sentencePause: () => boolean;
  onToggleSentencePause: () => void;
  maskAll: () => boolean;
  onToggleMask: () => void;
  sentenceLength: () => SentenceLengthMode;
  onChangeSentenceLength: (mode: SentenceLengthMode) => void;
  /** Omitted for audio-only entries (nothing to block). */
  blockerEnabled?: () => boolean;
  onToggleBlocker?: () => void;
  language: () => EarLocale;
  /** When false (playing & idle), full overlay fades out leaving only the slim blue progress line. */
  visible?: () => boolean;
  /** Hide optional text labels when the video box is narrow. */
  compact?: () => boolean;
  onControlsMouseEnter?: () => void;
  onControlsMouseLeave?: () => void;
};

/** Pure visibility rule: shown when paused, actively hovered, or keyboard-focused. */
export function shouldShowPlayerControls(
  paused: boolean,
  hovered: boolean,
  focused = false,
): boolean {
  return paused || hovered || focused;
}

const BTN =
  "h-7 min-w-7 flex-row items-center justify-center gap-1 rounded-md px-1.5 transition active:scale-95";

function overlayToggleClass(on: boolean): string {
  if (!on) return `${BTN} border border-transparent hover:bg-white/15 active:bg-white/20`;
  return `${BTN} border border-brand/70 bg-brand/25 hover:bg-brand/35`;
}

function OverlayIconButton(props: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Button
      onPress={props.onPress}
      class={overlayToggleClass(Boolean(props.active))}
      accessibilityLabel={props.label}
      tooltip={<Text class="text-xs">{props.label}</Text>}
    >
      <Icon
        name={props.icon}
        size={15}
        tone={props.active ? "brand" : undefined}
        color={props.active ? undefined : "rgba(255, 255, 255, 0.88)"}
      />
    </Button>
  );
}

/** YouTube-style full-width blue seekable progress track with sentence ticks. */
function SeekBar(props: {
  currentTimeSec: () => number;
  durationSec: () => number;
  onSeek: (seconds: number) => void;
  sentences: () => Sentence[];
  language: () => EarLocale;
}) {
  let trackWidth = 0;
  const dur = () => Math.max(0.1, props.durationSec());
  const percent = () =>
    Math.min(100, Math.max(0, (Math.max(0, props.currentTimeSec()) / dur()) * 100));

  return (
    <View
      onLayout={(e) => {
        trackWidth = e.bounds.size.width;
      }}
      onPress={(e: { position?: { x: number } }) => {
        const x = e?.position?.x;
        if (typeof x === "number" && trackWidth > 0) {
          props.onSeek(Math.max(0, Math.min(1, x / trackWidth)) * dur());
        }
      }}
      class="group relative h-4 w-full cursor-pointer justify-center"
      accessibilityLabel={t(props.language()).seekProgress}
    >
      <View class="relative h-[3px] w-full overflow-hidden rounded-full bg-white/25 transition-all group-hover:h-[5px]">
        <View style={{ width: `${percent()}%` }} class="h-full bg-brand" />
        <Each of={props.sentences()} key={(s) => `${s.startMs}-${s.endMs}-${s.index}`}>
          {(s) => (
            <View
              style={{ left: `${(s().startMs / 1000 / dur()) * 100}%` }}
              class="pointer-events-none absolute inset-y-0 w-px bg-black/50"
            />
          )}
        </Each>
      </View>
      <View
        style={{ left: `${percent()}%` }}
        class="pointer-events-none absolute -ml-1.5 h-3 w-3 rounded-full border border-white/90 bg-brand shadow-md transition-transform group-hover:scale-125"
      />
    </View>
  );
}

/**
 * YouTube-style bottom control bar overlaid inside the video frame.
 * Auto-hides while playing unless hovered/focused, leaving a slim blue
 * progress line along the bottom edge for immersive playback.
 */
export function VideoPlayerControls(props: VideoPlayerControlsProps) {
  const m = () => t(props.language());
  const visible = () => props.visible?.() ?? true;
  const compact = () => props.compact?.() ?? false;
  const dur = () => Math.max(0.1, props.durationSec());
  const percent = () =>
    Math.min(100, Math.max(0, (Math.max(0, props.currentTimeSec()) / dur()) * 100));

  const lengths: { mode: SentenceLengthMode; label: () => string; desc: () => string }[] = [
    { mode: "short", label: () => m().shortSentences, desc: () => m().shortSentencesDesc },
    { mode: "medium", label: () => m().mediumSentences, desc: () => m().mediumSentencesDesc },
    { mode: "long", label: () => m().longSentences, desc: () => m().longSentencesDesc },
  ];

  return (
    <>
      {/* Persistent slim blue progress line at the very bottom when controls auto-hide */}
      <View
        style={{
          opacity: visible() ? 0 : 1,
          transitionProperty: "opacity",
          transitionDuration: "220ms",
          transitionTimingFunction: "ease-out",
        }}
        class="pointer-events-none absolute right-0 bottom-0 left-0 z-20 h-[3px] bg-white/20"
      >
        <View style={{ width: `${percent()}%` }} class="h-full bg-brand" />
      </View>

      {/* Full YouTube-style bottom gradient overlay */}
      <View
        onMouseEnter={() => props.onControlsMouseEnter?.()}
        onMouseLeave={() => props.onControlsMouseLeave?.()}
        onPressDown={(e: any) => {
          e?.stopPropagation?.();
        }}
        style={{
          opacity: visible() ? 1 : 0,
          pointerEvents: visible() ? "auto" : "none",
          transitionProperty: "opacity",
          transitionDuration: "220ms",
          transitionTimingFunction: "ease-out",
        }}
        focusWithinStyle={{ opacity: 1 }}
        class="absolute right-0 bottom-0 left-0 z-20 flex-col justify-end bg-linear-to-t from-black/85 via-black/50 to-transparent px-3 pt-7 pb-2"
      >
        <SeekBar
          currentTimeSec={props.currentTimeSec}
          durationSec={props.durationSec}
          onSeek={props.onSeek}
          sentences={props.sentences}
          language={props.language}
        />

        <View class="mt-0.5 flex-row items-center justify-between gap-2">
          <View class="flex-row items-center gap-0.5">
            <OverlayIconButton
              icon="chevron-left"
              label={m().previousSentenceFull}
              onPress={props.onPrevSentence}
            />
            <Button
              onPress={props.onTogglePlay}
              class={`${BTN} w-8 bg-brand hover:bg-brand/90`}
              accessibilityLabel={props.paused() ? m().play : m().pause}
            >
              <Icon
                name={props.paused() ? "play" : "pause"}
                size={14}
                tone="brand-foreground"
              />
            </Button>
            <OverlayIconButton
              icon="chevron-right"
              label={m().nextSentenceFull}
              onPress={props.onNextSentence}
            />
            <OverlayIconButton
              icon="repeat"
              label={m().repeatSentenceFull}
              onPress={props.onRepeatSentence}
            />
            <If when={Boolean(props.onToggleMute)}>
              <OverlayIconButton
                icon={props.muted?.() ? "volume-x" : "volume"}
                label={props.muted?.() ? m().unmute : m().mute}
                onPress={() => props.onToggleMute?.()}
                active={Boolean(props.muted?.())}
              />
            </If>
            <View class="ml-1.5 flex-row items-center gap-1 select-none">
              <Text class="font-mono text-[11px] tabular-nums text-white/90">
                {formatSentenceTime(Math.max(0, props.currentTimeSec()) * 1000)}
              </Text>
              <Text class="font-mono text-[11px] text-white/45">/</Text>
              <Text class="font-mono text-[11px] tabular-nums text-white/65">
                {formatSentenceTime(dur() * 1000)}
              </Text>
            </View>
          </View>

          <View class="flex-row items-center gap-1">
            <Button
              onPress={props.onCycleRate}
              class={`${overlayToggleClass(props.rate() !== 1)} w-10`}
              accessibilityLabel={m().playbackSpeed}
              tooltip={<Text class="text-xs">{m().playbackSpeed}</Text>}
            >
              <Text
                class={`font-mono text-xs font-medium ${
                  props.rate() !== 1 ? "text-white" : "text-white/85"
                }`}
              >
                {props.rate()}x
              </Text>
            </Button>

            <Button
              onPress={props.onToggleSentencePause}
              class={overlayToggleClass(props.sentencePause())}
              accessibilityLabel={m().sentencePauseToggle}
              selected={props.sentencePause()}
            >
              <Text
                class={`text-xs font-medium ${
                  props.sentencePause() ? "text-white" : "text-white/80"
                }`}
              >
                {m().sentencePause}
              </Text>
            </Button>

            <Button
              onPress={props.onToggleMask}
              class={overlayToggleClass(props.maskAll())}
              accessibilityLabel={m().toggleSubtitlesMask}
              tooltip={<Text class="text-xs">{m().toggleSubtitlesMask}</Text>}
            >
              <Icon
                name={props.maskAll() ? "eye-off" : "eye"}
                size={14}
                tone={props.maskAll() ? "brand" : undefined}
                color={props.maskAll() ? undefined : "rgba(255, 255, 255, 0.85)"}
              />
              <If when={!compact()}>
                <Text
                  class={`text-xs font-medium ${
                    props.maskAll() ? "text-white" : "text-white/80"
                  }`}
                >
                  {props.maskAll() ? m().masked : m().captions}
                </Text>
              </If>
            </Button>

            <If when={Boolean(props.onToggleBlocker)}>
              <Button
                onPress={() => props.onToggleBlocker?.()}
                class={overlayToggleClass(Boolean(props.blockerEnabled?.()))}
                accessibilityLabel={m().toggleSubtitleBlocker}
                tooltip={<Text class="text-xs">{m().toggleSubtitleBlocker}</Text>}
              >
                <Icon
                  name="subtitle-block"
                  size={14}
                  tone={props.blockerEnabled?.() ? "brand" : undefined}
                  color={props.blockerEnabled?.() ? undefined : "rgba(255, 255, 255, 0.85)"}
                />
                <If when={!compact()}>
                  <Text
                    class={`text-xs font-medium ${
                      props.blockerEnabled?.() ? "text-white" : "text-white/80"
                    }`}
                  >
                    {m().subtitleBlocker}
                  </Text>
                </If>
              </Button>
            </If>

            <View class="ml-0.5 flex-row items-center rounded-md border border-white/15 bg-black/45 p-0.5">
              <Each of={lengths} key={(l) => l.mode}>
                {(l) => (
                  <Button
                    onPress={() => props.onChangeSentenceLength(l().mode)}
                    class={`h-6 justify-center rounded px-1.5 transition ${
                      props.sentenceLength() === l().mode
                        ? "bg-brand shadow-xs"
                        : "hover:bg-white/15"
                    }`}
                    accessibilityLabel={l().desc()}
                    selected={props.sentenceLength() === l().mode}
                  >
                    <Text
                      class={`text-xs ${
                        props.sentenceLength() === l().mode
                          ? "font-medium text-white"
                          : "text-white/70"
                      }`}
                    >
                      {l().label()}
                    </Text>
                  </Button>
                )}
              </Each>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}
