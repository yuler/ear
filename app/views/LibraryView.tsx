import { effect, keymap, signal, Text, View } from "nsh";
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
  disabled?: () => boolean;
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
    const activeIds = new Set(
      (props.activeDownloads?.() ?? []).map((d) => d.videoId),
    );
    return props.savedEntries().filter(
      (e) =>
        !activeIds.has(e.videoId) &&
        e.state !== "pending" &&
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

  const focusedIndex = signal<number>(-1);

  // Reset or clamp cursor when visible entries list changes (e.g. deletion, tab switch, filter)
  effect(() => {
    const len = currentEntries().length;
    const cur = focusedIndex();
    if (len === 0) {
      if (cur !== -1) focusedIndex.set(-1);
    } else if (cur >= len) {
      focusedIndex.set(len - 1);
    }
  });

  keymap.bind(
    {
      down: () => {
        if (props.disabled?.()) return;
        const list = currentEntries();
        if (list.length === 0) {
          if (focusedIndex() !== -1) focusedIndex.set(-1);
          return;
        }
        let cur = focusedIndex();
        if (cur >= list.length) cur = list.length - 1;
        focusedIndex.set(cur < 0 ? 0 : (cur + 1) % list.length);
      },
      up: () => {
        if (props.disabled?.()) return;
        const list = currentEntries();
        if (list.length === 0) {
          if (focusedIndex() !== -1) focusedIndex.set(-1);
          return;
        }
        let cur = focusedIndex();
        if (cur >= list.length) cur = list.length - 1;
        focusedIndex.set(cur <= 0 ? list.length - 1 : cur - 1);
      },
      right: () => {
        if (props.disabled?.()) return;
        const list = currentEntries();
        if (list.length === 0) {
          if (focusedIndex() !== -1) focusedIndex.set(-1);
          return;
        }
        let cur = focusedIndex();
        if (cur >= list.length) cur = list.length - 1;
        focusedIndex.set(cur < 0 ? 0 : (cur + 1) % list.length);
      },
      left: () => {
        if (props.disabled?.()) return;
        const list = currentEntries();
        if (list.length === 0) {
          if (focusedIndex() !== -1) focusedIndex.set(-1);
          return;
        }
        let cur = focusedIndex();
        if (cur >= list.length) cur = list.length - 1;
        focusedIndex.set(cur <= 0 ? list.length - 1 : cur - 1);
      },
      enter: () => {
        if (props.disabled?.()) return;
        const list = currentEntries();
        if (list.length === 0) return;
        let cur = focusedIndex();
        if (cur >= list.length) {
          cur = list.length - 1;
          focusedIndex.set(cur);
        }
        if (cur >= 0 && cur < list.length) {
          props.onOpenEntry(list[cur]);
        }
      },
      o: () => {
        if (props.disabled?.()) return;
        const list = currentEntries();
        if (list.length === 0) return;
        let cur = focusedIndex();
        if (cur >= list.length) {
          cur = list.length - 1;
          focusedIndex.set(cur);
        }
        if (cur >= 0 && cur < list.length) {
          props.onOpenFolder(list[cur]);
        }
      },
      delete: () => {
        if (props.disabled?.()) return;
        const list = currentEntries();
        if (list.length === 0) return;
        let cur = focusedIndex();
        if (cur >= list.length) {
          cur = list.length - 1;
          focusedIndex.set(cur);
        }
        if (cur >= 0 && cur < list.length) {
          props.onDeleteEntry?.(list[cur]);
        }
      },
      backspace: () => {
        if (props.disabled?.()) return;
        const list = currentEntries();
        if (list.length === 0) return;
        let cur = focusedIndex();
        if (cur >= list.length) {
          cur = list.length - 1;
          focusedIndex.set(cur);
        }
        if (cur >= 0 && cur < list.length) {
          props.onDeleteEntry?.(list[cur]);
        }
      },
    },
    { when: "notEditing" },
  );

  return (
    <View class="gap-4">
      <If when={totalVisibleCount() > 0}>
        <View class="gap-3">
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
                {(entry, index) => {
                  const mode = () => settings().libraryLayout;
                  const isSelected = () => focusedIndex() === index();
                  return (
                    <>
                      <If when={mode() === "grade"}>
                        <LibraryGradeCard
                          entry={entry()}
                          onOpenEntry={props.onOpenEntry}
                          onOpenFolder={props.onOpenFolder}
                          onDeleteEntry={props.onDeleteEntry}
                          selected={isSelected()}
                        />
                      </If>
                      <If when={mode() === "list"}>
                        <LibraryListRow
                          entry={entry()}
                          onOpenEntry={props.onOpenEntry}
                          onOpenFolder={props.onOpenFolder}
                          onDeleteEntry={props.onDeleteEntry}
                          selected={isSelected()}
                        />
                      </If>
                      <If when={mode() !== "grade" && mode() !== "list"}>
                        <LibraryPostCard
                          entry={entry()}
                          onOpenEntry={props.onOpenEntry}
                          onOpenFolder={props.onOpenFolder}
                          onDeleteEntry={props.onDeleteEntry}
                          selected={isSelected()}
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
