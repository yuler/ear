import { Image, Text, View, type ViewRef } from "nsh";
import { Button } from "nsh/base";
import { formatDurationMs } from "../../clipboard";
import { Icon } from "../../ui/Icon";
import {
  captureElementRect,
  type ViewTransitionRect,
} from "../viewTransition";
import type { DiscoverItem } from "./types";

export function DiscoverCard(props: {
  item: DiscoverItem;
  onPractice: (item: DiscoverItem, originRect?: ViewTransitionRect | null) => void;
  onInspect?: (item: DiscoverItem) => void;
  onDownload?: (item: DiscoverItem) => void;
  onTagClick?: (tag: string) => void;
  isDownloaded?: () => boolean;
  isDownloading?: () => boolean;
  selected?: boolean;
}) {
  let posterRef: ViewRef | null = null;
  const item = props.item;
  const duration = formatDurationMs(item.durationMs);

  const handlePractice = async () => {
    let rect: ViewTransitionRect | null = null;
    if (posterRef) {
      rect = await captureElementRect(posterRef, 8);
    }
    props.onPractice(item, rect);
  };

  const levelColorClass = () => {
    if (item.level.startsWith("A1") || item.level.startsWith("N5")) {
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-500";
    }
    if (item.level.startsWith("A2") || item.level.startsWith("N4")) {
      return "border-blue-500/30 bg-blue-500/15 text-blue-500";
    }
    if (item.level.startsWith("B1") || item.level.startsWith("N3")) {
      return "border-amber-500/30 bg-amber-500/15 text-amber-500";
    }
    if (item.level.startsWith("B2") || item.level.startsWith("N2")) {
      return "border-purple-500/30 bg-purple-500/15 text-purple-500";
    }
    return "border-rose-500/30 bg-rose-500/15 text-rose-500";
  };

  return (
    <Button
      onPress={() => void handlePractice()}
      class={`group relative flex-col justify-between overflow-hidden rounded-xl border p-3.5 text-left transition-all duration-200 hover:border-[#2f7cf6] hover:bg-well/35 hover:shadow-lg sm:p-4 cursor-pointer active:scale-[0.99] ${
        props.selected
          ? "border-[#2f7cf6] bg-primary/10 ring-2 ring-[#2f7cf6] shadow-[0_0_14px_rgba(47,124,246,0.3)]"
          : "border-line/70 bg-well/15"
      }`}
      accessibilityLabel={`Play ${item.title}`}
    >
      <View class="gap-3">
        {/* Poster + duration + level badge */}
        <View
          ref={(node) => {
            posterRef = node;
          }}
          class="relative aspect-video w-full overflow-hidden rounded-lg border border-line/60 bg-black text-left"
        >
          <Image
            src={item.thumbnailUrl}
            class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
          <View class="absolute inset-0 items-center justify-center bg-black/25 transition duration-200 group-hover:bg-black/15">
            <View class="h-10 w-10 items-center justify-center rounded-full bg-black/75 shadow-md backdrop-blur-sm transition duration-200 group-hover:scale-110 group-hover:bg-[#2f7cf6] group-hover:shadow-[0_0_20px_rgba(47,124,246,0.6)]">
              <Icon name="play" size={14} color="#ffffff" />
            </View>
          </View>

          {/* Duration badge */}
          <If when={Boolean(duration)}>
            <View class="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5">
              <Text class="font-mono text-[10px] font-medium tabular-nums text-white">
                {duration}
              </Text>
            </View>
          </If>

          {/* Level badge */}
          <View
            class={`absolute top-2 left-2 rounded-md border px-2 py-0.5 ${levelColorClass()}`}
          >
            <Text class="font-mono text-[11px] font-semibold">
              {item.levelLabel}
            </Text>
          </View>

          {/* Duration tier badge */}
          <View class="absolute top-2 right-2 rounded-md border border-white/20 bg-black/75 px-1.5 py-0.5">
            <Text class="font-mono text-[10px] font-medium text-white">
              {item.durationTier} min 档
            </Text>
          </View>
        </View>

        {/* Content details */}
        <View class="gap-1.5">
          {/* Format badge: 英英结合 / 日日结合 */}
          <View class="flex-row items-center gap-1.5">
            <View class="rounded bg-[#2f7cf6]/15 px-2 py-0.5">
              <Text class="font-mono text-[10px] font-semibold text-[#2f7cf6]">
                {item.formatLabel}
              </Text>
            </View>
            <Text class="truncate text-xs text-muted-foreground font-medium">
              {item.author}
            </Text>
          </View>

          {/* Title & Description */}
          <View selectable class="w-full select-text gap-1">
            <Text class="select-text line-clamp-2 text-sm font-semibold leading-snug text-foreground transition group-hover:text-[#2f7cf6]">
              {item.title}
            </Text>
            <Text class="select-text line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </Text>
          </View>

          {/* Tags */}
          <View class="mt-1 flex-row flex-wrap items-center gap-1">
            {item.tags.map((tag) => (
              <Button
                onPress={() => props.onTagClick?.(tag)}
                class="rounded bg-well px-1.5 py-0.5 hover:bg-[#2f7cf6]/20 active:scale-95"
              >
                <Text class="font-mono text-[10px] text-dim">{tag}</Text>
              </Button>
            ))}
          </View>
        </View>
      </View>
    </Button>
  );
}
