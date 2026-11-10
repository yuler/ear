import { effect, Image, keymap, Scroll, signal, Text, Video, View } from "nsh";
import { Button } from "nsh/base";
import {
  clipEnded,
  msToSeconds,
  resolvePlaybackSource,
  type PlaybackRate,
} from "../player";
import { Icon } from "../ui/Icon";
import { settings, subtitleClass } from "../ui/settings";
import { videoPosterUrl } from "../youtube/parse";
import type { LoadedLesson, Sentence } from "../youtube/types";
import {
  applyTag,
  countTags,
  createBlindFlowSession,
  currentSentence,
  hideCaption,
  isComplete,
  maskCaption,
  restartBlindFlow,
  revealCaption,
  type BlindFlowSession,
  type BlindTag,
} from "./blindFlow";
import { nextRate } from "./loopDojo";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function tagDotClass(tag: BlindTag): string {
  if (tag === "pass") return "bg-ready";
  if (tag === "blind") return "bg-danger";
  return "bg-muted-foreground";
}

function tagBorderClass(active: boolean, tag: BlindTag): string {
  if (!active) return "border-line";
  if (tag === "pass") return "border-ready";
  if (tag === "blind") return "border-danger";
  return "border-foreground";
}

function tagTextClass(tag: BlindTag | undefined): string {
  if (tag === "pass") return "text-ready";
  if (tag === "blind") return "text-danger";
  return "text-muted-foreground";
}

function TagButton(props: {
  tag: BlindTag;
  label: string;
  shortcut: string;
  active: () => boolean;
  onPress: () => void;
}) {
  return (
    <Button
      onPress={props.onPress}
      class={`flex-1 flex-row items-center justify-between rounded-md border px-3.5 py-2.5 active:bg-accent ${tagBorderClass(
        props.active(),
        props.tag,
      )}`}
    >
      <View class="flex-row items-center gap-2">
        <View class={`h-2 w-2 rounded-full ${tagDotClass(props.tag)}`} />
        <Text class="text-sm font-medium text-foreground">{props.label}</Text>
      </View>
      <Text class="font-mono text-xs text-dim">{props.shortcut}</Text>
    </Button>
  );
}

type Props = {
  /** Accessor so download completion (file:// swap) updates the player. */
  lesson: () => LoadedLesson;
  /** Shared with Loop Dojo (Lag / Blind feed the dojo queue). */
  tags: Record<number, BlindTag>;
  onTagsChange: (tags: Record<number, BlindTag>) => void;
  onOpenDojo?: () => void;
  onDownload?: () => void;
  saving?: () => boolean;
  initialIndex?: number;
};

/**
 * Blind Flow: minimal single-column listening stage.
 * Video -> focal subtitle -> thin timeline -> controls -> collapsible transcript.
 */
export function BlindFlow(props: Props) {
  const lesson = () => props.lesson();
  const session = signal<BlindFlowSession>({
    ...createBlindFlowSession(),
    index:
      props.initialIndex != null
        ? Math.max(
            0,
            Math.min(lesson().sentences.length - 1, props.initialIndex),
          )
        : 0,
    tags: { ...props.tags },
  });
  const playing = signal(false);
  const rate = signal<PlaybackRate>(settings().preferredRate);
  const clipEndMs = signal<number | null>(null);
  const showTranscript = signal(false);
  let video: { seek(seconds: number): void } | null = null;

  const sentences = () => lesson().sentences;
  const playback = () => resolvePlaybackSource(lesson().video);
  const mediaUrl = () => playback().url;
  const hasVideoStream = () => playback().hasPicture;
  const posterUrl = () =>
    videoPosterUrl(lesson().video.videoId, lesson().video.thumbnailUrl);

  const playSentence = (s: Sentence) => {
    const url = mediaUrl();
    if (!url || !video) {
      playing.set(false);
      return;
    }
    clipEndMs.set(s.endMs);
    video.seek(msToSeconds(s.startMs));
    playing.set(true);
  };

  const stopPlayback = () => {
    playing.set(false);
    clipEndMs.set(null);
  };

  const onTag = (tag: BlindTag) => {
    stopPlayback();
    const next = applyTag(session(), tag, sentences().length);
    session.set(next);
    props.onTagsChange(next.tags);
  };

  const onRestart = () => {
    stopPlayback();
    session.set(restartBlindFlow());
    props.onTagsChange({});
  };

  const jumpTo = (idx: number, autoPlay = false) => {
    const list = sentences();
    if (list.length === 0) return;
    const clamped = Math.max(0, Math.min(list.length - 1, idx));
    session.set({
      ...session(),
      index: clamped,
      revealed: false,
    });
    if (autoPlay) {
      const target = list[clamped];
      if (target) {
        playSentence(target);
      }
    } else {
      stopPlayback();
    }
  };

  const jumpAndPlay = (idx: number) => jumpTo(idx, true);

  effect(() => {
    if (props.initialIndex != null && props.initialIndex !== session().index) {
      jumpAndPlay(props.initialIndex);
    }
  });

  const toggleReveal = () => {
    const cur = session();
    session.set(cur.revealed ? hideCaption(cur) : revealCaption(cur));
  };

  const done = () => isComplete(session(), sentences().length);
  const sentence = () => currentSentence(sentences(), session());
  const activeSentence = (): Sentence | null => (done() ? null : sentence());
  const counts = () => countTags(session().tags);
  const progressLabel = () => {
    const list = sentences();
    if (list.length === 0) return "0 / 0";
    return `${Math.min(session().index + 1, list.length)} / ${list.length}`;
  };

  keymap.bind(
    {
      space: () => {
        const s = sentence();
        if (!s) return;
        if (playing()) stopPlayback();
        else playSentence(s);
      },
      r: () => toggleReveal(),
      "1": () => {
        if (!done()) onTag("pass");
      },
      "2": () => {
        if (!done()) onTag("lag");
      },
      "3": () => {
        if (!done()) onTag("blind");
      },
      left: () => jumpAndPlay(session().index - 1),
      right: () => jumpAndPlay(session().index + 1),
    },
    { when: "notEditing" },
  );

  return (
    <View class="mx-auto w-full max-w-[720px] gap-6 py-2">
      {/* Round complete */}
      <If when={done()}>
        <View class="gap-4 border-b border-line pb-6">
          <View class="gap-1">
            <Text class="text-lg font-semibold text-foreground">
              Round complete
            </Text>
            <Text class="font-mono text-xs text-muted-foreground">
              Pass {counts().pass} · Lag {counts().lag} · Blind {counts().blind}
            </Text>
          </View>

          <View class="flex-row items-center gap-2.5">
            <If when={counts().lag + counts().blind > 0 && props.onOpenDojo}>
              <Button
                onPress={() => props.onOpenDojo?.()}
                class="rounded-md bg-primary px-4 py-2 active:opacity-90"
              >
                <Text class="text-sm font-medium text-primary-foreground">
                  Drill {counts().lag + counts().blind} in Loop Dojo
                </Text>
              </Button>
            </If>
            <Button
              onPress={onRestart}
              class="rounded-md border border-line px-4 py-2 active:bg-accent"
            >
              <Text class="text-sm text-foreground">Restart</Text>
            </Button>
          </View>
        </View>
      </If>

      {/* Active sentence stage */}
      <If when={activeSentence()}>
        {(get) => (
          <View class="gap-5">
            {/* Clean video frame with video poster */}
            <View class="relative flex aspect-video max-h-[380px] w-full items-center justify-center overflow-hidden rounded-md bg-black">
              <If when={mediaUrl()}>
                <Video
                  ref={(node) => {
                    video = node;
                  }}
                  src={mediaUrl()!}
                  paused={!playing()}
                  rate={rate()}
                  volume={1}
                  audioSession="playback"
                  controls={false}
                  progressUpdateInterval={80}
                  class="h-full w-full object-contain"
                  onProgress={(e) => {
                    const end = clipEndMs();
                    if (end == null || !playing()) return;
                    if (clipEnded(e.currentTime, end)) stopPlayback();
                  }}
                  onEnd={() => stopPlayback()}
                  onError={() => stopPlayback()}
                />
              </If>

              {/* Video poster overlay when paused, audio-only, or captions-only */}
              <If when={!playing() || !hasVideoStream()}>
                <Image
                  src={posterUrl()}
                  class="absolute inset-0 h-full w-full object-cover"
                />
                <View class="absolute inset-0 bg-black/25" />
              </If>

              <If when={!mediaUrl()}>
                <View class="absolute bottom-2.5 left-2.5 rounded bg-black/75 px-2 py-0.5">
                  <Text class="font-mono text-[11px] text-white">
                    Captions only
                  </Text>
                </View>
              </If>

              <Button
                onPress={() =>
                  playing() ? stopPlayback() : playSentence(get())
                }
                class="absolute inset-0 items-center justify-center bg-transparent"
                accessibilityLabel={playing() ? "Pause" : "Play"}
              >
                <If when={!playing() && mediaUrl()}>
                  <View class="h-12 w-12 items-center justify-center rounded-full bg-black/65">
                    <Icon name="play" size={18} color="#fafafa" />
                  </View>
                </If>
              </Button>
            </View>

            {/* Focal subtitle */}
            <Button
              onPress={toggleReveal}
              class="min-h-[84px] items-center justify-center px-2 py-3"
            >
              <Text
                class={`text-center font-medium text-foreground ${subtitleClass(
                  settings().subtitleSize,
                )}`}
              >
                {session().revealed ? get().text : maskCaption(get().text)}
              </Text>
            </Button>

            {/* Thin sentence timeline */}
            <View class="gap-2">
              <View class="flex-row items-center justify-between">
                <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                  {progressLabel()}
                </Text>
                <Text class="font-mono text-xs tabular-nums text-dim">
                  {formatMs(get().startMs)} – {formatMs(get().endMs)}
                </Text>
              </View>
              <View class="flex-row items-center gap-1">
                <Each of={sentences()} key="index">
                  {(item) => (
                    <Button
                      onPress={() => jumpAndPlay(item().index)}
                      class={`h-1 flex-1 rounded-full ${
                        session().tags[item().index] === "pass"
                          ? "bg-ready"
                          : session().tags[item().index] === "blind"
                            ? "bg-danger"
                            : session().tags[item().index] === "lag"
                              ? "bg-muted-foreground"
                              : item().index === session().index
                                ? "bg-foreground"
                                : "bg-line"
                      }`}
                      accessibilityLabel={`Sentence ${item().index + 1}`}
                    />
                  )}
                </Each>
              </View>
            </View>

            {/* Single-row transport & utility controls */}
            <View class="flex-row flex-wrap items-center justify-between gap-2">
              <View class="flex-row items-center gap-2">
                <Button
                  onPress={() => jumpAndPlay(session().index - 1)}
                  class="rounded-md border border-line px-3 py-2 active:bg-accent"
                  accessibilityLabel="Previous sentence"
                >
                  <Icon name="chevron-left" size={14} tone="foreground" />
                </Button>

                <Button
                  onPress={() =>
                    playing() ? stopPlayback() : playSentence(get())
                  }
                  class="flex-row items-center gap-2 rounded-md bg-primary px-4 py-2 active:opacity-90"
                >
                  <Icon
                    name={playing() ? "pause" : "play"}
                    size={14}
                    tone="primary-foreground"
                  />
                  <Text class="text-sm font-medium text-primary-foreground">
                    {playing() ? "Pause" : "Play"}
                  </Text>
                </Button>

                <Button
                  onPress={toggleReveal}
                  class="rounded-md border border-line px-3.5 py-2 active:bg-accent"
                >
                  <Text class="text-sm text-foreground">
                    {session().revealed ? "Hide" : "Reveal"}
                  </Text>
                </Button>

                <Button
                  onPress={() => jumpAndPlay(session().index + 1)}
                  class="rounded-md border border-line px-3 py-2 active:bg-accent"
                  accessibilityLabel="Next sentence"
                >
                  <Icon name="chevron-right" size={14} tone="foreground" />
                </Button>
              </View>

              <View class="flex-row items-center gap-2">
                <Button
                  onPress={() => rate.set(nextRate(rate()))}
                  class="rounded-md border border-line px-2.5 py-2 active:bg-accent"
                >
                  <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                    {rate()}×
                  </Text>
                </Button>

                <If when={props.onDownload}>
                  <Button
                    onPress={() => props.onDownload?.()}
                    class="rounded-md border border-line px-2.5 py-2 active:bg-accent"
                    accessibilityLabel="Download lesson"
                  >
                    <Text class="text-xs text-muted-foreground">
                      {props.saving?.() ? "Saving…" : "Download"}
                    </Text>
                  </Button>
                </If>

                <Button
                  onPress={() => showTranscript.set(!showTranscript())}
                  class={`rounded-md border px-2.5 py-2 active:bg-accent ${
                    showTranscript() ? "border-foreground" : "border-line"
                  }`}
                >
                  <Text class="text-xs text-muted-foreground">Transcript</Text>
                </Button>
              </View>
            </View>

            {/* Pass / Lag / Blind */}
            <View class="flex-row gap-2.5">
              <TagButton
                tag="pass"
                label="Pass"
                shortcut="1"
                active={() => session().tags[get().index] === "pass"}
                onPress={() => onTag("pass")}
              />
              <TagButton
                tag="lag"
                label="Lag"
                shortcut="2"
                active={() => session().tags[get().index] === "lag"}
                onPress={() => onTag("lag")}
              />
              <TagButton
                tag="blind"
                label="Blind"
                shortcut="3"
                active={() => session().tags[get().index] === "blind"}
                onPress={() => onTag("blind")}
              />
            </View>
          </View>
        )}
      </If>

      <If when={sentences().length === 0}>
        <Text class="text-sm text-muted-foreground">
          No sentences to practice.
        </Text>
      </If>

      {/* Collapsible transcript list (collapsed by default) */}
      <If when={showTranscript()}>
        <View class="border-t border-line pt-4">
          <Scroll class="max-h-[320px]">
            <Each of={sentences()} key="index">
              {(item) => (
                <Button
                  onPress={() => jumpAndPlay(item().index)}
                  class={`w-full flex-row items-baseline justify-between gap-4 border-b border-line py-2.5 ${
                    item().index === session().index && !done()
                      ? "border-l-2 border-l-foreground pl-2.5"
                      : ""
                  }`}
                >
                  <View class="min-w-0 flex-1 flex-row items-baseline gap-3">
                    <Text class="shrink-0 font-mono text-xs tabular-nums text-dim">
                      {item().index + 1}
                    </Text>
                    <Text
                      class={`min-w-0 flex-1 text-sm ${
                        item().index === session().index && !done()
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {session().tags[item().index] != null ||
                      (item().index === session().index &&
                        session().revealed) ||
                      done()
                        ? item().text
                        : maskCaption(item().text)}
                    </Text>
                  </View>
                  <View class="shrink-0 flex-row items-center gap-2">
                    <If when={session().tags[item().index]}>
                      <Text
                        class={`font-mono text-[11px] uppercase ${tagTextClass(
                          session().tags[item().index],
                        )}`}
                      >
                        {session().tags[item().index]}
                      </Text>
                    </If>
                    <Text class="font-mono text-xs tabular-nums text-dim">
                      {formatMs(item().startMs)}
                    </Text>
                  </View>
                </Button>
              )}
            </Each>
          </Scroll>
        </View>
      </If>
    </View>
  );
}
