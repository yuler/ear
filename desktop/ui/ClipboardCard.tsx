import { createMotion, effect, Image, LayoutAnimation, Text, View } from "nsh";
import { Button, Select } from "nsh/base";
import { QUALITY_IDS } from "../appPreview";
import type { ClipboardVideoPreview } from "../clipboard";
import {
  captionTrackBadge,
  captionTrackId,
  cleanCaptionTrackName,
  formatBytes,
  isAutoCaptionTrack,
  selectDisplayCaptionTracks,
} from "../youtube/parse";
import type { CaptionTrack, VideoQualityOption } from "../youtube/types";
import { Icon } from "./Icon";
import { shellT } from "./shellI18n";

const FALLBACK_QUALITIES: readonly VideoQualityOption[] = [
  { id: "360p", label: "360p", mode: "video", height: 360, mimeType: "video/mp4", ext: "mp4" },
  { id: "720p", label: "720p", mode: "video", height: 720, mimeType: "video/mp4", ext: "mp4" },
  { id: "1080p", label: "1080p", mode: "video", height: 1080, mimeType: "video/mp4", ext: "mp4" },
  { id: "audio", label: "Audio (M4A)", mode: "audio", height: null, mimeType: "audio/mp4", ext: "m4a" },
];

const FALLBACK_TRACKS: readonly CaptionTrack[] = [
  { trackId: "en:manual", languageCode: "en", name: "English", baseUrl: "", isAuto: false },
  {
    trackId: "en:asr",
    languageCode: "en",
    name: "English (auto-generated)",
    baseUrl: "",
    kind: "asr",
    isAuto: true,
  },
];

export const MAX_INLINE_SUBTITLES = 3;

/** "English (manual)" / "English (auto)". */
export function trackTitle(track: CaptionTrack): string {
  const t = shellT();
  return `${cleanCaptionTrackName(track)} (${isAutoCaptionTrack(track) ? t.auto : t.manual})`;
}

/**
 * Splits prioritized subtitle tracks into at most `maxVisible` inline pills
 * (always keeping the currently selected track visible) and the overflow list
 * shown inside the "..." Select dropdown.
 */
export function partitionSubtitleTracks(
  tracks: readonly CaptionTrack[],
  selectedTrackId: string | null,
  maxVisible = MAX_INLINE_SUBTITLES,
): { primary: CaptionTrack[]; overflow: CaptionTrack[] } {
  if (tracks.length <= maxVisible) {
    return { primary: [...tracks], overflow: [] };
  }
  const selectedIdx = selectedTrackId
    ? tracks.findIndex((t) => captionTrackId(t) === selectedTrackId)
    : -1;

  if (selectedIdx < maxVisible) {
    return {
      primary: tracks.slice(0, maxVisible),
      overflow: tracks.slice(maxVisible),
    };
  }

  const primary = [
    ...tracks.slice(0, maxVisible - 1),
    tracks[selectedIdx]!,
  ];
  const overflow = tracks.filter(
    (_, idx) => idx >= maxVisible - 1 && idx !== selectedIdx,
  );
  return { primary, overflow };
}

/**
 * Downbit-style omnibar dropdown card: video summary with poster & Download
 * action, followed by selectable Quality and Subtitle pill rows.
 */
export function ClipboardCard(props: {
  preview: () => ClipboardVideoPreview;
  parsing: () => boolean;
  parseMessage?: () => string;
  selectedQualityId: () => string;
  onSelectQuality: (qualityId: string) => void;
  selectedTrackId: () => string | null;
  onSelectTrack: (trackId: string) => void;
  onDownload: (preview: ClipboardVideoPreview) => void;
  onDismiss: () => void;
}) {
  const dropdownMotion = createMotion({
    enter: "fadeInDown",
    duration: 180,
  });

  effect(() => {
    const _parsed = props.preview().isParsed;
    const _parsing = props.parsing();
    try {
      LayoutAnimation.easeInEaseOut();
    } catch {
      // ignore on test host
    }
  });

  const qualities = (): readonly VideoQualityOption[] => {
    const list = props.preview().qualities ?? [];
    const allowed = new Set<string>(QUALITY_IDS);
    const filtered = list.filter((q) => allowed.has(q.id));
    return filtered.length > 0 ? filtered : FALLBACK_QUALITIES;
  };

  const rawTracks = (): readonly CaptionTrack[] => {
    const list = props.preview().captionTracks;
    return list && list.length > 0 ? list : FALLBACK_TRACKS;
  };

  const orderedTracks = (): readonly CaptionTrack[] =>
    selectDisplayCaptionTracks(rawTracks(), {
      selectedTrackId: props.selectedTrackId(),
      title: props.preview().title,
      includeAll: true,
    }).visible;

  const partitioned = () =>
    partitionSubtitleTracks(orderedTracks(), props.selectedTrackId());
  const primaryTracks = (): readonly CaptionTrack[] => partitioned().primary;
  const overflowTracks = (): readonly CaptionTrack[] => partitioned().overflow;
  const overflowItems = () =>
    overflowTracks().map((track) => ({
      value: captionTrackId(track),
      title: `${cleanCaptionTrackName(track)} · ${captionTrackBadge(track).shortLabel}`,
    }));

  const manualTrackCount = () =>
    rawTracks().filter((t) => !isAutoCaptionTrack(t)).length;
  const ccTrackCount = () =>
    rawTracks().filter((t) => isAutoCaptionTrack(t)).length;

  const isBusy = () => props.parsing();
  const isParsing = () => props.parsing() || !props.preview().isParsed;

  const sourceLabel = () => {
    const src = props.preview().source;
    if (src === "clipboard") return "From your clipboard";
    if (src === "discover") return "From Discover";
    return "Detected YouTube link";
  };

  return (
    <View style={dropdownMotion.style} class="w-full gap-3.5 px-4 pt-3 pb-4">
      {/* 1. Top status header: source + videoId + CLI parse indicator */}
      <View class="flex-row items-center justify-between gap-2">
        <View class="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
          <Icon
            name={isBusy() ? "loader" : props.preview().source === "discover" ? "compass" : "clipboard"}
            size={13}
            tone={isBusy() ? "brand" : "muted-foreground"}
            class={isBusy() ? "animate-spin" : ""}
          />
          <Text class="text-xs font-medium text-muted-foreground">
            {sourceLabel()}
          </Text>
          <View selectable class="rounded bg-well px-1.5 py-0.5 select-text">
            <Text class="select-text font-mono text-[11px] text-dim">
              {props.preview().videoId}
            </Text>
          </View>

          <If when={isBusy()}>
            <View class="flex-row items-center gap-1.5 rounded-md border border-line bg-well/90 px-2 py-0.5">
              <Text class="font-mono text-xs font-bold text-brand">❯</Text>
              <Text class="font-mono text-[11px] text-muted-foreground">
                ear parse: {props.parseMessage?.() || "fetching metadata…"}
              </Text>
            </View>
          </If>
        </View>

        <Button
          onPress={props.onDismiss}
          class="h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-well active:bg-accent"
          accessibilityLabel={shellT().dismiss}
        >
          <Icon name="x" size={14} tone="muted-foreground" />
        </Button>
      </View>

      {/* 2. Video summary row: Thumbnail + Title/Channel + Download button */}
      <View class="flex-col gap-3.5 sm:flex-row sm:items-center">
        <View class="relative h-[88px] w-full shrink-0 overflow-hidden rounded-lg border border-line bg-well sm:w-[156px]">
          <Image
            src={props.preview().thumbnailUrl}
            class="h-full w-full object-cover"
          />
          <View class="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5">
            <Text class="font-mono text-[11px] font-medium tabular-nums text-white">
              {props.preview().durationLabel}
            </Text>
          </View>
        </View>

        <View selectable class="min-w-0 flex-1 gap-1 select-text">
          <Text class="select-text line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {props.preview().title}
          </Text>
          <Text class="select-text text-xs text-muted-foreground">
            {props.preview().channel}
          </Text>
          <View class="flex-row flex-wrap items-center gap-1.5 pt-0.5">
            <View class="rounded bg-well px-2 py-0.5">
              <Text class="font-mono text-[10px] text-muted-foreground">
                {props.selectedQualityId() === "audio"
                  ? "M4A Audio"
                  : `${props.selectedQualityId()} MP4`}
              </Text>
            </View>
            <If when={!isParsing()}>
              <View class="rounded bg-well px-2 py-0.5">
                <Text class="font-mono text-[10px] text-muted-foreground">
                  人工字幕 {manualTrackCount()} · 原始 CC {ccTrackCount()}
                </Text>
              </View>
            </If>
            <If when={isParsing()}>
              <View class="flex-row items-center gap-1 rounded bg-well px-2 py-0.5">
                <Icon name="loader" size={10} tone="primary" class="animate-spin" />
                <Text class="font-mono text-[10px] text-muted-foreground">
                  字幕解析中…
                </Text>
              </View>
            </If>
          </View>
        </View>

        <View class="shrink-0 items-end justify-center gap-1.5 sm:pl-2">
          <Button
            onPress={() => props.onDownload(props.preview())}
            class="flex-row items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 shadow-[0_0_14px_rgba(47,124,246,0.4)] ring-2 ring-brand/60 transition active:opacity-90"
            accessibilityLabel={shellT().download}
          >
            <Icon name="download" size={14} color="#ffffff" />
            <Text class="text-sm font-semibold text-white">
              {shellT().download}
            </Text>
          </Button>
          <View class="flex-row items-center gap-1">
            <View class="rounded border border-line bg-well px-1 py-0.5 shadow-xs">
              <Text class="font-mono text-[10px] font-semibold text-foreground">↵</Text>
            </View>
            <Text class="font-mono text-[11px] text-dim">Return ↵ to download</Text>
          </View>
        </View>
      </View>

      {/* 3. Resolution / Quality selector + Subtitle selector */}
      <View class="gap-2.5 border-t border-line pt-2.5">
        {/* Quality Row */}
        <View class="flex-col gap-1.5 sm:flex-row sm:items-center">
          <Text class="w-20 shrink-0 font-mono text-[11px] uppercase tracking-wider text-dim">
            {shellT().quality}
          </Text>
          <If when={isParsing()}>
            <View class="flex-row flex-wrap items-center gap-2">
              <View class="flex-row items-center gap-1.5">
                <View class="h-6 w-14 animate-pulse rounded-md border border-line bg-well/70" />
                <View class="h-6 w-14 animate-pulse rounded-md border border-line bg-well/70" />
                <View class="h-6 w-14 animate-pulse rounded-md border border-line bg-well/70" />
                <View class="h-6 w-18 animate-pulse rounded-md border border-line bg-well/70" />
              </View>
              <View class="flex-row items-center gap-1 pl-1">
                <Icon name="loader" size={12} tone="primary" class="animate-spin" />
                <Text class="font-mono text-[11px] text-muted-foreground">
                  {props.parseMessage?.() || "解析清晰度…"}
                </Text>
              </View>
            </View>
          </If>
          <If when={!isParsing()}>
            <View class="flex-row flex-wrap items-center gap-1.5">
              {qualities().map((q) => {
                const selected = () => props.selectedQualityId() === q.id;
                const sizeStr = formatBytes(q.sizeBytes);
                return (
                  <Button
                    onPress={() => props.onSelectQuality(q.id)}
                    class={`flex-row items-center gap-1.5 rounded-md border px-2.5 py-1 transition ${
                      selected()
                        ? "border-brand bg-brand-soft"
                        : "border-line bg-well hover:bg-accent active:bg-accent"
                    }`}
                  >
                    <Text
                      class={`font-mono text-xs ${
                        selected()
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {q.label}
                    </Text>
                    <If when={Boolean(sizeStr)}>
                      <Text class="font-mono text-[10px] text-dim">{sizeStr}</Text>
                    </If>
                  </Button>
                );
              })}
            </View>
          </If>
        </View>

        {/* Subtitles Row */}
        <View class="flex-col gap-1.5 sm:flex-row sm:items-center">
          <Text class="w-20 shrink-0 font-mono text-[11px] uppercase tracking-wider text-dim">
            {shellT().subtitles}
          </Text>
          <If when={isParsing()}>
            <View class="flex-row flex-wrap items-center gap-2 pt-0.5">
              <View class="flex-row items-center gap-1.5">
                <View class="h-6 w-20 animate-pulse rounded-md border border-line bg-well/70" />
                <View class="h-6 w-24 animate-pulse rounded-md border border-line bg-well/70" />
                <View class="h-6 w-20 animate-pulse rounded-md border border-line bg-well/70" />
              </View>
              <View class="flex-row items-center gap-1 pl-1">
                <Icon name="loader" size={12} tone="primary" class="animate-spin" />
                <Text class="font-mono text-[11px] text-muted-foreground">
                  提取字幕轨…
                </Text>
              </View>
            </View>
          </If>
          <If when={!isParsing()}>
            <View class="min-w-0 flex-1 flex-row flex-wrap items-center gap-1.5">
              {primaryTracks().map((track) => {
                const id = captionTrackId(track);
                const badge = captionTrackBadge(track);
                const selected = () => props.selectedTrackId() === id;
                const isManual = badge.kind === "manual";
                return (
                  <Button
                    onPress={() => props.onSelectTrack(id)}
                    class={`shrink-0 flex-row items-center gap-1.5 rounded-md border px-2.5 py-1 transition ${
                      selected()
                        ? "border-brand bg-brand-soft"
                        : "border-line bg-well hover:bg-accent active:bg-accent"
                    }`}
                  >
                    <Text
                      class={`text-xs ${
                        selected()
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {cleanCaptionTrackName(track)}
                    </Text>
                    <View
                      class={`rounded px-1.5 py-0.5 ${
                        isManual ? "bg-brand-soft" : "bg-well"
                      }`}
                    >
                      <Text
                        class={`font-mono text-[10px] font-semibold ${
                          isManual ? "text-brand" : "text-muted-foreground"
                        }`}
                      >
                        {badge.shortLabel}
                      </Text>
                    </View>
                  </Button>
                );
              })}

              <If when={overflowTracks().length > 0}>
                <Select
                  items={overflowItems()}
                  value={null}
                  searchable={overflowTracks().length > 6}
                  searchPlaceholder={shellT().subtitles}
                  placement="bottom"
                  align="start"
                  offset={4}
                  onChange={(e) => {
                    if (e.value) props.onSelectTrack(e.value);
                  }}
                  accessibilityLabel={shellT().moreSubtitles(overflowTracks().length)}
                  popupClass="w-[260px] rounded-xl border border-line bg-popover p-1 shadow-2xl"
                  listClass="max-h-[240px]"
                  searchClass="mb-1 h-7 rounded-md border border-line bg-well px-2 text-xs text-foreground placeholder:text-dim"
                  itemClass="rounded-md px-2.5 py-1.5 text-xs text-foreground focus:bg-well selected:bg-brand-soft selected:font-semibold selected:text-brand"
                  trigger={
                    <View class="shrink-0 flex-row items-center justify-center rounded-md border border-dashed border-line bg-well/60 px-2.5 py-1 transition hover:bg-well active:bg-accent">
                      <Text class="font-mono text-xs font-medium text-muted-foreground">
                        ...
                      </Text>
                    </View>
                  }
                />
              </If>
            </View>
          </If>
        </View>
      </View>
    </View>
  );
}
