import { keymap, Scroll, signal, Text, Video, View } from "nsh";
import { Button } from "nsh/base";
import {
  clipEnded,
  msToSeconds,
  type PlaybackRate,
} from "../player/AudioEngine";
import { Icon } from "../ui/Icon";
import type { Difficulty, LoadedLesson, Sentence } from "../youtube/types";
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

function difficultyStyle(d: Difficulty): string {
  if (d === "i-1") return "bg-ready-soft text-ready border-ready/30";
  if (d === "i+1") return "bg-amber-soft text-amber border-amber/30";
  return "bg-danger-soft text-danger border-danger/30";
}

function tagBadgeStyle(tag: BlindTag | undefined): {
  bg: string;
  text: string;
  label: string;
} {
  if (tag === "pass") {
    return { bg: "bg-ready-soft", text: "text-ready", label: "Pass" };
  }
  if (tag === "lag") {
    return { bg: "bg-amber-soft", text: "text-amber", label: "Lag" };
  }
  if (tag === "blind") {
    return { bg: "bg-danger-soft", text: "text-danger", label: "Blind" };
  }
  return { bg: "bg-raised", text: "text-faint", label: "Untagged" };
}

function TagButton(props: {
  label: string;
  hint: string;
  shortcut: string;
  count: () => number;
  onPress: () => void;
  toneClass: string;
  dotClass: string;
}) {
  return (
    <Button
      onPress={props.onPress}
      class="flex-1 rounded-xl border border-line bg-raised px-4 py-3.5 transition hover:border-amber/40 active:scale-[0.99] active:bg-accent"
    >
      <View class="w-full gap-1">
        <View class="flex-row items-center justify-between">
          <View class="flex-row items-center gap-2">
            <View class={`h-2.5 w-2.5 rounded-full ${props.dotClass}`} />
            <Text class={`text-base font-bold ${props.toneClass}`}>
              {props.label}
            </Text>
          </View>
          <View class="flex-row items-center gap-1.5">
            <Text class="font-mono text-xs tabular-nums text-faint">
              {props.count()}
            </Text>
            <View class="rounded-md border border-line bg-panel px-2 py-0.5">
              <Text class="font-mono text-xs font-bold text-muted-foreground">
                {props.shortcut}
              </Text>
            </View>
          </View>
        </View>
        <Text class="text-xs text-muted-foreground">{props.hint}</Text>
      </View>
    </Button>
  );
}

type Props = {
  lesson: LoadedLesson;
  /** Shared with Loop Dojo (Lag / Blind feed the dojo queue). */
  tags: Record<number, BlindTag>;
  onTagsChange: (tags: Record<number, BlindTag>) => void;
  onOpenDojo?: () => void;
};

/**
 * Blind Flow: Cinema listening stage + synchronized Transcript inspector.
 * Play one sentence with blurred/masked captions; tag Pass / Lag / Blind.
 * Reveal clears the mask for the current sentence (Lag path).
 */
export function BlindFlow(props: Props) {
  const session = signal<BlindFlowSession>({
    ...createBlindFlowSession(),
    tags: { ...props.tags },
  });
  const playing = signal(false);
  const rate = signal<PlaybackRate>(1);
  const clipEndMs = signal<number | null>(null);
  let video: { seek(seconds: number): void } | null = null;

  const sentences = props.lesson.sentences;
  const audioUrl = props.lesson.video.audioUrl;

  const playSentence = (s: Sentence) => {
    if (!audioUrl || !video) {
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
    const next = applyTag(session(), tag, sentences.length);
    session.set(next);
    props.onTagsChange(next.tags);
  };

  const onRestart = () => {
    stopPlayback();
    session.set(restartBlindFlow());
    props.onTagsChange({});
  };

  const jumpTo = (idx: number) => {
    if (sentences.length === 0) return;
    stopPlayback();
    const clamped = Math.max(0, Math.min(sentences.length - 1, idx));
    session.set({
      ...session(),
      index: clamped,
      revealed: false,
    });
  };

  const toggleReveal = () => {
    const cur = session();
    session.set(cur.revealed ? hideCaption(cur) : revealCaption(cur));
  };

  const done = () => isComplete(session(), sentences.length);
  const sentence = () => currentSentence(sentences, session());
  const activeSentence = (): Sentence | null => (done() ? null : sentence());
  const counts = () => countTags(session().tags);
  const progressLabel = () => {
    if (sentences.length === 0) return "0 / 0";
    const n = Object.keys(session().tags).length;
    return `${Math.min(n + (done() ? 0 : 1), sentences.length)} / ${sentences.length}`;
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
      left: () => jumpTo(session().index - 1),
      right: () => jumpTo(session().index + 1),
    },
    { when: "notEditing" },
  );

  return (
    <View class="gap-3.5 md:flex-row md:items-start">
      <If when={audioUrl}>
        <Video
          ref={(node) => {
            video = node;
          }}
          src={audioUrl!}
          paused={!playing()}
          rate={rate()}
          volume={1}
          audioSession="playback"
          controls={false}
          progressUpdateInterval={100}
          style={{ width: 1, height: 1, opacity: 0 }}
          onProgress={(e) => {
            const end = clipEndMs();
            if (end == null || !playing()) return;
            if (clipEnded(e.currentTime, end)) stopPlayback();
          }}
          onEnd={() => stopPlayback()}
          onError={() => stopPlayback()}
        />
      </If>

      {/* Left 2fr: Vimpo Cinema Listening Stage */}
      <View class="min-w-0 flex-1 gap-3 rounded-2xl border border-line bg-panel p-4 md:flex-[2]">
        {/* Stage Header Bar */}
        <View class="flex-row flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <View class="flex-row items-center gap-2.5">
            <View class="h-7 w-7 items-center justify-center rounded-lg bg-amber/15">
              <Icon name="headphones" size={14} tone="amber" />
            </View>
            <View class="gap-0.5">
              <View class="flex-row items-center gap-2">
                <Text class="text-base font-semibold text-foreground">
                  Blind Flow
                </Text>
                <View class="rounded-full border border-line bg-raised px-2 py-0.5">
                  <Text class="font-mono text-[11px] tabular-nums text-amber">
                    {progressLabel()}
                  </Text>
                </View>
              </View>
              <Text class="text-xs text-muted-foreground">
                Captions start blurred. Pass = got it, Lag = after reveal, Blind
                = missed. {progressLabel()}
              </Text>
            </View>
          </View>

          {/* Session Tag Summary Pills */}
          <View class="flex-row items-center gap-1.5">
            <View class="flex-row items-center gap-1 rounded-full bg-ready-soft px-2.5 py-1">
              <View class="h-1.5 w-1.5 rounded-full bg-ready" />
              <Text class="font-mono text-[11px] font-medium tabular-nums text-ready">
                Pass {counts().pass}
              </Text>
            </View>
            <View class="flex-row items-center gap-1 rounded-full bg-amber-soft px-2.5 py-1">
              <View class="h-1.5 w-1.5 rounded-full bg-amber" />
              <Text class="font-mono text-[11px] font-medium tabular-nums text-amber">
                Lag {counts().lag}
              </Text>
            </View>
            <View class="flex-row items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1">
              <View class="h-1.5 w-1.5 rounded-full bg-danger" />
              <Text class="font-mono text-[11px] font-medium tabular-nums text-danger">
                Blind {counts().blind}
              </Text>
            </View>
          </View>
        </View>

        <If when={!audioUrl}>
          <View class="flex-row items-center justify-between rounded-xl border border-line bg-raised px-3 py-1.5">
            <View class="flex-row items-center gap-2">
              <Icon name="sparkles" size={13} tone="amber" />
              <Text class="text-xs text-muted-foreground">
                No audio URL from parse — tag captions only (play disabled).
              </Text>
            </View>
            <Text class="font-mono text-[10px] uppercase tracking-wider text-dim">
              Transcript Drill Mode
            </Text>
          </View>
        </If>

        {/* Round Complete Card */}
        <If when={done()}>
          <View class="gap-4 rounded-xl border border-line bg-well p-5">
            <View class="flex-row items-center justify-between">
              <View class="gap-1">
                <Text class="font-mono text-[11px] uppercase tracking-widest text-amber">
                  SESSION COMPLETE
                </Text>
                <Text class="text-xl font-bold text-foreground">
                  Round complete
                </Text>
                <Text class="text-sm text-muted-foreground">
                  Pass {counts().pass} · Lag {counts().lag} · Blind{" "}
                  {counts().blind}
                </Text>
              </View>
              <View class="h-11 w-11 items-center justify-center rounded-full bg-ready-soft">
                <Icon name="check" size={20} tone="ready" />
              </View>
            </View>

            <View class="flex-row flex-wrap gap-2">
              <If
                when={counts().lag + counts().blind > 0 && props.onOpenDojo}
              >
                <Button
                  onPress={() => props.onOpenDojo?.()}
                  class="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-amber px-4 py-3 active:opacity-90"
                >
                  <Icon name="repeat" size={14} tone="ink" />
                  <Text class="font-semibold text-ink">
                    Drill {counts().lag + counts().blind} in Loop Dojo
                  </Text>
                </Button>
              </If>
              <Button
                onPress={onRestart}
                class="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-line bg-raised px-4 py-3 active:bg-accent"
              >
                <Icon name="rotate" size={14} tone="paper" />
                <Text class="font-medium text-foreground">Restart</Text>
              </Button>
            </View>
          </View>
        </If>

        {/* Active Cinema Stage */}
        <If when={activeSentence()}>
          {(get) => (
            <View class="gap-3">
              {/* Cinema Theatre Screen */}
              <View class="gap-3.5 rounded-xl border border-line bg-well p-4">
                {/* Top metadata strip inside cinema screen */}
                <View class="flex-row flex-wrap items-center justify-between gap-2">
                  <View class="flex-row items-center gap-2">
                    <View class="rounded-md border border-line bg-raised px-2 py-0.5">
                      <Text class="font-mono text-xs font-semibold tabular-nums text-amber">
                        #{get().index + 1}
                      </Text>
                    </View>
                    <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                      #{get().index + 1} · {formatMs(get().startMs)}–
                      {formatMs(get().endMs)} · {get().wpm} wpm ·{" "}
                      {get().difficulty}
                    </Text>
                  </View>

                  <View class="flex-row items-center gap-1.5">
                    <View
                      class={`rounded-full border px-2.5 py-0.5 ${difficultyStyle(get().difficulty)}`}
                    >
                      <Text class="font-mono text-[11px] font-semibold">
                        {get().difficulty} · {get().wpm} WPM
                      </Text>
                    </View>
                    <View
                      class={`rounded-full border px-2.5 py-0.5 ${
                        session().revealed
                          ? "border-amber/40 bg-amber-soft"
                          : "border-line bg-raised"
                      }`}
                    >
                      <Text
                        class={`font-mono text-[10px] font-semibold uppercase tracking-wider ${
                          session().revealed ? "text-amber" : "text-faint"
                        }`}
                      >
                        {session().revealed ? "REVEALED" : "BLIND MASK"}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Center Subtitle Focal Area */}
                <View class="min-h-[104px] items-center justify-center rounded-xl border border-line/70 bg-panel/60 px-5 py-5">
                  <Text class="text-center text-xl font-medium leading-relaxed text-foreground md:text-2xl">
                    {session().revealed
                      ? get().text
                      : maskCaption(get().text)}
                  </Text>
                  <View class="mt-2.5 flex-row items-center gap-2">
                    <Text class="font-mono text-[11px] text-faint">
                      {get().wordCount} words · window{" "}
                      {((get().endMs - get().startMs) / 1000).toFixed(1)}s
                    </Text>
                    <If when={session().tags[get().index]}>
                      <Text class="font-mono text-[11px] text-amber">
                        · tagged {session().tags[get().index]}
                      </Text>
                    </If>
                  </View>
                </View>

                {/* Vimpo Cinema Highlight Scrubber / Sentence Timeline */}
                <View class="gap-1.5">
                  <View class="flex-row items-center justify-between">
                    <Text class="font-mono text-[11px] tabular-nums text-faint">
                      {formatMs(get().startMs)}
                    </Text>
                    <Text class="font-mono text-[10px] uppercase tracking-wider text-dim">
                      Sentence Timeline · Click segment to jump
                    </Text>
                    <Text class="font-mono text-[11px] tabular-nums text-faint">
                      {formatMs(get().endMs)}
                    </Text>
                  </View>
                  <View class="flex-row items-center gap-1">
                    <Each of={sentences} key="index">
                      {(item) => (
                        <Button
                          onPress={() => jumpTo(item().index)}
                          class={`flex-1 rounded-full ${
                            item().index === session().index
                              ? "h-2.5"
                              : "h-1.5 opacity-80"
                          } ${
                            session().tags[item().index] === "pass"
                              ? "bg-ready"
                              : session().tags[item().index] === "lag"
                                ? "bg-amber"
                                : session().tags[item().index] === "blind"
                                  ? "bg-danger"
                                  : item().index === session().index
                                    ? "bg-paper"
                                    : "bg-line"
                          }`}
                          accessibilityLabel={`Jump to sentence ${item().index + 1}`}
                        />
                      )}
                    </Each>
                  </View>
                </View>
              </View>

              {/* Transport Controls Row */}
              <View class="flex-row flex-wrap items-center gap-2.5">
                <Button
                  onPress={() => jumpTo(session().index - 1)}
                  class="flex-row items-center gap-1.5 rounded-xl border border-line bg-raised px-4 py-3 active:bg-accent"
                >
                  <Icon name="chevron-left" size={15} tone="paper" />
                  <Text class="text-sm font-semibold text-foreground">Prev</Text>
                </Button>

                <Button
                  onPress={() =>
                    playing() ? stopPlayback() : playSentence(get())
                  }
                  class="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 active:opacity-90"
                >
                  <Icon
                    name={playing() ? "pause" : "play"}
                    size={16}
                    tone="primary-foreground"
                  />
                  <Text class="text-base font-bold text-primary-foreground">
                    {playing() ? "Playing..." : audioUrl ? "Play" : "No audio"}
                  </Text>
                </Button>

                <Button
                  onPress={toggleReveal}
                  class="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-line bg-raised px-5 py-3.5 active:bg-accent"
                >
                  <Icon
                    name={session().revealed ? "eye-off" : "eye"}
                    size={16}
                    tone="paper"
                  />
                  <Text class="text-base font-semibold text-foreground">
                    {session().revealed ? "Hide" : "Reveal"}
                  </Text>
                </Button>

                <Button
                  onPress={() => rate.set(nextRate(rate()))}
                  class="rounded-xl border border-line bg-raised px-4 py-3 active:bg-accent"
                >
                  <Text class="font-mono text-sm font-bold tabular-nums text-foreground">
                    {rate()}×
                  </Text>
                </Button>

                <Button
                  onPress={() => jumpTo(session().index + 1)}
                  class="flex-row items-center gap-1.5 rounded-xl border border-line bg-raised px-4 py-3 active:bg-accent"
                >
                  <Text class="text-sm font-semibold text-foreground">Next</Text>
                  <Icon name="chevron-right" size={15} tone="paper" />
                </Button>
              </View>

              {/* Comprehension Tagging Deck */}
              <View class="flex-row gap-2.5">
                <TagButton
                  label="Pass"
                  hint="got it"
                  shortcut="1"
                  count={() => counts().pass}
                  toneClass="text-ready"
                  dotClass="bg-ready"
                  onPress={() => onTag("pass")}
                />
                <TagButton
                  label="Lag"
                  hint="after reveal"
                  shortcut="2"
                  count={() => counts().lag}
                  toneClass="text-amber"
                  dotClass="bg-amber"
                  onPress={() => onTag("lag")}
                />
                <TagButton
                  label="Blind"
                  hint="missed"
                  shortcut="3"
                  count={() => counts().blind}
                  toneClass="text-danger"
                  dotClass="bg-danger"
                  onPress={() => onTag("blind")}
                />
              </View>
            </View>
          )}
        </If>

        <If when={sentences.length === 0}>
          <Text class="text-sm text-muted-foreground">
            No sentences to practice.
          </Text>
        </If>
      </View>

      {/* Right 1fr: Synchronized Transcript Inspector (Vimpo Cinema style) */}
      <View class="w-full gap-2.5 rounded-2xl border border-line bg-panel p-3.5 md:w-[310px] md:shrink-0">
        <View class="flex-row items-center justify-between border-b border-line pb-2.5">
          <View class="flex-row items-center gap-2">
            <Icon name="list" size={14} tone="amber" />
            <Text class="text-xs font-semibold uppercase tracking-wider text-foreground">
              Transcript Queue
            </Text>
          </View>
          <Text class="font-mono text-[11px] tabular-nums text-muted-foreground">
            {sentences.length} lines
          </Text>
        </View>

        <Scroll class="max-h-[410px]">
          <View class="gap-1.5">
            <Each of={sentences} key="index">
              {(item) => (
                <Button
                  onPress={() => jumpTo(item().index)}
                  class={`rounded-xl border px-3 py-2.5 transition ${
                    item().index === session().index && !done()
                      ? "border-amber/60 bg-amber/10"
                      : "border-line/60 bg-raised hover:border-line"
                  }`}
                >
                  <View class="w-full gap-1">
                    <View class="flex-row items-center justify-between">
                      <View class="flex-row items-center gap-1.5">
                        <Text class="font-mono text-[11px] font-semibold tabular-nums text-amber">
                          #{item().index + 1}
                        </Text>
                        <Text class="font-mono text-[11px] tabular-nums text-faint">
                          {formatMs(item().startMs)}
                        </Text>
                        <Text class="font-mono text-[10px] text-dim">
                          · {item().wpm}wpm
                        </Text>
                      </View>
                      <View
                        class={`rounded-md px-1.5 py-0.5 ${
                          tagBadgeStyle(session().tags[item().index]).bg
                        }`}
                      >
                        <Text
                          class={`font-mono text-[10px] font-semibold ${
                            tagBadgeStyle(session().tags[item().index]).text
                          }`}
                        >
                          {tagBadgeStyle(session().tags[item().index]).label}
                        </Text>
                      </View>
                    </View>
                    <Text
                      class={`text-xs leading-snug ${
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
                </Button>
              )}
            </Each>
          </View>
        </Scroll>
      </View>
    </View>
  );
}
