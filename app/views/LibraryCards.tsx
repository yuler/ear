import { Image, Text, View, type ViewRef } from "nsh";
import { Button } from "nsh/base";
import { formatDurationMs } from "../clipboard";
import type { LibraryEntry } from "../library/types";
import { Icon } from "../ui/Icon";
import { videoPosterUrl } from "../youtube/parse";
import { formatEntryDescription } from "./libraryView";
import {
  captureElementRect,
  type ViewTransitionRect,
} from "./viewTransition";

/** Horizontal row for list mode. */
export function LibraryListRow(props: {
  entry: LibraryEntry;
  onOpenEntry: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onOpenFolder: (entry: LibraryEntry) => void;
  onDeleteEntry?: (entry: LibraryEntry) => void;
}) {
  let thumbRef: ViewRef | null = null;
  const duration = formatDurationMs(props.entry.durationMs);
  const meta = formatEntryDescription(props.entry);
  const localPath = props.entry.videoPath || props.entry.audioPath || null;

  const handleOpen = async () => {
    let rect: ViewTransitionRect | null = null;
    if (thumbRef) {
      rect = await captureElementRect(thumbRef, 8);
    }
    props.onOpenEntry(props.entry, rect);
  };

  return (
    <View class="flex-row items-center justify-between gap-4 rounded-lg border-b border-line px-2 py-3 transition hover:bg-well/30">
      {/* Clickable thumbnail to play */}
      <Button
        ref={(node) => {
          thumbRef = node;
        }}
        onPress={() => void handleOpen()}
        class="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-lg border border-line bg-black cursor-pointer"
        accessibilityLabel={`Play ${props.entry.title}`}
      >
        <Image
          src={videoPosterUrl(props.entry.videoId, props.entry.thumbnailUrl)}
          class="h-full w-full object-cover"
        />
        <View class="absolute inset-0 items-center justify-center bg-black/20">
          <View class="h-6 w-6 items-center justify-center rounded-full bg-black/65">
            <Icon name="play" size={10} color="#fafafa" />
          </View>
        </View>
        <If when={Boolean(duration)}>
          <View class="absolute right-1.5 bottom-1 rounded bg-black/80 px-1.5 py-0.5">
            <Text class="font-mono text-[10px] font-medium tabular-nums text-white">
              {duration}
            </Text>
          </View>
        </If>
      </Button>

      {/* Selectable and copyable video details */}
      <View selectable class="min-w-0 flex-1 items-start gap-1 select-text">
        <Text class="select-text line-clamp-1 text-sm font-medium text-foreground">
          {props.entry.title}
        </Text>
        <View class="flex-row flex-wrap items-center gap-1.5 select-text">
          <Text class="select-text font-mono text-xs text-muted-foreground">{meta}</Text>
          <If when={Boolean(props.entry.subtitleLabel)}>
            <View
              class={`rounded px-1.5 py-0.5 ${
                props.entry.subtitleIsAuto ? "bg-amber-soft" : "bg-ready-soft"
              }`}
            >
              <Text
                class={`select-text font-mono text-[10px] font-semibold ${
                  props.entry.subtitleIsAuto ? "text-amber" : "text-ready"
                }`}
              >
                {props.entry.subtitleLabel}
              </Text>
            </View>
          </If>
        </View>
        <If when={Boolean(localPath)}>
          <Text class="select-text line-clamp-1 font-mono text-[11px] text-dim">
            {localPath}
          </Text>
        </If>
      </View>

      <View class="shrink-0 flex-row items-center gap-2">
        <Button
          onPress={() => void handleOpen()}
          class="flex-row items-center gap-1.5 rounded-md bg-[#2f7cf6] px-3 py-1.5 active:opacity-90"
          accessibilityLabel="Open file"
        >
          <Icon name="play" size={11} color="#ffffff" />
          <Text class="text-xs font-semibold text-white">打开</Text>
        </Button>
        <Button
          onPress={() => props.onOpenFolder(props.entry)}
          class="flex-row items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 active:bg-accent"
          accessibilityLabel="Open containing folder"
        >
          <Icon name="folder" size={13} tone="foreground" />
          <Text class="text-xs font-medium text-foreground">所在位置</Text>
        </Button>
        <If when={Boolean(props.onDeleteEntry)}>
          <Button
            onPress={() => props.onDeleteEntry?.(props.entry)}
            class="h-7 w-7 items-center justify-center rounded-md border border-line bg-well active:bg-accent"
            accessibilityLabel="Delete entry"
          >
            <Icon name="x" size={12} tone="muted-foreground" />
          </Button>
        </If>
      </View>
    </View>
  );
}

/** Picture tile for grade mode. */
export function LibraryGradeCard(props: {
  entry: LibraryEntry;
  onOpenEntry: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onOpenFolder: (entry: LibraryEntry) => void;
  onDeleteEntry?: (entry: LibraryEntry) => void;
}) {
  let thumbRef: ViewRef | null = null;
  const duration = formatDurationMs(props.entry.durationMs);
  const meta = formatEntryDescription(props.entry);

  const handleOpen = async () => {
    let rect: ViewTransitionRect | null = null;
    if (thumbRef) {
      rect = await captureElementRect(thumbRef, 6);
    }
    props.onOpenEntry(props.entry, rect);
  };

  return (
    <View class="w-[144px] items-center gap-1.5 rounded-lg border border-transparent p-2 transition hover:border-line hover:bg-well/70">
      <Button
        ref={(node) => {
          thumbRef = node;
        }}
        onPress={() => void handleOpen()}
        class="relative h-[96px] w-[128px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-line/50 bg-black/75"
        accessibilityLabel={`Open ${props.entry.title}`}
      >
        <Image
          src={videoPosterUrl(props.entry.videoId, props.entry.thumbnailUrl)}
          class="h-full w-full object-cover"
        />
        <View class="absolute inset-0 items-center justify-center bg-black/15 transition hover:bg-black/30">
          <View class="h-6 w-6 items-center justify-center rounded-full bg-black/70">
            <Icon name="play" size={10} color="#fafafa" />
          </View>
        </View>
        <If when={Boolean(duration)}>
          <View class="absolute right-1 bottom-1 rounded bg-black/85 px-1 py-0.5">
            <Text class="font-mono text-[9px] font-medium tabular-nums text-white">
              {duration}
            </Text>
          </View>
        </If>
      </Button>

      <View selectable class="w-full text-center select-text">
        <Text class="select-text line-clamp-2 text-center text-xs font-medium leading-tight text-foreground">
          {props.entry.title}
        </Text>
      </View>

      <Text class="w-full truncate text-center font-mono text-[10px] text-muted-foreground">
        {meta}
      </Text>

      <View class="mt-0.5 flex-row items-center gap-1.5">
        <Button
          onPress={() => void handleOpen()}
          class="rounded bg-[#2f7cf6] px-2 py-0.5 active:opacity-90"
          accessibilityLabel="Open file"
        >
          <Text class="text-[10px] font-semibold text-white">打开</Text>
        </Button>
        <Button
          onPress={() => props.onOpenFolder(props.entry)}
          class="rounded border border-line bg-raised px-1.5 py-0.5 active:bg-accent"
          accessibilityLabel="Open containing folder"
        >
          <Icon name="folder" size={11} tone="foreground" />
        </Button>
        <If when={Boolean(props.onDeleteEntry)}>
          <Button
            onPress={() => props.onDeleteEntry?.(props.entry)}
            class="h-5 w-5 items-center justify-center rounded border border-line bg-well active:bg-accent"
            accessibilityLabel="Delete entry"
          >
            <Icon name="x" size={9} tone="muted-foreground" />
          </Button>
        </If>
      </View>
    </View>
  );
}

/** Large poster card for post mode. */
export function LibraryPostCard(props: {
  entry: LibraryEntry;
  onOpenEntry: (entry: LibraryEntry, originRect?: ViewTransitionRect | null) => void;
  onOpenFolder: (entry: LibraryEntry) => void;
  onDeleteEntry?: (entry: LibraryEntry) => void;
}) {
  let thumbRef: ViewRef | null = null;
  const duration = formatDurationMs(props.entry.durationMs);
  const meta = formatEntryDescription(props.entry);

  const handleOpen = async () => {
    let rect: ViewTransitionRect | null = null;
    if (thumbRef) {
      rect = await captureElementRect(thumbRef, 12);
    }
    props.onOpenEntry(props.entry, rect);
  };

  return (
    <View
      style={{ minWidth: 280 }}
      class="w-full max-w-[460px] flex-1 gap-2.5 rounded-xl border border-line/60 bg-well/15 p-3 transition hover:border-line hover:bg-well/40"
    >
      <Button
        ref={(node) => {
          thumbRef = node;
        }}
        onPress={() => void handleOpen()}
        class="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black"
        accessibilityLabel={`Open ${props.entry.title}`}
      >
        <Image
          src={videoPosterUrl(props.entry.videoId, props.entry.thumbnailUrl)}
          class="h-full w-full object-cover"
        />
        <View class="absolute inset-0 items-center justify-center bg-black/20 transition hover:bg-black/35">
          <View class="h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/70">
            <Icon name="play" size={14} color="#fafafa" />
          </View>
        </View>
        <If when={Boolean(duration)}>
          <View class="absolute right-2.5 bottom-2.5 rounded bg-black/85 px-2 py-0.5">
            <Text class="font-mono text-xs font-medium tabular-nums text-white">
              {duration}
            </Text>
          </View>
        </If>
      </Button>

      <View selectable class="min-w-0 gap-1 select-text">
        <Text class="select-text line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {props.entry.title}
        </Text>

        <View class="flex-row flex-wrap items-center gap-1.5 select-text">
          <Text class="select-text truncate font-mono text-xs text-muted-foreground">
            {meta}
          </Text>
          <If when={Boolean(props.entry.subtitleLabel)}>
            <View
              class={`rounded px-1.5 py-0.5 ${
                props.entry.subtitleIsAuto ? "bg-amber-soft" : "bg-ready-soft"
              }`}
            >
              <Text
                class={`select-text font-mono text-[10px] font-semibold ${
                  props.entry.subtitleIsAuto ? "text-amber" : "text-ready"
                }`}
              >
                {props.entry.subtitleLabel}
              </Text>
            </View>
          </If>
        </View>
      </View>

      <View class="mt-0.5 flex-row items-center justify-between border-t border-line/40 pt-2.5">
        <View class="flex-row items-center gap-2">
          <Button
            onPress={() => void handleOpen()}
            class="flex-row items-center gap-1.5 rounded-md bg-[#2f7cf6] px-3 py-1.5 active:opacity-90"
            accessibilityLabel="Open file"
          >
            <Icon name="play" size={11} color="#ffffff" />
            <Text class="text-xs font-semibold text-white">打开</Text>
          </Button>

          <Button
            onPress={() => props.onOpenFolder(props.entry)}
            class="flex-row items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 active:bg-accent"
            accessibilityLabel="Open containing folder"
          >
            <Icon name="folder" size={13} tone="foreground" />
            <Text class="text-xs font-medium text-foreground">所在位置</Text>
          </Button>
        </View>

        <If when={Boolean(props.onDeleteEntry)}>
          <Button
            onPress={() => props.onDeleteEntry?.(props.entry)}
            class="h-7 w-7 items-center justify-center rounded-md border border-line bg-well active:bg-accent"
            accessibilityLabel="Delete entry"
          >
            <Icon name="x" size={12} tone="muted-foreground" />
          </Button>
        </If>
      </View>
    </View>
  );
}
