import { signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { DownloadTaskProgress, LibraryEntry } from "../../library/types";
import { Icon } from "../../ui/Icon";
import type { ViewTransitionRect } from "../viewTransition";
import { DISCOVER_ITEMS } from "./data";
import { DiscoverCard } from "./DiscoverCard";
import { DiscoverFilters } from "./DiscoverFilters";
import type { DiscoverFilterState, DiscoverItem } from "./types";

export function DiscoverView(props: {
  onInspectItem: (item: DiscoverItem) => void;
  onPracticeItem: (item: DiscoverItem, originRect?: ViewTransitionRect | null) => void;
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

  const updateFilters = (patch: Partial<DiscoverFilterState>) => {
    filters.set({
      ...filters(),
      ...patch,
    });
  };

  const filteredItems = (): DiscoverItem[] => {
    const f = filters();
    const query = f.searchQuery.trim().toLowerCase();

    return DISCOVER_ITEMS.filter((item) => {
      // 1. Language filter
      if (f.language !== "all" && item.language !== f.language) {
        return false;
      }

      // 2. Level filter
      if (f.level !== "all" && item.level !== f.level) {
        return false;
      }

      // 3. Duration tier filter (5m, 10m, 20m, 30m)
      if (f.durationTier !== "all" && item.durationTier !== f.durationTier) {
        return false;
      }

      // 4. Tag filter
      if (f.tag !== null && !item.tags.includes(f.tag)) {
        return false;
      }

      // 5. Search query
      if (query) {
        const titleMatch = item.title.toLowerCase().includes(query);
        const authorMatch = item.author.toLowerCase().includes(query);
        const tagMatch = item.tags.some((t) => t.toLowerCase().includes(query));
        const descMatch = item.description.toLowerCase().includes(query);
        if (!titleMatch && !authorMatch && !tagMatch && !descMatch) {
          return false;
        }
      }

      return true;
    });
  };

  const downloadedVideoIds = () => {
    const entries = props.savedEntries?.() ?? [];
    return new Set(entries.map((e) => e.videoId));
  };

  const downloadingVideoIds = () => {
    const downloads = props.activeDownloads?.() ?? [];
    return new Set(downloads.map((d) => d.videoId));
  };

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

          <View class="flex-row items-center gap-1.5 rounded-full bg-ready/15 px-2.5 py-0.5">
            <View class="h-1.5 w-1.5 rounded-full bg-ready" />
            <Text class="font-mono text-[11px] font-semibold text-ready">
              {filteredItems().length} / {DISCOVER_ITEMS.length} 部推荐视频
            </Text>
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
        totalCount={() => DISCOVER_ITEMS.length}
        filteredCount={() => filteredItems().length}
      />

      {/* 3. Recommendation Grid */}
      <If when={filteredItems().length > 0}>
        <View
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {filteredItems().map((item) => (
            <DiscoverCard
              item={item}
              onInspect={props.onInspectItem}
              onPractice={props.onPracticeItem}
              onDownload={props.onDownloadItem}
              onTagClick={(tag) => updateFilters({ tag })}
              isDownloaded={() => downloadedVideoIds().has(item.videoId)}
              isDownloading={() => downloadingVideoIds().has(item.videoId)}
            />
          ))}
        </View>
      </If>

      {/* 4. Empty State */}
      <If when={filteredItems().length === 0}>
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
