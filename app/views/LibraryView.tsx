import { effect, LayoutAnimation, Text, View } from "nsh";
import type { DownloadTaskProgress, LibraryEntry } from "../library/types";
import { ActiveDownloadRow } from "../ui/ActiveDownloadRow";
import { Icon } from "../ui/Icon";
import { settings } from "../ui/settings";
import type { MediaTab } from "../ui/TopBar";
import {
  LibraryGradeCard,
  LibraryListRow,
  LibraryPostCard,
} from "./LibraryCards";
import { formatEntryDescription, isAudioEntry } from "./libraryViewHelpers";
import type { ViewTransitionRect } from "./viewTransition";

export { formatEntryDescription, isAudioEntry };

/**
 * Library view:
 * Displays active downloads at the very front as horizontal bars (横条),
 * followed by saved videos/audio in the standard responsive grid style.
 */
export function LibraryView(props: {
  activeTab: () => MediaTab;
  savedEntries: () => LibraryEntry[];
  activeDownloads?: () => DownloadTaskProgress[];
  onOpenEntry: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onOpenFolder: (entry: LibraryEntry) => void;
  onDeleteEntry?: (entry: LibraryEntry) => void;
  onPauseDownload?: (videoId: string) => void;
  onResumeDownload?: (videoId: string) => void;
  onCancelDownload?: (videoId: string) => void;
}) {
  const currentEntries = () => {
    const isAudio = props.activeTab() === "audio";
    return props.savedEntries().filter((e) =>
      e.state !== "downloading" &&
      e.state !== "paused" &&
      (isAudio ? isAudioEntry(e) : !isAudioEntry(e)),
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

  const totalVisibleCount = () =>
    currentEntries().length + currentDownloads().length;

  effect(() => {
    // When savedEntries or downloads change, trigger LayoutAnimation to smoothly animate position updates of grid cards
    const _entries = props.savedEntries();
    const _downloads = props.activeDownloads?.();
    try {
      LayoutAnimation.configureNext({
        duration: 380,
        create: {
          type: "spring",
          property: "scaleXY",
          springDamping: 0.78,
        },
        update: {
          type: "spring",
          springDamping: 0.78,
        },
        delete: {
          type: "easeOut",
          property: "opacity",
        },
      });
    } catch {
      // ignore on test host
    }
  });

  return (
    <View class="gap-4">
      <If when={totalVisibleCount() > 0}>
        <View class="gap-3">
          {/* Section header */}
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
          </View>

          {/* 1. Active Downloads: Always placed at the very front as horizontal bars (横条) */}
          <If when={currentDownloads().length > 0}>
            <View class="gap-2.5">
              <Each of={currentDownloads()} key={(t) => t.videoId}>
                {(getTask) => (
                  <ActiveDownloadRow
                    task={getTask}
                    onPause={props.onPauseDownload}
                    onResume={props.onResumeDownload}
                    onCancel={props.onCancelDownload}
                  />
                )}
              </Each>
            </View>
          </If>

          {/* 2. Finished library entries in standard responsive grid/grade style */}
          <If when={currentEntries().length > 0}>
            <View
              class={
                settings().libraryLayout === "grade"
                  ? "flex-row flex-wrap gap-3.5 pt-1"
                  : settings().libraryLayout === "list"
                    ? "flex-col gap-1 pt-1"
                    : "flex-row flex-wrap gap-5 pt-1"
              }
            >
              <Each of={currentEntries()} key={(entry) => entry.videoId}>
                {(entry) => {
                  const mode = () => settings().libraryLayout;
                  return (
                    <>
                      <If when={mode() === "grade"}>
                        <LibraryGradeCard
                          entry={entry()}
                          onOpenEntry={props.onOpenEntry}
                          onOpenFolder={props.onOpenFolder}
                          onDeleteEntry={props.onDeleteEntry}
                        />
                      </If>
                      <If when={mode() === "list"}>
                        <LibraryListRow
                          entry={entry()}
                          onOpenEntry={props.onOpenEntry}
                          onOpenFolder={props.onOpenFolder}
                          onDeleteEntry={props.onDeleteEntry}
                        />
                      </If>
                      <If when={mode() !== "grade" && mode() !== "list"}>
                        <LibraryPostCard
                          entry={entry()}
                          onOpenEntry={props.onOpenEntry}
                          onOpenFolder={props.onOpenFolder}
                          onDeleteEntry={props.onDeleteEntry}
                        />
                      </If>
                    </>
                  );
                }}
              </Each>
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
