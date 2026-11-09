import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { SampleLessonMeta } from "../library/samples";
import type { LibraryEntry } from "../library/types";
import { countTags, type BlindTag } from "../modes/blindFlow";
import type { ChromeScreen } from "./chrome";
import { Icon } from "./Icon";

export type LibraryFilter =
  | "all"
  | "AI & Tech"
  | "Startups"
  | "Short Film"
  | "saved";

export function LibraryGrid(props: {
  filter: () => LibraryFilter;
  onFilterChange: (f: LibraryFilter) => void;
  samples: () => SampleLessonMeta[];
  savedEntries: () => LibraryEntry[];
  activeVideoId: () => string | null;
  allVideoTags: () => Record<string, Record<number, BlindTag>>;
  onOpenSample: (sample: SampleLessonMeta, mode: ChromeScreen) => void;
  onDownloadSample: (sample: SampleLessonMeta) => void;
  onOpenSaved: (entry: LibraryEntry, mode: ChromeScreen) => void;
  onPreviewClipboardDemo: () => void;
  hasClipboardPreview: () => boolean;
}) {
  const sampleTaggedCount = (videoId: string) => {
    const c = countTags(props.allVideoTags()[videoId] ?? {});
    return c.pass + c.lag + c.blind;
  };

  return (
    <View class="gap-4">
      {/* Clean Downbit Header Row: Filter Pills on Left, Folder Info on Right */}
      <View class="flex-row flex-wrap items-center justify-between gap-3">
        <View class="flex-row flex-wrap items-center gap-1.5">
          {(
            [
              { key: "all" as const, label: "All Videos" },
              { key: "AI & Tech" as const, label: "AI & English" },
              { key: "Startups" as const, label: "Startups" },
              { key: "Short Film" as const, label: "Short Film" },
              {
                key: "saved" as const,
                label: `Downloaded (${props.savedEntries().length})`,
              },
            ] as const
          ).map((tab) => (
            <Button
              onPress={() => props.onFilterChange(tab.key)}
              class={`rounded-xl px-4 py-2 transition ${
                props.filter() === tab.key
                  ? "bg-amber"
                  : "border border-line bg-panel hover:bg-raised"
              }`}
            >
              <Text
                class={`text-xs font-semibold ${
                  props.filter() === tab.key
                    ? "text-ink"
                    : "text-muted-foreground"
                }`}
              >
                {tab.label}
              </Text>
            </Button>
          ))}
        </View>

        {/* Right: Downbit-style Folder Status + Demo Clipboard Trigger */}
        <View class="flex-row items-center gap-2.5">
          <If when={!props.hasClipboardPreview()}>
            <Button
              onPress={props.onPreviewClipboardDemo}
              class="flex-row items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2 active:bg-accent"
            >
              <Icon name="clipboard" size={13} tone="amber" />
              <Text class="text-xs font-medium text-muted-foreground">
                Show Clipboard Prompt
              </Text>
            </Button>
          </If>

          <View class="flex-row items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2">
            <Icon name="folder" size={13} tone="muted-foreground" />
            <Text class="font-mono text-xs text-muted-foreground">
              Downloads · {props.samples().length + props.savedEntries().length}{" "}
              ready
            </Text>
          </View>
        </View>
      </View>

      {/* Saved Local Downloads Section (when present) */}
      <If
        when={
          props.savedEntries().length > 0 &&
          (props.filter() === "all" || props.filter() === "saved")
        }
      >
        <View class="gap-2.5">
          <Text class="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Downloaded Locally ({props.savedEntries().length})
          </Text>
          <View class="gap-3.5 md:flex-row md:flex-wrap">
            <Each of={props.savedEntries()} key={(entry) => entry.videoId}>
              {(entry) => (
                <View class="w-full gap-2.5 rounded-2xl border border-line bg-panel p-3.5 md:w-[48.5%] lg:w-[32%]">
                  <View class="flex-row items-center justify-between">
                    <View class="flex-row items-center gap-2">
                      <Icon name="hard-drive" size={14} tone="ready" />
                      <Text class="font-mono text-xs font-bold text-ready">
                        LOCAL M4A + CC
                      </Text>
                    </View>
                    <Text class="font-mono text-xs text-faint">
                      {entry().videoId}
                    </Text>
                  </View>
                  <Text class="line-clamp-1 text-base font-bold text-foreground">
                    {entry().title}
                  </Text>
                  <View class="flex-row items-center gap-2 pt-1">
                    <Button
                      onPress={() => props.onOpenSaved(entry(), "blind")}
                      class="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 active:opacity-90"
                    >
                      <Icon
                        name="headphones"
                        size={14}
                        tone="primary-foreground"
                      />
                      <Text class="text-sm font-bold text-primary-foreground">
                        Practice
                      </Text>
                    </Button>
                    <Button
                      onPress={() => props.onOpenSaved(entry(), "loop")}
                      class="rounded-xl border border-line bg-raised px-4 py-2.5 active:bg-accent"
                    >
                      <Text class="text-sm font-semibold text-foreground">
                        Dojo
                      </Text>
                    </Button>
                  </View>
                </View>
              )}
            </Each>
          </View>
        </View>
      </If>

      {/* Downbit-Style Media Grid (Clean 16:9 Thumbnails + Metadata + Large Buttons) */}
      <If when={props.filter() !== "saved"}>
        <View class="gap-4 md:flex-row md:flex-wrap">
          <Each of={props.samples()} key={(item) => item.videoId}>
            {(item) => (
              <View class="w-full gap-3 rounded-2xl border border-line bg-panel p-3.5 transition hover:border-amber/40 md:w-[48.5%] lg:w-[32%]">
                {/* 16:9 Thumbnail Card (Downbit style) */}
                <Button
                  onPress={() => props.onOpenSample(item(), "blind")}
                  class={`h-[156px] w-full justify-between overflow-hidden rounded-xl border border-line p-3.5 ${item().accentBg}`}
                >
                  {/* Top Row: Badge + Active status */}
                  <View class="flex-row items-center justify-between">
                    <View class="rounded-md bg-ground/75 px-2.5 py-1">
                      <Text
                        class={`font-mono text-[10px] font-bold uppercase tracking-wider ${item().accentText}`}
                      >
                        {item().badgeText}
                      </Text>
                    </View>
                    <If when={props.activeVideoId() === item().videoId}>
                      <View class="rounded-full bg-amber px-2.5 py-0.5">
                        <Text class="font-mono text-[10px] font-bold text-ink">
                          ACTIVE
                        </Text>
                      </View>
                    </If>
                  </View>

                  {/* Center Play Button */}
                  <View class="items-center justify-center">
                    <View class="h-11 w-11 items-center justify-center rounded-full bg-ground/80">
                      <Icon name="play" size={18} tone="paper" />
                    </View>
                  </View>

                  {/* Bottom Row: Speaker + Duration Pill */}
                  <View class="flex-row items-center justify-between">
                    <Text class="font-mono text-xs font-medium text-paper">
                      {item().speaker}
                    </Text>
                    <View class="rounded-md bg-ground/90 px-2.5 py-1">
                      <Text class="font-mono text-xs font-bold tabular-nums text-paper">
                        {item().durationLabel}
                      </Text>
                    </View>
                  </View>
                </Button>

                {/* Title & Downbit-style Subtitle Metadata */}
                <View class="gap-1 px-0.5">
                  <Text class="line-clamp-2 text-base font-bold leading-snug text-foreground">
                    {item().title}
                  </Text>
                  <Text class="text-xs text-muted-foreground">
                    YouTube · {item().channel} · M4A ·{" "}
                    {item().lesson.sentences.length} sentences
                    {sampleTaggedCount(item().videoId) > 0
                      ? ` · ${sampleTaggedCount(item().videoId)} tagged`
                      : ""}
                  </Text>
                </View>

                {/* Large Action Buttons (Requirement #1: 按钮可以设置得大一点) */}
                <View class="flex-row items-center gap-2 pt-0.5">
                  <Button
                    onPress={() => props.onOpenSample(item(), "blind")}
                    class="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 transition active:opacity-90"
                  >
                    <Icon
                      name="headphones"
                      size={15}
                      tone="primary-foreground"
                    />
                    <Text class="text-sm font-bold text-primary-foreground">
                      Blind Flow
                    </Text>
                  </Button>

                  <Button
                    onPress={() => props.onOpenSample(item(), "loop")}
                    class="flex-row items-center justify-center gap-1.5 rounded-xl border border-line bg-raised px-4 py-3 active:bg-accent"
                  >
                    <Icon name="repeat" size={14} tone="amber" />
                    <Text class="text-sm font-semibold text-foreground">
                      Dojo
                    </Text>
                  </Button>

                  <Button
                    onPress={() => props.onDownloadSample(item())}
                    class="h-11 w-11 items-center justify-center rounded-xl border border-line bg-raised active:bg-accent"
                    accessibilityLabel={`Download ${item().title}`}
                  >
                    <Icon name="download" size={15} tone="paper" />
                  </Button>
                </View>
              </View>
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}
