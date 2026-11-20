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

const BTN = "h-8 min-w-8 flex-row items-center justify-center gap-1.5 rounded-md px-2";

function toggleClass(on: boolean): string {
  return `${BTN} border ${
    on
      ? "border-ring bg-accent"
      : "border-transparent hover:bg-accent"
  }`;
}

function IconButton(props: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Button
      onPress={props.onPress}
      class={toggleClass(Boolean(props.active))}
      accessibilityLabel={props.label}
      tooltip={<Text class="text-xs">{props.label}</Text>}
    >
      <Icon
        name={props.icon}
        size={15}
        tone={props.active ? "foreground" : "muted-foreground"}
      />
    </Button>
  );
}

/** Seekable progress track with sentence ticks. */
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
        class="h-4 flex-1 cursor-pointer justify-center"
        accessibilityLabel={t(props.language()).seekProgress}
      >
        <View class="relative h-1 w-full overflow-hidden rounded-full bg-muted">
          <View style={{ width: `${percent()}%` }} class="h-full bg-foreground" />
          <Each of={props.sentences()} key={(s) => `${s.startMs}-${s.endMs}-${s.index}`}>
            {(s) => (
              <View
                style={{ left: `${(s().startMs / 1000 / dur()) * 100}%` }}
                class="pointer-events-none absolute inset-y-0 w-px bg-background/60"
              />
            )}
          </Each>
        </View>
        <View
          style={{ left: `${percent()}%` }}
          class="pointer-events-none absolute -ml-1.5 h-3 w-3 rounded-full bg-foreground"
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
 * playback and sentence controls below. No overlay, no auto-hide.
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
            class={`${BTN} w-9 bg-primary`}
            accessibilityLabel={props.paused() ? m().play : m().pause}
          >
            <Icon
              name={props.paused() ? "play" : "pause"}
              size={15}
              tone="primary-foreground"
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
            class={`${toggleClass(props.rate() !== 1)} w-12`}
            accessibilityLabel={m().playbackSpeed}
          >
            <Text class="font-mono text-xs text-foreground">{props.rate()}x</Text>
          </Button>
        </View>

        <View class="flex-row items-center gap-1">
          <Button
            onPress={props.onToggleSentencePause}
            class={toggleClass(props.sentencePause())}
            accessibilityLabel={m().sentencePauseToggle}
            selected={props.sentencePause()}
          >
            <Text
              class={`text-xs ${
                props.sentencePause() ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {m().sentencePause}
            </Text>
          </Button>
          <IconButton
            icon={props.maskAll() ? "eye-off" : "eye"}
            label={m().toggleSubtitlesMask}
            onPress={props.onToggleMask}
            active={props.maskAll()}
          />
          <If when={Boolean(props.onToggleBlocker)}>
            <IconButton
              icon="subtitle-block"
              label={m().toggleSubtitleBlocker}
              onPress={() => props.onToggleBlocker?.()}
              active={Boolean(props.blockerEnabled?.())}
            />
          </If>
          <View class="ml-1 flex-row items-center rounded-md bg-muted p-0.5">
            <Each of={lengths} key={(l) => l.mode}>
              {(l) => (
                <Button
                  onPress={() => props.onChangeSentenceLength(l().mode)}
                  class={`h-7 justify-center rounded px-2 ${
                    props.sentenceLength() === l().mode ? "bg-background" : ""
                  }`}
                  accessibilityLabel={l().desc()}
                  selected={props.sentenceLength() === l().mode}
                >
                  <Text
                    class={`text-xs ${
                      props.sentenceLength() === l().mode
                        ? "text-foreground"
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
