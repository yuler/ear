import { Text, View } from "nsh";
import { Button, Select } from "nsh/base";
import { availableQualityIds } from "../appPreview";
import type { ClipboardVideoPreview } from "../clipboard";
import {
  captionTrackId,
  cleanCaptionTrackName,
  formatBytes,
  isAutoCaptionTrack,
} from "../youtube/parse";
import type { CaptionTrack } from "../youtube/types";
import { Icon } from "./Icon";
import { shellT } from "./shellI18n";

/** "English (manual)" / "English (auto)". */
export function trackTitle(track: CaptionTrack): string {
  const t = shellT();
  return `${cleanCaptionTrackName(track)} (${isAutoCaptionTrack(track) ? t.auto : t.manual})`;
}

function qualityTitle(preview: ClipboardVideoPreview, id: string): string {
  const base = id === "audio" ? shellT().audioOnly : id;
  const size = formatBytes(preview.qualities?.find((q) => q.id === id)?.sizeBytes);
  return size ? `${base} · ${size}` : base;
}

function SelectTrigger(props: { label: string; disabled?: boolean }) {
  return (
    <View
      class={`h-8 min-w-0 flex-row items-center gap-1.5 rounded-md border border-line bg-well px-2.5 ${
        props.disabled ? "opacity-60" : "hover:bg-accent"
      }`}
    >
      <Text class="min-w-0 flex-1 truncate text-xs text-foreground">
        {props.label}
      </Text>
      <Text class="text-[10px] text-muted-foreground">▾</Text>
    </View>
  );
}

/**
 * The parsed link's card, shown under the link field: a quality dropdown
 * (audio only included), a subtitle dropdown collapsed to one line, and
 * Download.
 */
export function ClipboardCard(props: {
  preview: () => ClipboardVideoPreview;
  parsing: () => boolean;
  selectedQualityId: () => string;
  onSelectQuality: (qualityId: string) => void;
  selectedTrackId: () => string | null;
  onSelectTrack: (trackId: string) => void;
  onDownload: (preview: ClipboardVideoPreview) => void;
  onDismiss: () => void;
}) {
  const tracks = (): CaptionTrack[] => props.preview().captionTracks ?? [];
  const busy = () => props.parsing() || !props.preview().isParsed;

  const qualityItems = () =>
    availableQualityIds(props.preview()).map((id) => ({
      value: id,
      title: qualityTitle(props.preview(), id),
    }));

  const trackItems = () =>
    tracks().map((track) => ({
      value: captionTrackId(track),
      title: trackTitle(track),
    }));

  const trackLabel = () => {
    const t = shellT();
    if (busy()) return t.subtitlesLabel("…");
    const id = props.selectedTrackId();
    const track = tracks().find((x) => captionTrackId(x) === id);
    return t.subtitlesLabel(track ? trackTitle(track) : t.noSubtitles);
  };

  return (
    <View class="w-full gap-2.5 p-3">
      <View class="flex-row items-center gap-2">
        <If when={busy()}>
          <Icon name="loader" size={12} tone="muted-foreground" class="animate-spin" />
        </If>
        <Text class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {busy() && props.preview().source !== "discover"
            ? shellT().parsing
            : props.preview().title}
        </Text>
        <Button
          onPress={props.onDismiss}
          class="h-6 w-6 items-center justify-center rounded-md active:bg-accent"
          accessibilityLabel={shellT().dismiss}
        >
          <Icon name="x" size={12} tone="muted-foreground" />
        </Button>
      </View>

      <View class="flex-row items-center gap-2">
        <View class="w-[132px] shrink-0">
          <Select
            items={qualityItems()}
            value={props.selectedQualityId()}
            onChange={(e) => {
              if (e.value) props.onSelectQuality(e.value);
            }}
            accessibilityLabel={shellT().quality}
            trigger={
              <SelectTrigger
                label={qualityTitle(props.preview(), props.selectedQualityId())}
              />
            }
          />
        </View>
        <View class="min-w-0 flex-1">
          <Select
            items={trackItems()}
            value={props.selectedTrackId()}
            disabled={busy() || tracks().length === 0}
            onChange={(e) => {
              if (e.value) props.onSelectTrack(e.value);
            }}
            accessibilityLabel={shellT().subtitles}
            trigger={
              <SelectTrigger
                label={trackLabel()}
                disabled={busy() || tracks().length === 0}
              />
            }
          />
        </View>
        <Button
          onPress={() => props.onDownload(props.preview())}
          class="h-8 shrink-0 flex-row items-center gap-1.5 rounded-md bg-brand px-3 active:opacity-90"
          accessibilityLabel={shellT().download}
        >
          <Icon name="download" size={13} tone="brand-foreground" />
          <Text class="text-xs font-semibold text-brand-foreground">
            {shellT().download}
          </Text>
        </Button>
      </View>
    </View>
  );
}
