import { Image, Text, View, type ViewRef } from "nsh";
import { Button } from "nsh/base";
import type { LibraryEntry } from "../library/types";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";
import { videoPosterUrl } from "../youtube/parse";
import {
  formatDuration,
  formatEntryDescription,
  isAudioEntry,
  subtitleIssue,
} from "./libraryViewHelpers";
import {
  captureElementRect,
  type ViewTransitionRect,
} from "./viewTransition";

export const POSTER_RADIUS = 8;

/** Grid template shared by Library and Discover: 3+ columns at 800pt. */
export const POSTER_GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 16,
} as const;

/** A finished Library entry: poster, title and one meta line. */
export function LibraryCard(props: {
  entry: LibraryEntry;
  selected?: boolean;
  selectionMode?: boolean;
  checked?: boolean;
  onOpen: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onToggleSelect?: (entry: LibraryEntry) => void;
  onMenu: (entry: LibraryEntry, at?: { x: number; y: number }) => void;
}) {
  let posterRef: ViewRef | null = null;
  const entry = props.entry;
  const duration = formatDuration(entry.durationMs);
  const audio = isAudioEntry(entry);
  const issue = subtitleIssue(entry);

  const handlePress = async () => {
    if (props.selectionMode) {
      props.onToggleSelect?.(entry);
      return;
    }
    const rect = posterRef
      ? await captureElementRect(posterRef, POSTER_RADIUS)
      : null;
    props.onOpen(entry, rect);
  };

  const cardHighlight = () => {
    if (props.selectionMode && props.checked) {
      return "bg-brand-soft/60 ring-2 ring-brand";
    }
    if (props.selected) {
      return "bg-well ring-2 ring-brand";
    }
    return "";
  };

  return (
    <View
      onContextMenu={(e) => {
        if (!props.selectionMode) props.onMenu(entry, e.pagePosition);
      }}
      class={`group relative rounded-lg transition hover:bg-well ${cardHighlight()}`}
    >
      <Button
        onPress={() => void handlePress()}
        class="flex-col gap-2 p-1.5 text-left"
        accessibilityLabel={
          props.selectionMode
            ? `Select ${entry.title}`
            : `Open ${entry.title}`
        }
      >
        <View
          ref={(node) => {
            posterRef = node;
          }}
          class="relative aspect-video w-full overflow-hidden rounded-lg bg-well"
        >
          <Image
            src={videoPosterUrl(entry.videoId, entry.thumbnailUrl)}
            class="h-full w-full object-cover"
          />
          <If when={audio}>
            <View
              class="absolute top-1.5 left-1.5 h-6 w-6 items-center justify-center rounded-md bg-black/70"
              accessibilityLabel={shellT().audio}
            >
              <Icon name="headphones" size={13} color="#ffffff" />
            </View>
          </If>
          <If when={Boolean(duration)}>
            <View class="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5">
              <Text class="font-mono text-[11px] tabular-nums text-white">
                {duration}
              </Text>
            </View>
          </If>
        </View>

        <View class="min-w-0 gap-0.5 px-0.5">
          <Text class="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {entry.title}
          </Text>
          <View class="flex-row items-center gap-1.5">
            <Text class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {formatEntryDescription(entry)}
            </Text>
            <If when={issue !== null}>
              <View class="shrink-0 rounded bg-amber-soft px-1.5 py-0.5">
                <Text class="text-[10px] font-medium text-amber">
                  {issue === "auto"
                    ? shellT().autoSubtitles
                    : shellT().noSubtitlesBadge}
                </Text>
              </View>
            </If>
          </View>
        </View>
      </Button>
      <If when={Boolean(props.selectionMode)}>
        <View
          class={`pointer-events-none absolute top-3 right-3 h-5.5 w-5.5 items-center justify-center rounded-full shadow-sm transition ${
            props.checked
              ? "bg-brand"
              : "border-2 border-white/85 bg-black/45"
          }`}
        >
          <If when={Boolean(props.checked)}>
            <Icon name="check" size={12} color="#ffffff" />
          </If>
        </View>
      </If>
      <If when={!props.selectionMode}>
        <Button
          onPress={() => props.onMenu(entry)}
          class={`absolute top-3 right-3 h-6 w-6 items-center justify-center rounded-md bg-black/70 transition active:bg-black/90 ${
            props.selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          accessibilityLabel={shellT().moreActions}
        >
          <Text class="text-sm font-bold leading-none text-white">⋯</Text>
        </Button>
      </If>
    </View>
  );
}
