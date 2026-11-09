import { signal, Text, View, Video } from "nsh";
import { Button } from "nsh/base";
import type { LoadedLesson, Sentence } from "../youtube/types";
import { clipEnded, msToSeconds } from "../player/AudioEngine";
import {
  applyTag,
  countTags,
  createBlindFlowSession,
  currentSentence,
  hideCaption,
  isComplete,
  revealCaption,
  maskCaption,
  restartBlindFlow,
  type BlindFlowSession,
  type BlindTag,
} from "./blindFlow";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function TagButton(props: {
  label: string;
  hint: string;
  onPress: () => void;
  accent?: string;
}) {
  return (
    <Button
      onPress={props.onPress}
      class="flex-1 items-center rounded-lg border border-border bg-card px-2 py-3 active:bg-muted"
    >
      <Text class={`text-base font-medium ${props.accent ?? "text-foreground"}`}>
        {props.label}
      </Text>
      <Text class="text-xs text-muted-foreground">{props.hint}</Text>
    </Button>
  );
}

type Props = {
  lesson: LoadedLesson;
  /** Shared with Loop Dojo (Lag / Blind feed the dojo queue). */
  tags: Record<number, BlindTag>;
  onTagsChange: (tags: Record<number, BlindTag>) => void;
};

/**
 * Blind Flow: play one sentence with blurred captions; tag Pass / Lag / Blind.
 * Reveal clears the blur for the current sentence (Lag path).
 */
export function BlindFlow(props: Props) {
  const session = signal<BlindFlowSession>({
    ...createBlindFlowSession(),
    tags: { ...props.tags },
  });
  const playing = signal(false);
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

  const done = () => isComplete(session(), sentences.length);
  const sentence = () => currentSentence(sentences, session());
  const counts = () => countTags(session().tags);
  const progressLabel = () => {
    if (sentences.length === 0) return "0 / 0";
    const n = Object.keys(session().tags).length;
    return `${Math.min(n + (done() ? 0 : 1), sentences.length)} / ${sentences.length}`;
  };

  return (
    <View class="gap-3 rounded-xl border border-border bg-card p-4">
      <View class="gap-1">
        <Text class="text-lg font-semibold text-foreground">Blind Flow</Text>
        <Text class="text-xs text-muted-foreground">
          Captions start blurred. Pass = got it, Lag = after reveal, Blind =
          missed. {progressLabel()}
        </Text>
      </View>

      <If when={audioUrl}>
        <Video
          ref={(node) => {
            video = node;
          }}
          src={audioUrl!}
          paused={!playing()}
          rate={1}
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

      <If when={!audioUrl}>
        <Text class="text-xs text-destructive">
          No audio URL from parse — tag captions only (play disabled).
        </Text>
      </If>

      <If when={done()}>
        {() => {
          const c = counts();
          return (
            <View class="gap-3">
              <Text class="text-base text-foreground">Round complete</Text>
              <Text class="text-sm text-muted-foreground">
                Pass {c.pass} · Lag {c.lag} · Blind {c.blind}
              </Text>
              <Button
                onPress={onRestart}
                class="items-center rounded-lg bg-primary px-4 py-3 active:bg-primary/90"
              >
                <Text class="text-primary-foreground">Restart</Text>
              </Button>
            </View>
          );
        }}
      </If>

      <If when={!done() ? sentence() : null}>
        {(getSentence) => {
          const s = getSentence();
          const revealed = session().revealed;
          return (
            <View class="gap-3">
              <Text class="text-xs text-muted-foreground">
                #{s.index + 1} · {formatMs(s.startMs)}–{formatMs(s.endMs)} ·{" "}
                {s.wpm} wpm · {s.difficulty}
              </Text>

              <View class="min-h-[72px] justify-center rounded-lg border border-border bg-background p-3">
                <Text class="text-lg leading-relaxed text-foreground">
                  {revealed ? s.text : maskCaption(s.text)}
                </Text>
              </View>

              <View class="flex-row gap-2">
                <Button
                  onPress={() => playSentence(s)}
                  class="flex-1 items-center rounded-lg bg-primary px-3 py-3 active:bg-primary/90"
                >
                  <Text class="text-primary-foreground">
                    {playing() ? "Playing…" : audioUrl ? "Play" : "No audio"}
                  </Text>
                </Button>
                <Button
                  onPress={() =>
                    session.set(
                      revealed ? hideCaption(session()) : revealCaption(session()),
                    )
                  }
                  class="flex-1 items-center rounded-lg border border-border bg-background px-3 py-3 active:bg-muted"
                >
                  <Text class="text-foreground">
                    {revealed ? "Hide" : "Reveal"}
                  </Text>
                </Button>
              </View>

              <View class="flex-row gap-2">
                <TagButton
                  label="Pass"
                  hint="got it"
                  accent="text-green-600"
                  onPress={() => onTag("pass")}
                />
                <TagButton
                  label="Lag"
                  hint="after reveal"
                  accent="text-amber-600"
                  onPress={() => onTag("lag")}
                />
                <TagButton
                  label="Blind"
                  hint="missed"
                  accent="text-red-600"
                  onPress={() => onTag("blind")}
                />
              </View>
            </View>
          );
        }}
      </If>

      <If when={sentences.length === 0}>
        <Text class="text-sm text-muted-foreground">No sentences to practice.</Text>
      </If>
    </View>
  );
}
