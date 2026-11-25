import { effect, keymap, Scroll, signal, Text, View, type ScrollRef } from "nsh";
import { AlertDialog, Button, Scrollbar } from "nsh/base";
import type { DiskSpaceInfo } from "../library/storage";
import type { DownloadTaskProgress, LibraryEntry } from "../library/types";
import { ActiveDownloadsSection } from "../ui/ActiveDownloadRow";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";
import {
  DISCOVER_STRIP_SKELETON_COUNT,
  DiscoverCard,
  DiscoverCardSkeleton,
} from "./discover/DiscoverCard";
import type { DiscoverItem } from "./discover/types";
import { LibraryBatchBar } from "./LibraryBatchBar";
import { LibraryCard, POSTER_GRID_STYLE } from "./LibraryCards";
import { LibraryHeader } from "./LibraryHeader";
import {
  buildDiscoverContextMenu,
  buildLibraryContextMenu,
  copyUrlWithToast,
} from "./libraryMenus";
import {
  areAllVisibleSelected,
  completedEntries,
  filterActiveDownloads,
  filterLibraryEntries,
  formatEntryDescription,
  isAudioEntry,
  pruneSelectedIds,
  toggleSelectAllIds,
  toggleSelectedId,
} from "./libraryViewHelpers";
import type { ViewTransitionRect } from "./viewTransition";

export { formatEntryDescription, isAudioEntry };

const DISCOVER_PREVIEW_LIMIT = 12;

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

/** Asks before batch-deleting one or more entries; resolves true when confirmed. */
export async function confirmDeleteMany(
  entries: readonly LibraryEntry[],
): Promise<boolean> {
  if (entries.length === 0) return false;
  if (entries.length === 1) return confirmDelete(entries[0]!);
  const t = shellT();
  try {
    const res = await AlertDialog.show({
      title: t.deleteBatchTitle(entries.length),
      description: t.deleteBatchDescription(entries.length),
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
 * with a fixed bottom Discover strip and optional multi-select batch toolbar.
 */
export function LibraryView(props: {
  disabled?: () => boolean;
  previewOpen?: () => boolean;
  savedEntries: () => LibraryEntry[];
  activeDownloads?: () => DownloadTaskProgress[];
  searchQuery?: () => string;
  onClearSearch?: () => void;
  discoverItems?: () => DiscoverItem[];
  discoverLoading?: () => boolean;
  onSelectDiscoverItem?: (
    item: DiscoverItem,
    originRect?: ViewTransitionRect | null,
  ) => void;
  onOpenDiscover?: () => void;
  onOpenEntry: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onOpenFolder: (entry: LibraryEntry) => void;
  downloadFolder?: () => string;
  diskSpace?: () => DiskSpaceInfo | null;
  onOpenDownloadFolder?: () => void;
  onDeleteEntry?: (entry: LibraryEntry) => void;
  onDeleteEntries?: (entries: LibraryEntry[]) => void;
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

  const selectionMode = signal(false);
  const selectedIds = signal<Set<string>>(new Set());

  const selectedEntries = () =>
    allEntries().filter((e) => selectedIds().has(e.videoId));
  const selectedCount = () => selectedEntries().length;
  const visibleEntryIds = () => entries().map((e) => e.videoId);
  const allVisibleSelected = () =>
    areAllVisibleSelected(selectedIds(), visibleEntryIds());
  const canDelete = Boolean(props.onDeleteEntries || props.onDeleteEntry);

  const downloadedIds = () =>
    new Set(props.savedEntries().map((e) => e.videoId));
  const downloadFor = (videoId: string) =>
    allDownloads().find((d) => d.videoId === videoId) ?? null;

  const discoverPreview = (): DiscoverItem[] =>
    (props.discoverItems?.() ?? []).slice(0, DISCOVER_PREVIEW_LIMIT);
  const showDiscoverSection = () =>
    !isSearching() && !selectionMode() && Boolean(props.onOpenDiscover);

  const focusedIndex = signal<number>(-1);
  const discoverScrollRef = signal<ScrollRef | null>(null);

  const enterSelectionMode = (initialVideoId?: string) => {
    selectionMode.set(true);
    if (initialVideoId) {
      selectedIds.set(new Set([initialVideoId]));
    }
  };

  const exitSelectionMode = () => {
    selectionMode.set(false);
    selectedIds.set(new Set());
  };

  const toggleEntrySelection = (entry: LibraryEntry) => {
    const next = toggleSelectedId(selectedIds(), entry.videoId);
    selectedIds.set(next);
    if (next.size > 0) selectionMode.set(true);
  };

  /** Gmail / Linear: X checks the focused row and drops the bar when none remain. */
  const toggleFocusedSelection = () => {
    if (props.disabled?.() || props.previewOpen?.()) return;
    if (entries().length === 0) return;
    if (focusedIndex() < 0) focusedIndex.set(0);
    const entry = focused();
    if (!entry) return;
    const next = toggleSelectedId(selectedIds(), entry.videoId);
    selectedIds.set(next);
    selectionMode.set(next.size > 0);
  };

  /** Space toggles the focused item while selection mode is active. */
  const toggleFocusedInSelectionMode = () => {
    if (props.disabled?.() || props.previewOpen?.()) return;
    if (!selectionMode()) return;
    if (entries().length === 0) return;
    if (focusedIndex() < 0) focusedIndex.set(0);
    const entry = focused();
    if (!entry) return;
    toggleEntrySelection(entry);
  };

  const toggleSelectAll = () => {
    selectedIds.set(toggleSelectAllIds(selectedIds(), visibleEntryIds()));
  };

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

  // Prune stale selections and exit selection mode if the library empties.
  effect(() => {
    const list = allEntries();
    if (list.length === 0) {
      if (selectionMode()) exitSelectionMode();
      return;
    }
    const cur = selectedIds();
    if (cur.size === 0) return;
    const valid = new Set(list.map((e) => e.videoId));
    const pruned = pruneSelectedIds(cur, valid);
    if (pruned.size !== cur.size) {
      selectedIds.set(pruned);
    }
  });

  const requestDelete = async (entry: LibraryEntry) => {
    if (!props.onDeleteEntry && !props.onDeleteEntries) return;
    if (!(await confirmDelete(entry))) return;
    if (props.onDeleteEntry) props.onDeleteEntry(entry);
    else props.onDeleteEntries?.([entry]);
  };

  const requestBatchDelete = async () => {
    const targets = selectedEntries();
    if (targets.length === 0 || !canDelete) return;
    if (!(await confirmDeleteMany(targets))) return;
    if (props.onDeleteEntries) {
      props.onDeleteEntries(targets);
    } else if (props.onDeleteEntry) {
      for (const item of targets) props.onDeleteEntry(item);
    }
    exitSelectionMode();
  };

  const libraryMenuItems = (entry: LibraryEntry) =>
    buildLibraryContextMenu({
      entry,
      selectionMode: selectionMode(),
      checked: selectedIds().has(entry.videoId),
      selectedCount: selectedCount(),
      allVisibleSelected: allVisibleSelected(),
      canDelete,
      onPlay: () => props.onOpenEntry(entry),
      onOpenFolder: () => props.onOpenFolder(entry),
      onCopyLink: () => void copyUrlWithToast(entry.url),
      onEnterSelect: () => enterSelectionMode(entry.videoId),
      onToggleItemSelect: () => toggleEntrySelection(entry),
      onToggleSelectAll: toggleSelectAll,
      onDeleteItem: () => void requestDelete(entry),
      onDeleteSelected: () => void requestBatchDelete(),
    });

  const discoverMenuItems = (item: DiscoverItem) => {
    const existing =
      props.savedEntries().find((e) => e.videoId === item.videoId && e.state === "ready") ??
      null;
    return buildDiscoverContextMenu({
      item,
      downloadedEntry: existing,
      onOpen: () => props.onSelectDiscoverItem?.(item),
      onOpenFolder: existing ? () => props.onOpenFolder(existing) : undefined,
      onCopyLink: () => void copyUrlWithToast(item.url),
    });
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
      x: toggleFocusedSelection,
      space: toggleFocusedInSelectionMode,
      o: () => {
        if (props.disabled?.()) return;
        if (selectionMode()) {
          const selected = selectedEntries();
          if (selected.length === 1 && selected[0]) {
            props.onOpenFolder(selected[0]);
          }
          return;
        }
        const entry = focused();
        if (entry) props.onOpenFolder(entry);
      },
      delete: () => {
        if (props.disabled?.()) return;
        if (selectionMode()) {
          void requestBatchDelete();
          return;
        }
        const entry = focused();
        if (entry) void requestDelete(entry);
      },
      backspace: () => {
        if (props.disabled?.()) return;
        if (selectionMode()) {
          void requestBatchDelete();
          return;
        }
        const entry = focused();
        if (entry) void requestDelete(entry);
      },
      a: () => {
        if (props.disabled?.() || !selectionMode()) return;
        toggleSelectAll();
      },
      "mod+a": () => {
        if (props.disabled?.() || !selectionMode()) return;
        toggleSelectAll();
      },
      escape: () => {
        if (props.disabled?.() || props.previewOpen?.()) return;
        if (selectionMode()) exitSelectionMode();
      },
    },
    { when: "notEditing" },
  );

  const discoverSection = (
    <If when={showDiscoverSection()}>
      <View class="shrink-0 border-t border-line/60 bg-background">
        <View class="mx-auto w-full max-w-[1440px] gap-3 px-4 pt-3.5 pb-4">
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

          <If when={Boolean(props.discoverLoading?.()) && discoverPreview().length === 0}>
            <View
              class="w-full overflow-hidden"
              style={{ height: 184 }}
              accessibilityLabel={shellT().discoverLoading}
            >
              <View class="flex-row gap-3">
                {Array.from({ length: DISCOVER_STRIP_SKELETON_COUNT }, () => (
                  <View class="w-[220px] shrink-0">
                    <DiscoverCardSkeleton />
                  </View>
                ))}
              </View>
            </View>
          </If>

          <If when={discoverPreview().length > 0 && Boolean(props.onSelectDiscoverItem)}>
            <View class="w-full gap-1.5">
              <Scroll
                ref={(node) => discoverScrollRef.set(node)}
                horizontal
                scrollbar={false}
                class="w-full"
                style={{ height: 184 }}
              >
                <View class="flex-row gap-3">
                  {discoverPreview().map((item) => (
                    <View class="w-[220px] shrink-0">
                      <DiscoverCard
                        item={item}
                        onPress={(it, rect) => props.onSelectDiscoverItem?.(it, rect)}
                        menuItems={() => discoverMenuItems(item)}
                        isDownloaded={() => downloadedIds().has(item.videoId)}
                        download={() => downloadFor(item.videoId)}
                      />
                    </View>
                  ))}
                </View>
              </Scroll>
              <If when={Boolean(discoverScrollRef())}>
                <Scrollbar
                  scroll={discoverScrollRef()!}
                  axis="horizontal"
                  mode="always"
                  class="h-2.5 w-full rounded-full bg-well/60 p-0.5"
                  thumbClass="h-full rounded-full bg-dim/70 transition hover:bg-muted-foreground active:bg-foreground/70"
                  accessibilityLabel="Scroll Discover items horizontally"
                />
              </If>
            </View>
          </If>
        </View>
      </View>
    </If>
  );

  const libraryHeader = (
    <LibraryHeader
      visibleCount={visibleCount}
      totalCount={totalCount}
      isSearching={isSearching}
      canSelect={() => entries().length > 0}
      selectionMode={selectionMode}
      allSelected={allVisibleSelected}
      onToggleSelectionMode={() => {
        if (selectionMode()) exitSelectionMode();
        else enterSelectionMode();
      }}
      onToggleSelectAll={toggleSelectAll}
      downloadFolder={props.downloadFolder}
      diskSpace={props.diskSpace}
      onOpenDownloadFolder={props.onOpenDownloadFolder}
    />
  );

  return (
    <View class="relative min-h-0 flex-1 flex-col">
      <If when={visibleCount() > 0}>
        <Scroll class="min-h-0 flex-1">
          <View
            class={`mx-auto w-full max-w-[1440px] flex-col gap-3 px-4 pt-2 ${
              selectionMode() ? "pb-24" : "pb-6"
            }`}
          >
            {libraryHeader}

            <ActiveDownloadsSection
              tasks={downloads}
              onPause={props.onPauseDownload}
              onResume={props.onResumeDownload}
              onCancel={props.onCancelDownload}
            />

            <If when={entries().length > 0}>
              <View style={POSTER_GRID_STYLE}>
                <Each of={entries()} key={(entry) => entry.videoId}>
                  {(entry, index) => (
                    <LibraryCard
                      entry={entry()}
                      selected={focusedIndex() === index()}
                      selectionMode={selectionMode()}
                      checked={selectedIds().has(entry().videoId)}
                      onOpen={props.onOpenEntry}
                      onToggleSelect={toggleEntrySelection}
                      menuItems={() => libraryMenuItems(entry())}
                    />
                  )}
                </Each>
              </View>
            </If>
          </View>
        </Scroll>
      </If>

      <If when={visibleCount() === 0}>
        <View class="mx-auto min-h-0 w-full max-w-[1440px] flex-1 flex-col px-4 pt-2 pb-4">
          {libraryHeader}

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
        </View>
      </If>

      {discoverSection}

      <If when={selectionMode()}>
        <LibraryBatchBar
          selectedCount={selectedCount}
          canDelete={canDelete}
          onOpenFolder={() => {
            const single = selectedEntries()[0];
            if (single) props.onOpenFolder(single);
          }}
          onDeleteSelected={() => void requestBatchDelete()}
          onExit={exitSelectionMode}
        />
      </If>
    </View>
  );
}
