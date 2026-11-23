import { effect, keymap, Scroll, signal, Text, View } from "nsh";
import { AlertDialog, Button } from "nsh/base";
import { Menu } from "nsh/desktop";
import type { DownloadTaskProgress, LibraryEntry } from "../library/types";
import { ActiveDownloadCard } from "../ui/ActiveDownloadRow";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";
import { DiscoverCard } from "./discover/DiscoverCard";
import type { DiscoverItem } from "./discover/types";
import { LibraryCard, POSTER_GRID_STYLE } from "./LibraryCards";
import {
  completedEntries,
  filterActiveDownloads,
  filterLibraryEntries,
  formatEntryDescription,
  isAudioEntry,
} from "./libraryViewHelpers";
import type { ViewTransitionRect } from "./viewTransition";

export { formatEntryDescription, isAudioEntry };

const DISCOVER_PREVIEW_LIMIT = 4;

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
 * Library: the primary home page right under the search bar.
 * Shows active downloads and local materials (filtered live by searchQuery),
 * with a subtle Discover preview entry tucked below.
 */
export function LibraryView(props: {
  disabled?: () => boolean;
  savedEntries: () => LibraryEntry[];
  activeDownloads?: () => DownloadTaskProgress[];
  searchQuery?: () => string;
  onClearSearch?: () => void;
  discoverItems?: () => DiscoverItem[];
  onSelectDiscoverItem?: (
    item: DiscoverItem,
    originRect?: ViewTransitionRect | null,
  ) => void;
  onOpenDiscover?: () => void;
  onOpenEntry: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onOpenFolder: (entry: LibraryEntry) => void;
  onDeleteEntry?: (entry: LibraryEntry) => void;
  onPauseDownload?: (videoId: string) => void;
  onResumeDownload?: (videoId: string) => void;
  onCancelDownload?: (videoId: string) => void;
}) {
  const query = () => (props.searchQuery?.() ?? "").trim();
  const isSearching = () => query().length > 0;

  const allDownloads = () => props.activeDownloads?.() ?? [];
  const allEntries = () => completedEntries(props.savedEntries(), allDownloads());
  const downloads = () =>
    isSearching() ? filterActiveDownloads(allDownloads(), query()) : allDownloads();
  const entries = () =>
    isSearching() ? filterLibraryEntries(allEntries(), query()) : allEntries();

  const totalCount = () => allEntries().length + allDownloads().length;
  const visibleCount = () => entries().length + downloads().length;
  const isEmpty = () => totalCount() === 0;
  const isSearchEmpty = () => isSearching() && visibleCount() === 0;

  const downloadedIds = () =>
    new Set(props.savedEntries().map((e) => e.videoId));
  const downloadFor = (videoId: string) =>
    allDownloads().find((d) => d.videoId === videoId) ?? null;

  const discoverPreview = (): DiscoverItem[] =>
    (props.discoverItems?.() ?? []).slice(0, DISCOVER_PREVIEW_LIMIT);
  const showDiscoverSection = () =>
    !isSearching() && Boolean(props.onOpenDiscover);

  const focusedIndex = signal<number>(-1);

  // Clamp the keyboard cursor when the list shrinks (deletion, search, refresh).
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

  const discoverSection = (
    <If when={showDiscoverSection()}>
      <View class="shrink-0 gap-3 border-t border-line/60 pt-5">
        <View class="flex-row items-center justify-between gap-2 px-1">
          <View class="flex-row items-center gap-2">
            <Icon name="compass" size={14} tone="muted-foreground" />
            <Text class="text-xs font-semibold text-muted-foreground">
              {shellT().discover}
            </Text>
            <Text class="hidden text-xs text-dim sm:flex">
              · {shellT().discoverSectionHint}
            </Text>
          </View>
          <Button
            onPress={() => props.onOpenDiscover?.()}
            class="flex-row items-center gap-1 rounded-md px-2 py-1 transition hover:bg-well active:bg-accent"
            accessibilityLabel={shellT().browseDiscover}
          >
            <Text class="text-xs font-medium text-muted-foreground">
              {shellT().browseDiscover}
            </Text>
            <Icon name="chevron-right" size={12} tone="muted-foreground" />
          </Button>
        </View>

        <If when={discoverPreview().length > 0 && Boolean(props.onSelectDiscoverItem)}>
          <View style={POSTER_GRID_STYLE}>
            {discoverPreview().map((item) => (
              <DiscoverCard
                item={item}
                onPress={(it, rect) => props.onSelectDiscoverItem?.(it, rect)}
                isDownloaded={() => downloadedIds().has(item.videoId)}
                download={() => downloadFor(item.videoId)}
              />
            ))}
          </View>
        </If>
      </View>
    </If>
  );

  return (
    <View class="min-h-0 flex-1 flex-col">
      <If when={visibleCount() > 0}>
        <Scroll class="min-h-0 flex-1">
          <View class="mx-auto w-full max-w-[1440px] flex-col gap-3 p-4 pb-8">
            <View class="flex-row items-center justify-between px-1">
              <View class="flex-row items-center gap-2">
                <Text class="text-sm font-semibold text-foreground">
                  {shellT().library}
                </Text>
                <Text class="font-mono text-xs tabular-nums text-dim">
                  {isSearching()
                    ? `${visibleCount()} / ${totalCount()}`
                    : `${totalCount()}`}
                </Text>
              </View>
            </View>

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

            <If when={showDiscoverSection()}>
              <View class="mt-6">{discoverSection}</View>
            </If>
          </View>
        </Scroll>
      </If>

      <If when={visibleCount() === 0}>
        <View class="mx-auto min-h-0 w-full max-w-[1440px] flex-1 flex-col px-4 pt-4 pb-5">
          <If when={isSearching()}>
            <View class="shrink-0 flex-row items-center justify-between px-1">
              <View class="flex-row items-center gap-2">
                <Text class="text-sm font-semibold text-foreground">
                  {shellT().library}
                </Text>
                <Text class="font-mono text-xs tabular-nums text-dim">
                  {`0 / ${totalCount()}`}
                </Text>
              </View>
            </View>
          </If>

          <View class="flex-1 items-center justify-center">
            <If when={isSearchEmpty()}>
              <View class="items-center justify-center gap-2.5">
                <Icon name="search" size={22} tone="muted-foreground" />
                <Text class="text-center text-sm font-medium text-foreground">
                  {shellT().librarySearchEmpty(query())}
                </Text>
                <If when={Boolean(props.onClearSearch)}>
                  <Button
                    onPress={() => props.onClearSearch?.()}
                    class="mt-1 rounded-md border border-line px-3 py-1.5 transition hover:bg-well active:bg-accent"
                    accessibilityLabel={shellT().clearSearch}
                  >
                    <Text class="text-xs font-medium text-foreground">
                      {shellT().clearSearch}
                    </Text>
                  </Button>
                </If>
              </View>
            </If>

            <If when={isEmpty() && !isSearching()}>
              <View class="items-center justify-center gap-2">
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

          {discoverSection}
        </View>
      </If>
    </View>
  );
}
