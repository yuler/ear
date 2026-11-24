import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { PlaybackRate } from "../player";
import { Icon, type IconName } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import type { SentenceLengthMode } from "../youtube/captions";
import type { Sentence } from "../youtube/types";
import { PLAYER_CONTROLS_H } from "./playerLayout";
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
};

const BTN =
  "h-8 min-w-7 flex-row items-center justify-center gap-1 rounded-lg px-1.5 transition active:scale-95";

function toggleClass(on: boolean, tone: "neutral" | "brand" = "neutral"): string {
  if (!on) return `${BTN} border border-transparent hover:bg-well`;
  if (tone === "brand") return `${BTN} border border-brand/50 bg-brand-soft`;
  return `${BTN} border border-line bg-well`;
}

function IconButton(props: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  tone?: "neutral" | "brand";
}) {
  const iconTone = () => {
    if (!props.active) return "muted-foreground" as const;
    if (props.tone === "brand") return "brand" as const;
    return "foreground" as const;
  };
  return (
    <Button
      onPress={props.onPress}
      class={toggleClass(Boolean(props.active), props.tone)}
      accessibilityLabel={props.label}
      tooltip={<Text class="text-xs">{props.label}</Text>}
    >
      <Icon name={props.icon} size={15} tone={iconTone()} />
    </Button>
  );
}

/** Seekable progress track with sentence ticks and hover feedback. */
function SeekBar(props: VideoPlayerControlsProps) {
  let trackWidth = 0;
  const dur = () => Math.max(0.1, props.durationSec());
  const percent = () =>
    Math.min(100, Math.max(0, (Math.max(0, props.currentTimeSec()) / dur()) * 100));

  return (
    <View class="flex-row items-center gap-3">
      <Text class="font-mono text-xs tabular-nums text-muted-foreground">
        {formatSentenceTime(Math.max(0, props.currentTimeSec()) * 1000)}
      </Text>
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
        class="group relative h-4 flex-1 cursor-pointer justify-center"
        accessibilityLabel={t(props.language()).seekProgress}
      >
        <View class="relative h-1 w-full overflow-hidden rounded-full bg-muted transition-all group-hover:h-1.5">
          <View style={{ width: `${percent()}%` }} class="h-full bg-brand" />
          <Each of={props.sentences()} key={(s) => `${s.startMs}-${s.endMs}-${s.index}`}>
            {(s) => (
              <View
                style={{ left: `${(s().startMs / 1000 / dur()) * 100}%` }}
                class="pointer-events-none absolute inset-y-0 w-px bg-background/70"
              />
            )}
          </Each>
        </View>
        <View
          style={{ left: `${percent()}%` }}
          class="pointer-events-none absolute -ml-1.5 h-3 w-3 rounded-full border border-white/80 bg-brand shadow-sm transition-transform group-hover:scale-125"
        />
      </View>
      <Text class="font-mono text-xs tabular-nums text-muted-foreground">
        {formatSentenceTime(dur() * 1000)}
      </Text>
    </View>
  );
}

/**
 * Fixed control bar directly under the video: progress on top,
 * playback and sentence controls below.
 */
export function VideoPlayerControls(props: VideoPlayerControlsProps) {
  const m = () => t(props.language());
  const lengths: { mode: SentenceLengthMode; label: () => string; desc: () => string }[] = [
    { mode: "short", label: () => m().shortSentences, desc: () => m().shortSentencesDesc },
    { mode: "medium", label: () => m().mediumSentences, desc: () => m().mediumSentencesDesc },
    { mode: "long", label: () => m().longSentences, desc: () => m().longSentencesDesc },
  ];

  return (
    <View
      style={{ height: PLAYER_CONTROLS_H }}
      class="w-full shrink-0 justify-center gap-2 px-3"
    >
      <SeekBar {...props} />

      <View class="flex-row items-center justify-between gap-2">
        <View class="flex-row items-center gap-1">
          <IconButton
            icon="chevron-left"
            label={m().previousSentenceFull}
            onPress={props.onPrevSentence}
          />
          <Button
            onPress={props.onTogglePlay}
            class={`${BTN} w-9 bg-brand hover:opacity-90`}
            accessibilityLabel={props.paused() ? m().play : m().pause}
          >
            <Icon
              name={props.paused() ? "play" : "pause"}
              size={15}
              tone="brand-foreground"
            />
          </Button>
          <IconButton
            icon="chevron-right"
            label={m().nextSentenceFull}
            onPress={props.onNextSentence}
          />
          <IconButton
            icon="repeat"
            label={m().repeatSentenceFull}
            onPress={props.onRepeatSentence}
          />
          <Button
            onPress={props.onCycleRate}
            class={`${toggleClass(props.rate() !== 1, "brand")} w-11`}
            accessibilityLabel={m().playbackSpeed}
            tooltip={<Text class="text-xs">{m().playbackSpeed}</Text>}
          >
            <Text
              class={`font-mono text-xs font-medium ${
                props.rate() !== 1 ? "text-brand" : "text-foreground"
              }`}
            >
              {props.rate()}x
            </Text>
          </Button>
          <If when={Boolean(props.onToggleMute)}>
            <IconButton
              icon={props.muted?.() ? "volume-x" : "volume"}
              label={props.muted?.() ? m().unmute : m().mute}
              onPress={() => props.onToggleMute?.()}
              active={Boolean(props.muted?.())}
              tone="brand"
            />
          </If>
        </View>

        <View class="flex-row items-center gap-1">
          <Button
            onPress={props.onToggleSentencePause}
            class={toggleClass(props.sentencePause(), "brand")}
            accessibilityLabel={m().sentencePauseToggle}
            selected={props.sentencePause()}
          >
            <Text
              class={`text-xs font-medium ${
                props.sentencePause() ? "text-brand" : "text-muted-foreground"
              }`}
            >
              {m().sentencePause}
            </Text>
          </Button>

          <Button
            onPress={props.onToggleMask}
            class={toggleClass(props.maskAll(), "brand")}
            accessibilityLabel={m().toggleSubtitlesMask}
            tooltip={<Text class="text-xs">{m().toggleSubtitlesMask}</Text>}
          >
            <Icon
              name={props.maskAll() ? "eye-off" : "eye"}
              size={14}
              tone={props.maskAll() ? "brand" : "muted-foreground"}
            />
            <Text
              class={`hidden text-xs font-medium md:flex ${
                props.maskAll() ? "text-brand" : "text-muted-foreground"
              }`}
            >
              {props.maskAll() ? m().masked : m().captions}
            </Text>
          </Button>

          <If when={Boolean(props.onToggleBlocker)}>
            <Button
              onPress={() => props.onToggleBlocker?.()}
              class={toggleClass(Boolean(props.blockerEnabled?.()), "brand")}
              accessibilityLabel={m().toggleSubtitleBlocker}
              tooltip={<Text class="text-xs">{m().toggleSubtitleBlocker}</Text>}
            >
              <Icon
                name="subtitle-block"
                size={14}
                tone={props.blockerEnabled?.() ? "brand" : "muted-foreground"}
              />
              <Text
                class={`hidden text-xs font-medium md:flex ${
                  props.blockerEnabled?.() ? "text-brand" : "text-muted-foreground"
                }`}
              >
                {m().subtitleBlocker}
              </Text>
            </Button>
          </If>

          <View class="ml-0.5 flex-row items-center rounded-lg border border-line bg-well p-0.5">
            <Each of={lengths} key={(l) => l.mode}>
              {(l) => (
                <Button
                  onPress={() => props.onChangeSentenceLength(l().mode)}
                  class={`h-7 justify-center rounded-md px-1.5 transition ${
                    props.sentenceLength() === l().mode
                      ? "bg-brand-soft shadow-xs"
                      : "hover:bg-accent"
                  }`}
                  accessibilityLabel={l().desc()}
                  selected={props.sentenceLength() === l().mode}
                >
                  <Text
                    class={`text-xs ${
                      props.sentenceLength() === l().mode
                        ? "font-medium text-brand"
                        : "text-muted-foreground"
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
  );
}
