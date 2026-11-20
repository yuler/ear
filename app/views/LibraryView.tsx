import { effect, keymap, signal, Text, View } from "nsh";
import { AlertDialog } from "nsh/base";
import { Menu } from "nsh/desktop";
import type { DownloadTaskProgress, LibraryEntry } from "../library/types";
import { ActiveDownloadCard } from "../ui/ActiveDownloadRow";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";
import { LibraryCard, POSTER_GRID_STYLE } from "./LibraryCards";
import {
  completedEntries,
  formatEntryDescription,
  isAudioEntry,
} from "./libraryViewHelpers";
import type { ViewTransitionRect } from "./viewTransition";

export { formatEntryDescription, isAudioEntry };

/** Asks before deleting; resolves true when the user confirmed. */
export async function confirmDelete(entry: LibraryEntry): Promise<boolean> {
  const t = shellT();
  try {
    const res = await AlertDialog.show({
      title: t.deleteTitle,
      description: t.deleteDescription(entry.title),
      actions: [
        { id: "cancel", label: t.cancel, role: "cancel" },
        { id: "delete", label: t.delete, role: "destructive" },
      ],
      closeOnEscape: true,
    });
    return res.action === "delete";
  } catch {
    return false;
  }
}

/**
 * Library: one responsive poster grid, downloads in progress first, then
 * finished video and audio entries mixed, newest first.
 */
export function LibraryView(props: {
  disabled?: () => boolean;
  savedEntries: () => LibraryEntry[];
  activeDownloads?: () => DownloadTaskProgress[];
  onOpenEntry: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onOpenFolder: (entry: LibraryEntry) => void;
  onDeleteEntry?: (entry: LibraryEntry) => void;
  onPauseDownload?: (videoId: string) => void;
  onResumeDownload?: (videoId: string) => void;
  onCancelDownload?: (videoId: string) => void;
}) {
  const downloads = () => props.activeDownloads?.() ?? [];
  const entries = () => completedEntries(props.savedEntries(), downloads());
  const isEmpty = () => entries().length === 0 && downloads().length === 0;

  const focusedIndex = signal<number>(-1);

  // Clamp the keyboard cursor when the list shrinks (deletion, refresh).
  effect(() => {
    const len = entries().length;
    const cur = focusedIndex();
    if (len === 0) {
      if (cur !== -1) focusedIndex.set(-1);
    } else if (cur >= len) {
      focusedIndex.set(len - 1);
    }
  });

  const requestDelete = async (entry: LibraryEntry) => {
    if (!props.onDeleteEntry) return;
    if (await confirmDelete(entry)) props.onDeleteEntry(entry);
  };

  const openMenu = (entry: LibraryEntry, at?: { x: number; y: number }) => {
    const t = shellT();
    void Menu.popup(
      [
        { label: t.openFolder, onSelect: () => props.onOpenFolder(entry) },
        props.onDeleteEntry ? { type: "separator" } : null,
        props.onDeleteEntry
          ? { label: t.delete, onSelect: () => void requestDelete(entry) }
          : null,
      ],
      at,
    );
  };

  /** The focused entry, after clamping; null on an empty list. */
  const focused = (): LibraryEntry | null => {
    const list = entries();
    if (list.length === 0) return null;
    let cur = focusedIndex();
    if (cur >= list.length) {
      cur = list.length - 1;
      focusedIndex.set(cur);
    }
    return cur >= 0 ? list[cur] : null;
  };

  const move = (step: 1 | -1) => {
    if (props.disabled?.()) return;
    const len = entries().length;
    if (len === 0) {
      if (focusedIndex() !== -1) focusedIndex.set(-1);
      return;
    }
    const cur = Math.min(focusedIndex(), len - 1);
    if (cur < 0) {
      focusedIndex.set(step === 1 ? 0 : len - 1);
    } else {
      focusedIndex.set((cur + step + len) % len);
    }
  };

  const withFocused = (fn: (entry: LibraryEntry) => void) => () => {
    if (props.disabled?.()) return;
    const entry = focused();
    if (entry) fn(entry);
  };

  keymap.bind(
    {
      down: () => move(1),
      right: () => move(1),
      up: () => move(-1),
      left: () => move(-1),
      enter: withFocused((e) => props.onOpenEntry(e)),
      o: withFocused((e) => props.onOpenFolder(e)),
      delete: withFocused((e) => void requestDelete(e)),
      backspace: withFocused((e) => void requestDelete(e)),
    },
    { when: "notEditing" },
  );

  return (
    <View>
      <If when={!isEmpty()}>
        <View style={POSTER_GRID_STYLE}>
          <Each of={downloads()} key={(t) => t.videoId}>
            {(getTask) => (
              <ActiveDownloadCard
                task={getTask}
                onPause={props.onPauseDownload}
                onResume={props.onResumeDownload}
                onCancel={props.onCancelDownload}
              />
            )}
          </Each>
          <Each of={entries()} key={(entry) => entry.videoId}>
            {(entry, index) => (
              <LibraryCard
                entry={entry()}
                selected={focusedIndex() === index()}
                onOpen={props.onOpenEntry}
                onMenu={openMenu}
              />
            )}
          </Each>
        </View>
      </If>

      <If when={isEmpty()}>
        <View class="items-center justify-center gap-2 py-16">
          <Icon name="download" size={24} tone="muted-foreground" />
          <Text class="text-center text-sm font-medium text-foreground">
            {shellT().libraryEmpty}
          </Text>
          <Text class="text-center text-xs text-muted-foreground">
            {shellT().libraryEmptyHint}
          </Text>
        </View>
      </If>
    </View>
  );
}
