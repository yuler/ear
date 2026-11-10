import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { LibraryEntry } from "../library/types";
import { countTags, type BlindTag } from "./blindFlow";
import type { ChromeScreen } from "../ui/chrome";

export function LibraryView(props: {
  savedEntries: () => LibraryEntry[];
  activeVideoId: () => string | null;
  allVideoTags: () => Record<string, Record<number, BlindTag>>;
  onOpenSaved: (entry: LibraryEntry, mode: ChromeScreen) => void;
}) {
  const taggedCount = (videoId: string) => {
    const c = countTags(props.allVideoTags()[videoId] ?? {});
    return c.pass + c.lag + c.blind;
  };

  return (
    <View class="gap-4">
      <If when={props.savedEntries().length > 0}>
        <View>
          <Text class="pb-1.5 font-mono text-[11px] uppercase tracking-wider text-dim">
            Downloaded ({props.savedEntries().length})
          </Text>
          <Each of={props.savedEntries()} key={(entry) => entry.videoId}>
            {(entry) => (
              <View
                class={`flex-row items-center gap-4 border-b border-line py-3 ${
                  props.activeVideoId() === entry().videoId
                    ? "border-l-2 border-l-foreground pl-3"
                    : ""
                }`}
              >
                <Button
                  onPress={() => props.onOpenSaved(entry(), "blind")}
                  class="min-w-0 flex-1 items-start gap-0.5"
                >
                  <Text
                    class={`line-clamp-1 text-sm text-foreground ${
                      props.activeVideoId() === entry().videoId
                        ? "font-semibold"
                        : "font-medium"
                    }`}
                  >
                    {entry().title}
                  </Text>
                  <Text class="font-mono text-xs text-muted-foreground">
                    YouTube · {entry().videoId}
                    {entry().videoPath ? " · video" : ""}
                    {entry().audioPath && !entry().videoPath ? " · audio" : ""}
                    {taggedCount(entry().videoId) > 0
                      ? ` · ${taggedCount(entry().videoId)} tagged`
                      : ""}
                  </Text>
                </Button>

                <View class="shrink-0 flex-row items-center gap-2">
                  <Button
                    onPress={() => props.onOpenSaved(entry(), "blind")}
                    class="rounded px-2 py-1 active:bg-accent"
                  >
                    <Text class="text-xs font-medium text-foreground">
                      Blind
                    </Text>
                  </Button>
                  <Text class="text-xs text-dim">·</Text>
                  <Button
                    onPress={() => props.onOpenSaved(entry(), "loop")}
                    class="rounded px-2 py-1 active:bg-accent"
                  >
                    <Text class="text-xs text-muted-foreground">Dojo</Text>
                  </Button>
                </View>
              </View>
            )}
          </Each>
        </View>
      </If>

      <If when={props.savedEntries().length === 0}>
        <Text class="py-8 text-center text-sm text-muted-foreground">
          Paste a YouTube link above to download video, audio, and subtitles.
        </Text>
      </If>
    </View>
  );
}
