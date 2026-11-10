import {
  createMotion,
  effect,
  Image,
  LayoutAnimation,
  Text,
  View,
} from "nsh";
import { Button } from "nsh/base";
import type { ClipboardVideoPreview } from "../clipboard";
import {
  captionTrackBadge,
  captionTrackId,
  cleanCaptionTrackName,
  formatBytes,
  isAutoCaptionTrack,
} from "../youtube/parse";
import type { CaptionTrack, VideoQualityOption } from "../youtube/types";
import { Icon } from "./Icon";

const FALLBACK_QUALITIES: readonly VideoQualityOption[] = [
  {
    id: "1080p",
    label: "1080p",
    mode: "video",
    height: 1080,
    mimeType: "video/mp4",
    ext: "mp4",
  },
  {
    id: "720p",
    label: "720p",
    mode: "video",
    height: 720,
    mimeType: "video/mp4",
    ext: "mp4",
  },
  {
    id: "480p",
    label: "480p",
    mode: "video",
    height: 480,
    mimeType: "video/mp4",
    ext: "mp4",
  },
  {
    id: "360p",
    label: "360p",
    mode: "video",
    height: 360,
    mimeType: "video/mp4",
    ext: "mp4",
  },
  {
    id: "audio",
    label: "Audio (M4A)",
    mode: "audio",
    height: null,
    mimeType: "audio/mp4",
    ext: "m4a",
  },
];

const FALLBACK_TRACKS: readonly CaptionTrack[] = [
  {
    trackId: "en:manual",
    languageCode: "en",
    name: "English",
    baseUrl: "",
    isAuto: false,
  },
  {
    trackId: "en:asr",
    languageCode: "en",
    name: "English (auto-generated)",
    baseUrl: "",
    kind: "asr",
    isAuto: true,
  },
];

/**
 * Downbit-style omnibar dropdown drawer:
 * Slides down directly from the top link input bar.
 * Uses clean CLI shell-style progress text during parsing (no fake progress bar).
 * Primary action is directly Download (or Return ↵ to download).
 */
export function ClipboardCard(props: {
  preview: () => ClipboardVideoPreview;
  loading: () => boolean;
  parsing: () => boolean;
  parseMessage: () => string;
  selectedQualityId: () => string;
  onSelectQuality: (qualityId: string) => void;
  selectedTrackId: () => string | null;
  onSelectTrack: (trackId: string) => void;
  onDownload: (preview: ClipboardVideoPreview) => void;
  onDismiss: () => void;
}) {
  const dropdownMotion = createMotion({
    enter: "fadeInDown",
    duration: 220,
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
    const list = props.preview().qualities;
    return list && list.length > 0 ? list : FALLBACK_QUALITIES;
  };

  const tracks = (): readonly CaptionTrack[] => {
    const list = props.preview().captionTracks;
    return list && list.length > 0 ? list : FALLBACK_TRACKS;
  };

  const manualTrackCount = () =>
    tracks().filter((t) => !isAutoCaptionTrack(t)).length;
  const ccTrackCount = () =>
    tracks().filter((t) => isAutoCaptionTrack(t)).length;

  const isBusy = () => props.parsing() || props.loading();

  return (
    <View
      style={dropdownMotion.style}
      class="gap-3.5 rounded-b-xl border border-t-0 border-line bg-popover px-4 pt-3 pb-4 shadow-xl"
    >
      {/* 1. Top status header: CLI shell style parser status */}
      <View class="flex-row items-center justify-between">
        <View class="flex-row items-center gap-2">
          <Icon
            name={isBusy() ? "loader" : "clipboard"}
            size={13}
            tone={isBusy() ? "amber" : "muted-foreground"}
            class={isBusy() ? "animate-spin" : ""}
          />
          <Text class="text-xs font-medium text-muted-foreground">
            {props.preview().source === "clipboard"
              ? "From your clipboard"
              : "Detected YouTube link"}
          </Text>
          <View class="rounded bg-well px-1.5 py-0.5">
            <Text class="font-mono text-[11px] text-dim">
              {props.preview().videoId}
            </Text>
          </View>

          {/* CLI / Shell style parsing indicator */}
          <If when={isBusy()}>
            <View class="flex-row items-center gap-1.5 rounded-md border border-line bg-well/90 px-2 py-0.5">
              <Text class="font-mono text-xs font-bold text-[#2f7cf6]">❯</Text>
              <Text class="font-mono text-[11px] text-muted-foreground">
                ear parse: {props.parseMessage() || "fetching metadata…"}
              </Text>
            </View>
          </If>
        </View>

        <Button
          onPress={props.onDismiss}
          class="h-6 w-6 items-center justify-center rounded-md active:bg-accent"
          accessibilityLabel="Dismiss"
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

        <View class="min-w-0 flex-1 gap-1">
          <Text class="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {props.preview().title}
          </Text>
          <Text class="text-xs text-muted-foreground">
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
            <View class="rounded bg-well px-2 py-0.5">
              <Text class="font-mono text-[10px] text-muted-foreground">
                人工字幕 {manualTrackCount()} · CC 机翻 {ccTrackCount()}
              </Text>
            </View>
          </View>
        </View>

        {/* Primary Action Button: Download directly, Return ↵ to download */}
        <View class="shrink-0 items-end justify-center gap-1 sm:pl-2">
          <Button
            onPress={() => props.onDownload(props.preview())}
            class="flex-row items-center gap-1.5 rounded-lg bg-[#2f7cf6] px-4 py-2.5 active:opacity-90"
            accessibilityLabel="Download video or audio"
          >
            <If when={props.loading()}>
              <Icon
                name="loader"
                size={14}
                color="#ffffff"
                class="animate-spin"
              />
            </If>
            <If when={!props.loading()}>
              <Icon name="download" size={14} color="#ffffff" />
            </If>
            <Text class="text-sm font-semibold text-white">
              {props.loading() ? "Downloading…" : "Download"}
            </Text>
          </Button>
          <Text class="font-mono text-[11px] text-dim">Return ↵ to download</Text>
        </View>
      </View>

      {/* 3. Resolution / Quality selector + Subtitle selector (Manual vs CC) */}
      <View class="gap-2.5 border-t border-line pt-2.5">
        {/* Quality Row */}
        <View class="flex-col gap-1.5 sm:flex-row sm:items-center">
          <Text class="w-20 shrink-0 font-mono text-[11px] uppercase tracking-wider text-dim">
            Quality
          </Text>
          <View class="flex-row flex-wrap items-center gap-1.5">
            {qualities().map((q) => {
              const selected = () => props.selectedQualityId() === q.id;
              const sizeStr = formatBytes(q.sizeBytes);
              return (
                <Button
                  onPress={() => props.onSelectQuality(q.id)}
                  class={`flex-row items-center gap-1.5 rounded-md border px-2.5 py-1 ${
                    selected()
                      ? "border-[#2f7cf6] bg-[#2f7cf6]/15"
                      : "border-line bg-well active:bg-accent"
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
                    <Text class="font-mono text-[10px] text-dim">
                      {sizeStr}
                    </Text>
                  </If>
                </Button>
              );
            })}
          </View>
        </View>

        {/* Subtitles Row (Manual 人工 vs CC 机器翻译) */}
        <View class="flex-col gap-1.5 sm:flex-row sm:items-start">
          <View class="w-20 shrink-0 pt-1">
            <Text class="font-mono text-[11px] uppercase tracking-wider text-dim">
              Subtitles
            </Text>
          </View>
          <View class="flex-1 flex-row flex-wrap items-center gap-1.5">
            {tracks().map((track) => {
              const id = captionTrackId(track);
              const badge = captionTrackBadge(track);
              const selected = () => props.selectedTrackId() === id;
              const isManual = badge.kind === "manual";
              return (
                <Button
                  onPress={() => props.onSelectTrack(id)}
                  class={`flex-row items-center gap-1.5 rounded-md border px-2.5 py-1 ${
                    selected()
                      ? "border-[#2f7cf6] bg-[#2f7cf6]/15"
                      : "border-line bg-well active:bg-accent"
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
                      isManual ? "bg-ready-soft" : "bg-amber-soft"
                    }`}
                  >
                    <Text
                      class={`font-mono text-[10px] font-semibold ${
                        isManual ? "text-ready" : "text-amber"
                      }`}
                    >
                      {badge.shortLabel}
                    </Text>
                  </View>
                </Button>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}
