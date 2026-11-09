import { mount, signal, Text, View, Scroll } from "nsh";
import { Input, Button } from "nsh/base";
import { loadLesson } from "./youtube/parse";
import type { LoadedLesson, Sentence } from "./youtube/types";
import { BlindFlow } from "./modes/BlindFlow";
import type { BlindTag } from "./modes/blindFlow";
import { LoopDojo } from "./modes/LoopDojo";
import { ChromeHint } from "./ui/chrome";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function SentenceRow(props: { sentence: Sentence }) {
  const s = props.sentence;
  return (
    <View class="gap-1 rounded-lg border border-border bg-card p-3">
      <Text class="text-xs text-muted-foreground">
        #{s.index + 1} · {formatMs(s.startMs)}–{formatMs(s.endMs)} · {s.wpm}{" "}
        wpm · {s.difficulty}
      </Text>
      <Text class="text-base text-foreground">{s.text}</Text>
    </View>
  );
}

type Screen = "home" | "blind" | "loop" | "list";

function App() {
  const url = signal("");
  const loading = signal(false);
  const error = signal<string | null>(null);
  const lesson = signal<LoadedLesson | null>(null);
  const screen = signal<Screen>("home");
  const tags = signal<Record<number, BlindTag>>({});

  const onLoad = async () => {
    const value = url().trim();
    if (!value || loading()) return;
    loading.set(true);
    error.set(null);
    try {
      const loaded = await loadLesson(value);
      lesson.set(loaded);
      tags.set({});
      if (!loaded.track) {
        error.set("Parsed video, but no caption tracks found");
        screen.set("home");
      } else if (loaded.sentences.length === 0) {
        error.set("Captions loaded, but no sentences after merge");
        screen.set("home");
      } else {
        screen.set("blind");
      }
    } catch (e) {
      lesson.set(null);
      tags.set({});
      screen.set("home");
      error.set(e instanceof Error ? e.message : String(e));
    } finally {
      loading.set(false);
    }
  };

  const tabLesson = (): LoadedLesson | null => {
    const L = lesson();
    if (!L || screen() === "home") return null;
    return L;
  };

  const blindLesson = (): LoadedLesson | null =>
    screen() === "blind" ? lesson() : null;

  const loopLesson = (): LoadedLesson | null =>
    screen() === "loop" ? lesson() : null;

  const listLesson = (): LoadedLesson | null =>
    screen() === "list" ? lesson() : null;

  return (
    <View class="flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Scroll class="flex-1">
        <View class="gap-4 p-4">
          <Text class="text-2xl font-semibold text-foreground">Ear</Text>
          <Text class="text-sm text-muted-foreground">
            Blind Flow · Loop Dojo · sentence list
          </Text>

          <View class="gap-2">
            <Input
              value={url()}
              onChange={(e) => url.set(e.value)}
              placeholder="YouTube URL or video id"
              class="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            />
            <Button
              onPress={onLoad}
              class="items-center rounded-lg bg-primary px-4 py-3 active:bg-primary/90"
            >
              <Text class="text-primary-foreground">
                {loading() ? "Loading…" : "Parse"}
              </Text>
            </Button>
          </View>

          <If when={error()}>
            <Text class="text-sm text-destructive">{error()}</Text>
          </If>

          <If when={tabLesson()}>
            <View class="flex-row gap-2">
              <Button
                onPress={() => screen.set("blind")}
                class={`flex-1 items-center rounded-lg px-3 py-2 ${
                  screen() === "blind"
                    ? "bg-primary"
                    : "border border-border bg-card"
                }`}
              >
                <Text
                  class={
                    screen() === "blind"
                      ? "text-primary-foreground"
                      : "text-foreground"
                  }
                >
                  Blind Flow
                </Text>
              </Button>
              <Button
                onPress={() => screen.set("loop")}
                class={`flex-1 items-center rounded-lg px-3 py-2 ${
                  screen() === "loop"
                    ? "bg-primary"
                    : "border border-border bg-card"
                }`}
              >
                <Text
                  class={
                    screen() === "loop"
                      ? "text-primary-foreground"
                      : "text-foreground"
                  }
                >
                  Loop Dojo
                </Text>
              </Button>
              <Button
                onPress={() => screen.set("list")}
                class={`flex-1 items-center rounded-lg px-3 py-2 ${
                  screen() === "list"
                    ? "bg-primary"
                    : "border border-border bg-card"
                }`}
              >
                <Text
                  class={
                    screen() === "list"
                      ? "text-primary-foreground"
                      : "text-foreground"
                  }
                >
                  Sentences
                </Text>
              </Button>
            </View>
          </If>

          <If when={blindLesson()}>
            {(get) => (
              <BlindFlow
                lesson={get()}
                tags={tags()}
                onTagsChange={(t) => tags.set(t)}
              />
            )}
          </If>

          <If when={loopLesson()}>
            {(get) => <LoopDojo lesson={get()} tags={tags()} />}
          </If>

          <If when={listLesson()}>
            {(get) => (
              <View class="gap-2">
                <Text class="text-lg font-medium text-foreground">
                  {get().video.title}
                </Text>
                <Text class="text-xs text-muted-foreground">
                  id {get().video.videoId}
                  {get().video.audioMimeType
                    ? ` · ${get().video.audioMimeType}`
                    : " · no audio url"}
                  {get().track
                    ? ` · captions ${get().track!.languageCode}`
                    : ""}
                  {` · ${get().sentences.length} sentences`}
                </Text>
                <Each of={get().sentences} key="index">
                  {(item) => <SentenceRow sentence={item()} />}
                </Each>
              </View>
            )}
          </If>

        </View>
      </Scroll>
      <ChromeHint />
    </View>
  );
}

mount(App);
