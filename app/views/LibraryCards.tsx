import { Image, Text, View, type ViewRef } from "nsh";
import { Button } from "nsh/base";
import type { LibraryEntry } from "../library/types";
import {
  ActionContextMenu,
  type ContextMenuEntry,
} from "../ui/ActionContextMenu";
import { AppTooltip } from "../ui/AppTooltip";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";
import { videoPosterUrl } from "../youtube/parse";
import {
  formatDuration,
  formatEntryDescription,
  isAudioEntry,
  subtitleIssue,
  videoOrientation,
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

/** Selection is a blue wash. The keyboard cursor is a neutral ring. */
export function libraryCardChrome(checked: boolean, focused: boolean): string {
  const surface = checked
    ? "bg-brand-soft/70 hover:bg-brand-soft"
    : "hover:bg-well";
  const ring = focused ? "ring-2 ring-foreground" : "";
  return `group relative w-full rounded-lg transition ${surface} ${ring}`.trim();
}

/** A finished Library entry: poster, title and one meta line. */
export function LibraryCard(props: {
  entry: LibraryEntry;
  selected?: boolean;
  selectionMode?: boolean;
  checked?: boolean;
  onOpen: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onToggleSelect?: (entry: LibraryEntry) => void;
  menuItems?: () => (ContextMenuEntry | null)[];
}) {
  let posterRef: ViewRef | null = null;
  const entry = () => props.entry;
  const duration = () => formatDuration(entry().durationMs);
  const audio = () => isAudioEntry(entry());
  const orientation = () => (audio() ? null : videoOrientation(entry()));
  const issue = () => subtitleIssue(entry());

  const handlePress = async () => {
    const current = entry();
    if (props.selectionMode) {
      props.onToggleSelect?.(current);
      return;
    }
    const rect = posterRef
      ? await captureElementRect(posterRef, POSTER_RADIUS)
      : null;
    props.onOpen(entry(), rect);
  };

  const card = (
    <View
      class={libraryCardChrome(
        Boolean(props.selectionMode && props.checked),
        Boolean(props.selected),
      )}
    >
      <Button
        onPress={() => void handlePress()}
        class="w-full flex-col gap-2 p-1.5 text-left"
        accessibilityLabel={
          props.selectionMode
            ? `Select ${entry().title}`
            : `Open ${entry().title}`
        }
      >
        <View
          ref={(node) => {
            posterRef = node;
          }}
          class="relative aspect-video w-full overflow-hidden rounded-lg bg-well"
        >
          <Image
            src={videoPosterUrl(entry().videoId, entry().thumbnailUrl)}
            class="h-full w-full object-cover"
          />
          <If when={audio()}>
            <View
              class="absolute top-1.5 left-1.5 h-6 w-6 items-center justify-center rounded-md bg-black/70"
              accessibilityLabel={shellT().audio}
              tooltip={<AppTooltip label={shellT().audio} />}
            >
              <Icon name="headphones" size={13} color="#ffffff" />
            </View>
          </If>
          <If when={Boolean(duration())}>
            <View class="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5">
              <Text class="font-mono text-[11px] tabular-nums text-white">
                {duration()}
              </Text>
            </View>
          </If>
        </View>

        <View class="min-w-0 gap-0.5 px-0.5">
          <Text class="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {entry().title}
          </Text>
          <View class="flex-row items-center gap-1.5">
            <If when={!audio() && orientation() !== null}>
              <View
                class="shrink-0 items-center justify-center"
                accessibilityLabel={
                  orientation() === "portrait"
                    ? shellT().portraitVideo
                    : shellT().landscapeVideo
                }
                tooltip={
                  <AppTooltip
                    label={
                      orientation() === "portrait"
                        ? shellT().portraitVideo
                        : shellT().landscapeVideo
                    }
                  />
                }
              >
                <Icon
                  name={
                    orientation() === "portrait"
                      ? "video-portrait"
                      : "video-landscape"
                  }
                  size={14}
                  tone="muted-foreground"
                />
              </View>
            </If>
            <Text class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {formatEntryDescription(entry())}
            </Text>
            <If when={issue() !== null}>
              <View class="shrink-0 rounded bg-brand-soft px-1.5 py-0.5">
                <Text class="text-[10px] font-medium text-brand">
                  {issue() === "auto"
                    ? shellT().autoSubtitles
                    : shellT().noSubtitlesBadge}
                </Text>
              </View>
            </If>
          </View>
        </View>
      </Button>
      <If when={Boolean(props.selectionMode)}>
        <Button
          onPress={() => props.onToggleSelect?.(entry())}
          class={`absolute top-3 right-3 z-10 h-5.5 w-5.5 items-center justify-center rounded-full shadow-sm transition hover:scale-105 active:scale-95 ${
            props.checked
              ? "bg-brand"
              : "border-2 border-white/85 bg-black/45 hover:bg-black/65"
          }`}
          accessibilityLabel={`Toggle selection for ${entry().title}`}
        >
          <If when={Boolean(props.checked)}>
            <Icon name="check" size={12} color="#ffffff" />
          </If>
        </Button>
      </If>
    </View>
  );

  if (!props.menuItems) return card;

  return (
    <ActionContextMenu
      class="w-full"
      items={props.menuItems}
      trigger={card}
    />
  );
}
