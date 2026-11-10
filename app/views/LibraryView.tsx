import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { DownloadTaskProgress, LibraryEntry } from "../library/types";
import type { LibraryLayoutMode } from "../store";
import { ActiveDownloadRow } from "../ui/ActiveDownloadRow";
import { Icon } from "../ui/Icon";
import { settings, updateSettings } from "../ui/settings";
import {
  LibraryGradeCard,
  LibraryListRow,
  LibraryPostCard,
} from "./LibraryCards";
import { formatEntryDescription, isAudioEntry } from "./libraryView";

export { formatEntryDescription, isAudioEntry };

/**
 * Library view:
 * Displays active downloads at the very front as horizontal bars (横条),
 * followed by saved videos/audio in List, Grade, or Post layout modes.
 */
export function LibraryView(props: {
  activeTab: () => "video" | "audio";
  savedEntries: () => LibraryEntry[];
  activeDownloads?: () => DownloadTaskProgress[];
  onOpenEntry: (entry: LibraryEntry) => void;
  onOpenFolder: (entry: LibraryEntry) => void;
  onDeleteEntry?: (entry: LibraryEntry) => void;
}) {
  const currentEntries = () => {
    const isAudio = props.activeTab() === "audio";
    return props.savedEntries().filter((e) =>
      isAudio ? isAudioEntry(e) : !isAudioEntry(e),
    );
  };

  const currentDownloads = (): DownloadTaskProgress[] => {
    const all = props.activeDownloads?.() ?? [];
    const isAudio = props.activeTab() === "audio";
    return all.filter((d) => {
      const isAud =
        d.qualityLabel.toLowerCase().includes("audio") ||
        d.qualityLabel.toLowerCase().includes("m4a");
      return isAudio ? isAud : !isAud;
    });
  };

  const layoutMode = () => settings().libraryLayout ?? "post";
  const setLayoutMode = (mode: LibraryLayoutMode) => {
    updateSettings({ libraryLayout: mode });
  };

  const totalVisibleCount = () =>
    currentEntries().length + currentDownloads().length;

  return (
    <View class="gap-4">
      <If when={totalVisibleCount() > 0}>
        <View class="gap-3">
          {/* Section header + List / Grade / Post mode toggle */}
          <View class="flex-row items-center justify-between border-b border-line pb-1">
            <View class="flex-row items-center gap-2">
              <Text class="font-mono text-[11px] uppercase tracking-wider text-dim">
                {props.activeTab() === "video" ? "Videos" : "Audio"} (
                {totalVisibleCount()})
              </Text>
              <If when={currentDownloads().length > 0}>
                <View class="flex-row items-center gap-1 rounded-full bg-[#2f7cf6]/15 px-2 py-0.5">
                  <Icon
                    name="loader"
                    size={10}
                    color="#2f7cf6"
                    class="animate-spin"
                  />
                  <Text class="font-mono text-[10px] font-semibold text-[#2f7cf6]">
                    {currentDownloads().length} downloading
                  </Text>
                </View>
              </If>
            </View>

            <View class="flex-row items-center rounded-lg border border-line bg-well/40 p-0.5">
              <Button
                onPress={() => setLayoutMode("list")}
                class={`rounded-md px-2.5 py-1 ${
                  layoutMode() === "list"
                    ? "bg-primary shadow-sm"
                    : "bg-transparent active:bg-accent"
                }`}
                accessibilityLabel="List view mode"
              >
                <Text
                  class={`text-xs ${
                    layoutMode() === "list"
                      ? "font-semibold text-primary-foreground"
                      : "font-medium text-muted-foreground"
                  }`}
                >
                  List
                </Text>
              </Button>

              <Button
                onPress={() => setLayoutMode("grade")}
                class={`rounded-md px-2.5 py-1 ${
                  layoutMode() === "grade"
                    ? "bg-primary shadow-sm"
                    : "bg-transparent active:bg-accent"
                }`}
                accessibilityLabel="Grade view mode (Windows picture grid)"
              >
                <Text
                  class={`text-xs ${
                    layoutMode() === "grade"
                      ? "font-semibold text-primary-foreground"
                      : "font-medium text-muted-foreground"
                  }`}
                >
                  Grade
                </Text>
              </Button>

              <Button
                onPress={() => setLayoutMode("post")}
                class={`rounded-md px-2.5 py-1 ${
                  layoutMode() === "post"
                    ? "bg-primary shadow-sm"
                    : "bg-transparent active:bg-accent"
                }`}
                accessibilityLabel="Post view mode (Large poster cards)"
              >
                <Text
                  class={`text-xs ${
                    layoutMode() === "post"
                      ? "font-semibold text-primary-foreground"
                      : "font-medium text-muted-foreground"
                  }`}
                >
                  Post
                </Text>
              </Button>
            </View>
          </View>

          {/* 1. Active Downloads: Always placed at the very front as horizontal bars (横条) */}
          <If when={currentDownloads().length > 0}>
            <View class="gap-2.5">
              <Each of={currentDownloads()} key={(t) => t.videoId}>
                {(getTask) => <ActiveDownloadRow task={getTask} />}
              </Each>
            </View>
          </If>

          {/* 2. Finished library entries in selected layout mode */}
          <If when={currentEntries().length > 0}>
            <View>
              {/* List Mode: Classic horizontal rows */}
              <If when={layoutMode() === "list"}>
                <View class="gap-1">
                  <Each of={currentEntries()} key={(entry) => entry.videoId}>
                    {(entry) => (
                      <LibraryListRow
                        entry={entry()}
                        onOpenEntry={props.onOpenEntry}
                        onOpenFolder={props.onOpenFolder}
                        onDeleteEntry={props.onDeleteEntry}
                      />
                    )}
                  </Each>
                </View>
              </If>

              {/* Grade Mode: Windows picture-style tiles */}
              <If when={layoutMode() === "grade"}>
                <View class="flex-row flex-wrap gap-3.5 pt-1">
                  <Each of={currentEntries()} key={(entry) => entry.videoId}>
                    {(entry) => (
                      <LibraryGradeCard
                        entry={entry()}
                        onOpenEntry={props.onOpenEntry}
                        onOpenFolder={props.onOpenFolder}
                        onDeleteEntry={props.onDeleteEntry}
                      />
                    )}
                  </Each>
                </View>
              </If>

              {/* Post Mode: Large poster cards */}
              <If when={layoutMode() === "post"}>
                <View class="flex-row flex-wrap gap-5 pt-1">
                  <Each of={currentEntries()} key={(entry) => entry.videoId}>
                    {(entry) => (
                      <LibraryPostCard
                        entry={entry()}
                        onOpenEntry={props.onOpenEntry}
                        onOpenFolder={props.onOpenFolder}
                        onDeleteEntry={props.onDeleteEntry}
                      />
                    )}
                  </Each>
                </View>
              </If>
            </View>
          </If>
        </View>
      </If>

      {/* Empty State */}
      <If when={totalVisibleCount() === 0}>
        <View class="items-center justify-center gap-2 py-12">
          <Icon name="download" size={24} tone="muted-foreground" />
          <Text class="text-center text-sm text-muted-foreground">
            {props.activeTab() === "video"
              ? "暂无下载视频。在上方粘贴 YouTube 链接即可开始下载。"
              : "暂无下载音频。解析链接后选择 Audio 格式下载。"}
          </Text>
        </View>
      </If>
    </View>
  );
}
