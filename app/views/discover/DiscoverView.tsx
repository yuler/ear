import { effect, keymap, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { DownloadTaskProgress, LibraryEntry } from "../../library/types";
import { Icon } from "../../ui/Icon";
import { shellT } from "../../ui/shellI18n";
import { POSTER_GRID_STYLE } from "../LibraryCards";
import type { ViewTransitionRect } from "../viewTransition";
import {
  DISCOVER_GRID_SKELETON_COUNT,
  DiscoverCard,
  DiscoverCardSkeleton,
} from "./DiscoverCard";
import { DiscoverFilters } from "./DiscoverFilters";
import {
  discoverError,
  discoverItems,
  filterDiscoverItems,
  isDiscoverLoading,
  loadDiscover,
} from "./source";
import type { DiscoverFilterState, DiscoverItem } from "./types";

export function DiscoverView(props: {
  disabled?: () => boolean;
  previewOpen?: () => boolean;
  /** A card was pressed: open it when downloaded, else load into the link bar to configure & download. */
  onSelectItem: (
    item: DiscoverItem,
    originRect?: ViewTransitionRect | null,
  ) => void;
  onBack?: () => void;
  savedEntries?: () => LibraryEntry[];
  activeDownloads?: () => DownloadTaskProgress[];
  searchQuery?: () => string;
  onClearSearch?: () => void;
}) {
  const filters = signal<DiscoverFilterState>({ language: "en", level: "all" });
  const activeDownloadCount = () => props.activeDownloads?.().length ?? 0;

  if (
    discoverItems().length === 0 &&
    !isDiscoverLoading() &&
    !discoverError()
  ) {
    void loadDiscover();
  }

  const query = () => (props.searchQuery?.() ?? "").trim();
  const filteredItems = (): DiscoverItem[] =>
    filterDiscoverItems(discoverItems(), filters(), query());

  const downloadedIds = () =>
    new Set((props.savedEntries?.() ?? []).map((e) => e.videoId));
  const downloadFor = (videoId: string) =>
    (props.activeDownloads?.() ?? []).find((d) => d.videoId === videoId) ??
    null;

  const focusedIndex = signal<number>(-1);

  effect(() => {
    const len = filteredItems().length;
    const cur = focusedIndex();
    if (len === 0) {
      if (cur !== -1) focusedIndex.set(-1);
    } else if (cur >= len) {
      focusedIndex.set(len - 1);
    }
  });

  const keysDisabled = () => Boolean(props.disabled?.() || props.previewOpen?.());

  const move = (step: 1 | -1) => {
    if (keysDisabled()) return;
    const len = filteredItems().length;
    if (len === 0) {
      if (focusedIndex() !== -1) focusedIndex.set(-1);
      return;
    }
    const cur = Math.min(focusedIndex(), len - 1);
    focusedIndex.set(
      cur < 0 ? (step === 1 ? 0 : len - 1) : (cur + step + len) % len,
    );
  };

  keymap.bind(
    {
      down: () => move(1),
      right: () => move(1),
      up: () => move(-1),
      left: () => move(-1),
      enter: () => {
        if (keysDisabled()) return;
        const list = filteredItems();
        const cur = Math.min(focusedIndex(), list.length - 1);
        if (cur >= 0) props.onSelectItem(list[cur]);
      },
    },
    { when: "notEditing" },
  );

  return (
    <View class="gap-4 pb-8">
      <View class="flex-row flex-wrap items-center justify-between gap-3">
        <View class="flex-row flex-wrap items-center gap-3">
          <If when={Boolean(props.onBack)}>
            <Button
              onPress={() => props.onBack?.()}
              class="h-8 shrink-0 flex-row items-center gap-1 rounded-md border border-line bg-well/60 pr-2.5 pl-1.5 transition hover:bg-well active:bg-accent"
              accessibilityLabel={shellT().backToLibrary}
            >
              <Icon name="chevron-left" size={14} tone="muted-foreground" />
              <Text class="text-xs font-medium text-foreground">
                {shellT().library}
              </Text>
              <If when={activeDownloadCount() > 0}>
                <View
                  class="ml-0.5 min-w-[18px] items-center rounded-full bg-brand px-1.5"
                  accessibilityLabel={shellT().activeDownloads(
                    activeDownloadCount(),
                  )}
                >
                  <Text class="font-mono text-[10px] font-semibold tabular-nums text-brand-foreground">
                    {activeDownloadCount()}
                  </Text>
                </View>
              </If>
            </Button>
            <View class="hidden h-4 w-px bg-line sm:flex" />
          </If>

          <DiscoverFilters
            filters={filters}
            onChange={(patch) => filters.set({ ...filters(), ...patch })}
          />
        </View>
        <Button
          onPress={() => void loadDiscover({ refresh: true })}
          class="h-7 w-7 items-center justify-center rounded-md hover:bg-well active:bg-accent"
          accessibilityLabel={shellT().refresh}
        >
          <Icon
            name={isDiscoverLoading() ? "loader" : "repeat"}
            size={13}
            tone="muted-foreground"
            class={isDiscoverLoading() ? "animate-spin" : ""}
          />
        </Button>
      </View>

      <If when={isDiscoverLoading()}>
        <View
          style={POSTER_GRID_STYLE}
          accessibilityLabel={shellT().discoverLoading}
        >
          {Array.from({ length: DISCOVER_GRID_SKELETON_COUNT }, () => (
            <DiscoverCardSkeleton />
          ))}
        </View>
      </If>

      <If when={!isDiscoverLoading() && Boolean(discoverError()) && discoverItems().length === 0}>
        <View class="items-center justify-center gap-2 py-12">
          <Text class="text-sm font-medium text-foreground">
            {shellT().discoverFailed}
          </Text>
          <Text class="text-center text-xs text-muted-foreground">
            {discoverError()}
          </Text>
          <Button
            onPress={() => void loadDiscover()}
            class="mt-2 rounded-md bg-brand px-3 py-1.5 active:opacity-90"
          >
            <Text class="text-xs font-semibold text-brand-foreground">
              {shellT().retryLoad}
            </Text>
          </Button>
        </View>
      </If>

      <If when={!isDiscoverLoading() && filteredItems().length > 0}>
        <View style={POSTER_GRID_STYLE}>
          {filteredItems().map((item, idx) => (
            <DiscoverCard
              item={item}
              onPress={props.onSelectItem}
              isDownloaded={() => downloadedIds().has(item.videoId)}
              download={() => downloadFor(item.videoId)}
              selected={focusedIndex() === idx}
            />
          ))}
        </View>
      </If>

      <If when={!isDiscoverLoading() && discoverItems().length > 0 && filteredItems().length === 0}>
        <View class="items-center justify-center gap-3 py-16">
          <Text class="text-sm text-muted-foreground">
            {query() ? shellT().librarySearchEmpty(query()) : shellT().discoverEmpty}
          </Text>
          <Button
            onPress={() => {
              filters.set({ ...filters(), level: "all" });
              if (query()) props.onClearSearch?.();
            }}
            class="rounded-md border border-line px-3 py-1.5 active:bg-accent"
          >
            <Text class="text-xs font-medium text-foreground">
              {query() ? shellT().clearSearch : shellT().resetFilters}
            </Text>
          </Button>
        </View>
      </If>
    </View>
  );
}
