import { keymap, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { DownloadTaskProgress, LibraryEntry } from "../../library/types";
import { Icon } from "../../ui/Icon";
import type { ViewTransitionRect } from "../viewTransition";
import { DiscoverCard } from "./DiscoverCard";
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
  onInspectItem: (item: DiscoverItem) => void;
  onPracticeItem: (
    item: DiscoverItem,
    originRect?: ViewTransitionRect | null,
  ) => void;
  onDownloadItem: (item: DiscoverItem) => void;
  savedEntries?: () => LibraryEntry[];
  activeDownloads?: () => DownloadTaskProgress[];
}) {
  const filters = signal<DiscoverFilterState>({
    language: "all",
    level: "all",
    durationTier: "all",
    tag: null,
    searchQuery: "",
  });

  // Auto-load on mount if not yet loaded
  if (
    discoverItems().length === 0 &&
    !isDiscoverLoading() &&
    !discoverError()
  ) {
    void loadDiscover();
  }

  const updateFilters = (patch: Partial<DiscoverFilterState>) => {
    filters.set({
      ...filters(),
      ...patch,
    });
  };

  const filteredItems = (): DiscoverItem[] => {
    return filterDiscoverItems(discoverItems(), filters());
  };

  const downloadedVideoIds = () => {
    const entries = props.savedEntries?.() ?? [];
    return new Set(entries.map((e) => e.videoId));
  };

  const downloadingVideoIds = () => {
    const downloads = props.activeDownloads?.() ?? [];
    return new Set(downloads.map((d) => d.videoId));
  };

  const focusedIndex = signal<number>(-1);

  keymap.bind(
    {
      down: () => {
        const list = filteredItems();
        if (list.length === 0) return;
        const cur = focusedIndex();
        focusedIndex.set(cur < 0 ? 0 : (cur + 1) % list.length);
      },
      up: () => {
        const list = filteredItems();
        if (list.length === 0) return;
        const cur = focusedIndex();
        focusedIndex.set(cur <= 0 ? list.length - 1 : cur - 1);
      },
      right: () => {
        const list = filteredItems();
        if (list.length === 0) return;
        const cur = focusedIndex();
        focusedIndex.set(cur < 0 ? 0 : (cur + 1) % list.length);
      },
      left: () => {
        const list = filteredItems();
        if (list.length === 0) return;
        const cur = focusedIndex();
        focusedIndex.set(cur <= 0 ? list.length - 1 : cur - 1);
      },
      enter: () => {
        const list = filteredItems();
        const cur = focusedIndex();
        if (cur >= 0 && cur < list.length) {
          props.onPracticeItem(list[cur]);
        }
      },
    },
    { when: "notEditing" },
  );

  return (
    <View class="gap-4 pb-12">
      {/* 1. Header Banner */}
      <View class="flex-col gap-2 rounded-2xl border border-line bg-well/30 p-4 sm:p-5">
        <View class="flex-row items-center justify-between">
          <View class="flex-row items-center gap-2">
            <View class="h-6 w-6 items-center justify-center rounded-lg bg-[#2f7cf6]/20">
              <Icon name="compass" size={14} color="#2f7cf6" />
            </View>
            <Text class="text-base font-bold text-foreground">
              Discover · 精听推荐
            </Text>
          </View>

          <View class="flex-row items-center gap-2">
            <If when={discoverItems().length > 0}>
              <View class="flex-row items-center gap-1.5 rounded-full bg-ready/15 px-2.5 py-0.5">
                <View class="h-1.5 w-1.5 rounded-full bg-ready" />
                <Text class="font-mono text-[11px] font-semibold text-ready">
                  {filteredItems().length} / {discoverItems().length} 部推荐视频
                </Text>
              </View>
            </If>

            <Button
              onPress={() => void loadDiscover({ refresh: true })}
              class="flex-row items-center gap-1 rounded-lg border border-line bg-well/50 px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground active:scale-95"
              accessibilityLabel="刷新推荐列表"
            >
              <Icon
                name={isDiscoverLoading() ? "loader" : "repeat"}
                size={12}
                class={isDiscoverLoading() ? "animate-spin" : ""}
              />
              <Text class="font-mono text-[11px]">
                {isDiscoverLoading() ? "拉取中…" : "刷新"}
              </Text>
            </Button>
          </View>
        </View>

        <Text class="text-xs leading-relaxed text-muted-foreground">
          基于可理解输入（Comprehensible Input）理论精选材料：采用
          <Text class="font-semibold text-foreground">
            “英英结合 / 日日结合”
          </Text>
          原声原字幕浸润模式，按
          <Text class="font-semibold text-foreground">A1–C1 / N5–N1</Text>
          等级精准分级，划分为
          <Text class="font-semibold text-foreground">
            5 分钟、10 分钟、20 分钟与 30 分钟
          </Text>
          短视频梯度，助你每天轻松无痛磨耳朵。
        </Text>
      </View>

      {/* 2. Interactive Filter Bar */}
      <DiscoverFilters
        filters={filters}
        onChange={updateFilters}
        totalCount={() => discoverItems().length}
        filteredCount={() => filteredItems().length}
      />

      {/* 3. Loading State (When empty and fetching) */}
      <If when={isDiscoverLoading() && discoverItems().length === 0}>
        <View class="items-center justify-center gap-3 rounded-2xl border border-line bg-well/20 py-20 text-center">
          <Icon
            name="loader"
            size={24}
            color="#2f7cf6"
            class="animate-spin"
          />
          <Text class="text-sm text-muted-foreground">
            正在从 Discover 数据源拉取精听推荐…
          </Text>
        </View>
      </If>

      {/* 4. Error State (When empty and failed) */}
      <If when={Boolean(discoverError()) && discoverItems().length === 0}>
        <View class="items-center justify-center gap-3 rounded-2xl border border-dashed border-rose-500/40 bg-rose-500/5 py-12 text-center">
          <View class="h-10 w-10 items-center justify-center rounded-full bg-rose-500/10">
            <Icon name="x" size={18} color="#ef4444" />
          </View>
          <View class="gap-1 px-4">
            <Text class="text-sm font-semibold text-foreground">
              加载推荐列表失败
            </Text>
            <Text class="text-xs text-muted-foreground">
              {discoverError()}
            </Text>
          </View>
          <Button
            onPress={() => void loadDiscover()}
            class="mt-2 rounded-lg bg-[#2f7cf6] px-4 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            重试拉取
          </Button>
        </View>
      </If>

      {/* 5. Recommendation Grid */}
      <If when={filteredItems().length > 0}>
        <View
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {filteredItems().map((item, idx) => (
            <DiscoverCard
              item={item}
              onInspect={props.onInspectItem}
              onPractice={props.onPracticeItem}
              onDownload={props.onDownloadItem}
              onTagClick={(tag) => updateFilters({ tag })}
              isDownloaded={() => downloadedVideoIds().has(item.videoId)}
              isDownloading={() => downloadingVideoIds().has(item.videoId)}
              selected={focusedIndex() === idx}
            />
          ))}
        </View>
      </If>

      {/* 6. Empty State */}
      <If
        when={
          discoverItems().length > 0 && filteredItems().length === 0
        }
      >
        <View class="items-center justify-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
          <View class="h-10 w-10 items-center justify-center rounded-full bg-well">
            <Icon name="search" size={18} tone="muted-foreground" />
          </View>
          <View class="gap-1">
            <Text class="text-sm font-medium text-foreground">
              未找到匹配的推荐视频
            </Text>
            <Text class="text-xs text-muted-foreground">
              请尝试调整语言、等级、时长筛选或清空搜索关键词
            </Text>
          </View>
          <Button
            onPress={() =>
              filters.set({
                language: "all",
                level: "all",
                durationTier: "all",
                tag: null,
                searchQuery: "",
              })
            }
            class="mt-2 rounded-lg bg-[#2f7cf6] px-4 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            重置全部筛选条件
          </Button>
        </View>
      </If>
    </View>
  );
}
