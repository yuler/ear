import { mount, signal, Text, View, Scroll } from "nsh";
import { Input, Button } from "nsh/base";
import { loadLesson } from "./youtube/parse";
import type { LoadedLesson, Sentence } from "./youtube/types";
import { BlindFlow } from "./modes/BlindFlow";
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

function App() {
  const url = signal("");
  const loading = signal(false);
  const error = signal<string | null>(null);
  const lesson = signal<LoadedLesson | null>(null);

  const onLoad = async () => {
    const value = url().trim();
    if (!value || loading()) return;
    loading.set(true);
    error.set(null);
    try {
      const loaded = await loadLesson(value);
      lesson.set(loaded);
      if (!loaded.track) {
        error.set("Parsed video, but no caption tracks found");
      } else if (loaded.sentences.length === 0) {
        error.set("Captions loaded, but no sentences after merge");
      }
    } catch (e) {
      lesson.set(null);
      error.set(e instanceof Error ? e.message : String(e));
    } finally {
      loading.set(false);
    }
  };

  return (
    <View class="flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Scroll class="flex-1">
        <View class="gap-4 p-4">
          <Text class="text-2xl font-semibold text-foreground">Ear</Text>
          <Text class="text-sm text-muted-foreground">
            Module 1 — hand-parse YouTube (no yt-dlp), json3 captions →
            sentences + WPM
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

          <If when={lesson()}>
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

          <View class="gap-2 pt-2">
            <BlindFlow />
            <LoopDojo />
          </View>
        </View>
      </Scroll>
      <ChromeHint />
    </View>
  );
}

mount(App);
