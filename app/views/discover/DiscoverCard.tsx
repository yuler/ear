import { Image, Text, View, type ViewRef } from "nsh";
import { Button } from "nsh/base";
import type { DownloadTaskProgress } from "../../library/types";
import { Icon } from "../../ui/Icon";
import { PosterProgress } from "../../ui/ActiveDownloadRow";
import { shellT } from "../../ui/shellI18n";
import { POSTER_RADIUS } from "../LibraryCards";
import { formatDuration } from "../libraryViewHelpers";
import {
  captureElementRect,
  type ViewTransitionRect,
} from "../viewTransition";
import type { DiscoverItem } from "./types";

export const DISCOVER_GRID_SKELETON_COUNT = 8;
export const DISCOVER_STRIP_SKELETON_COUNT = 6;

/** Shell loading placeholder matching DiscoverCard's exact poster and title geometry. */
export function DiscoverCardSkeleton() {
  return (
    <View class="flex-col gap-2 rounded-lg p-1.5">
      <View class="relative aspect-video w-full animate-pulse overflow-hidden rounded-lg border border-line/60 bg-well">
        <View class="absolute top-1.5 left-1.5 h-4 w-7 rounded bg-muted" />
        <View class="absolute right-1.5 bottom-1.5 h-4 w-10 rounded bg-muted" />
      </View>
      <View class="gap-1.5 px-0.5 pt-0.5">
        <View class="h-3.5 w-11/12 animate-pulse rounded bg-well" />
        <View class="h-3.5 w-2/3 animate-pulse rounded bg-well" />
      </View>
    </View>
  );
}

/**
 * A Discover recommendation: poster with its level and duration, and the
 * title. A press is its only action (open when downloaded, else download);
 * a running download shows as a bar on the poster.
 */
export function DiscoverCard(props: {
  item: DiscoverItem;
  onPress: (item: DiscoverItem, originRect?: ViewTransitionRect | null) => void;
  onMenu?: (item: DiscoverItem, at?: { x: number; y: number }) => void;
  isDownloaded?: () => boolean;
  download?: () => DownloadTaskProgress | null;
  selected?: boolean;
}) {
  let posterRef: ViewRef | null = null;
  const item = props.item;
  const duration = formatDuration(item.durationMs);
  const task = () => props.download?.() ?? null;

  const handlePress = async () => {
    if (task()) return;
    const rect = posterRef
      ? await captureElementRect(posterRef, POSTER_RADIUS)
      : null;
    props.onPress(item, rect);
  };

  return (
    <View
      onContextMenu={(e) => {
        props.onMenu?.(item, e.pagePosition);
      }}
      class="w-full"
    >
      <Button
        onPress={() => void handlePress()}
        class={`group w-full flex-col gap-2 rounded-lg p-1.5 text-left transition hover:bg-well ${
          props.selected ? "bg-well ring-2 ring-brand" : ""
        }`}
        accessibilityLabel={`Play ${item.title}`}
      >
      <View
        ref={(node) => {
          posterRef = node;
        }}
        class="relative aspect-video w-full overflow-hidden rounded-lg bg-well"
      >
        <Image
          src={item.thumbnailUrl}
          style={{ filter: task() ? "grayscale(60%) brightness(0.7)" : "none" }}
          class="h-full w-full object-cover"
        />
        <View class="absolute top-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5">
          <Text class="font-mono text-[11px] font-semibold text-white">
            {item.level}
          </Text>
        </View>
        <If when={Boolean(duration)}>
          <View class="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5">
            <Text class="font-mono text-[11px] tabular-nums text-white">
              {duration}
            </Text>
          </View>
        </If>
        <If when={Boolean(props.isDownloaded?.()) && !task()}>
          <View
            class="absolute top-1.5 right-1.5 h-6 w-6 items-center justify-center rounded-full bg-brand"
            accessibilityLabel={shellT().downloaded}
          >
            <Icon name="check" size={12} color="#ffffff" />
          </View>
        </If>
        <If when={task()}>
          {(getTask) => (
            <>
              <View class="pointer-events-none absolute inset-0 items-center justify-center">
                <View class="rounded-full bg-black/60 px-2 py-1">
                  <Text class="font-mono text-xs font-semibold tabular-nums text-white">
                    {Math.round(getTask().percent || 0)}%
                  </Text>
                </View>
              </View>
              <PosterProgress task={getTask} />
            </>
          )}
        </If>
      </View>

      <Text class="line-clamp-2 px-0.5 text-sm font-medium leading-snug text-foreground">
        {item.title}
      </Text>
      </Button>
    </View>
  );
}
