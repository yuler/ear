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

/**
 * A Discover recommendation: poster with its level and duration, and the
 * title. A press is its only action (open when downloaded, else download);
 * a running download shows as a bar on the poster.
 */
export function DiscoverCard(props: {
  item: DiscoverItem;
  onPress: (item: DiscoverItem, originRect?: ViewTransitionRect | null) => void;
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
    <Button
      onPress={() => void handlePress()}
      class={`group flex-col gap-2 rounded-lg p-1.5 text-left transition hover:bg-well ${
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
            class="absolute top-1.5 right-1.5 h-6 w-6 items-center justify-center rounded-full bg-ready"
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
  );
}
