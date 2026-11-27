import { Clipboard, Scroll, signal, Text, View } from "nsh";
import { Button, Dialog } from "nsh/base";
import { Haptics } from "nsh/mobile";
import { copyFor, type Locale } from "../i18n";
import { formatStorageDisplayPath } from "../mirror/storage";
import type { MirrorItemView } from "../mirror/types";
import { formatSentenceTime, type CaptionCue, type Sentence } from "../player/captions";
import { playerCopyFor } from "../player/playerI18n";
import {
  formatBytesShort,
  formatDurationMs,
  IosGroupedRow,
  IosGroupedSection,
  IosSegmented,
  IosStatusBadge,
} from "../ui/IosPrimitives";

function CopyablePathBlock(props: {
  label: string;
  fullPath: string | null;
  emptyText: string;
  copyLabel: string;
  copiedLabel: string;
  showDivider?: boolean;
}) {
  const copied = signal(false);
  const handleCopy = async () => {
    if (!props.fullPath) return;
    Haptics.selection();
    try {
      await Clipboard.writeText(props.fullPath);
      copied.set(true);
      setTimeout(() => copied.set(false), 1600);
    } catch {
      // ignore clipboard errors in headless tests
    }
  };

  return (
    <View class="flex-col">
      <View class="flex-col gap-1.5 px-4 py-3">
        <View class="flex-row items-center justify-between gap-3">
          <Text class="text-[15px] font-medium text-foreground">{props.label}</Text>
          {props.fullPath ? (
            <Button
              onPress={() => void handleCopy()}
              class="rounded-full bg-tint-soft px-2.5 py-1 active:opacity-70"
            >
              <Text class="text-xs font-semibold text-tint">
                {copied() ? props.copiedLabel : props.copyLabel}
              </Text>
            </Button>
          ) : null}
        </View>
        {props.fullPath ? (
          <>
            <Text class="font-mono text-xs text-muted-foreground">
              {formatStorageDisplayPath(props.fullPath)}
            </Text>
            <Text class="font-mono text-[11px] leading-relaxed text-dim">
              {props.fullPath}
            </Text>
          </>
        ) : (
          <Text class="text-xs text-muted-foreground">{props.emptyText}</Text>
        )}
      </View>
      {props.showDivider ? <View class="ml-4 h-[1px] bg-line/60" /> : null}
    </View>
  );
}

/** Page-sheet inspecting an offline video's local file path, captions path, format, and digest. */
export function VideoInfoSheet(props: {
  open: () => boolean;
  item: () => MirrorItemView | null;
  resolvedMediaPath: () => string | null;
  locale: () => Locale;
  onClose: () => void;
}) {
  const c = () => copyFor(props.locale());
  const pc = () => playerCopyFor(props.locale());
  const copiedSha = signal(false);

  const mediaPath = () => props.resolvedMediaPath() ?? props.item()?.localPath ?? null;

  const copySha = async () => {
    const sha = props.item()?.contentSha256;
    if (!sha) return;
    Haptics.selection();
    try {
      await Clipboard.writeText(sha);
      copiedSha.set(true);
      setTimeout(() => copiedSha.set(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog
      open={props.open()}
      presentation="pageSheet"
      closeOnSwipe
      closeOnBackdropPress
      onOpenChange={(e) => {
        if (!e.open) props.onClose();
      }}
      accessibilityLabel={pc().videoInfoTitle}
    >
      {props.item() ? (
        <View class="flex-1 flex-col bg-background">
          <View class="items-center pt-2.5 pb-1">
            <View class="h-1 w-9 rounded-full bg-dim/50" />
          </View>
          <View class="flex-row items-center justify-between border-b border-line/60 px-4 py-3">
            <View class="w-12" />
            <Text class="text-[17px] font-semibold text-foreground">
              {pc().videoInfoTitle}
            </Text>
            <Button
              onPress={props.onClose}
              class="min-w-[48px] items-end py-1 active:opacity-60"
            >
              <Text class="text-[16px] font-semibold text-tint">{c().done}</Text>
            </Button>
          </View>

          <Scroll class="flex-1">
            <View class="flex-col gap-5 p-4 pb-10">
              <View class="flex-col gap-2 rounded-2xl border border-line/60 bg-card p-4">
                <View class="flex-row items-center gap-2">
                  <IosStatusBadge label={c().badgeReady} tone="ready" />
                  {formatDurationMs(props.item()!.durationMs) ? (
                    <Text class="font-mono text-xs text-muted-foreground">
                      {formatDurationMs(props.item()!.durationMs)}
                    </Text>
                  ) : null}
                </View>
                <Text class="text-[16px] font-semibold leading-snug text-foreground">
                  {props.item()!.title}
                </Text>
              </View>

              <IosGroupedSection>
                <IosGroupedRow
                  title={pc().fileStatusLabel}
                  showDivider
                  trailing={
                    <Text class="text-xs font-medium text-ready">
                      {props.item()!.isChunkedUnmerged && !props.resolvedMediaPath()
                        ? pc().fileStatusChunked
                        : pc().fileStatusReadySingle}
                    </Text>
                  }
                />
                <CopyablePathBlock
                  label={pc().videoFilePathLabel}
                  fullPath={mediaPath()}
                  emptyText={pc().notAvailable}
                  copyLabel={pc().copyPath}
                  copiedLabel={pc().copied}
                  showDivider
                />
                <CopyablePathBlock
                  label={pc().captionsFilePathLabel}
                  fullPath={props.item()!.captionsPath}
                  emptyText={c().captionsUnavailable}
                  copyLabel={pc().copyPath}
                  copiedLabel={pc().copied}
                />
              </IosGroupedSection>

              <IosGroupedSection>
                <IosGroupedRow
                  title={c().localFileSize}
                  showDivider
                  trailing={
                    <Text class="font-mono text-sm text-muted-foreground">
                      {formatBytesShort(props.item()!.sizeBytes)}
                    </Text>
                  }
                />
                <IosGroupedRow
                  title={pc().mediaFormatLabel}
                  showDivider
                  trailing={
                    <Text class="font-mono text-xs text-muted-foreground">
                      {`${props.item()!.mediaExt.toUpperCase()} · ${props.item()!.mimeType}`}
                    </Text>
                  }
                />
                <IosGroupedRow
                  title={c().sourceComputers}
                  showDivider={Boolean(props.item()!.contentSha256)}
                  trailing={
                    <Text class="text-sm text-muted-foreground">
                      {props.item()!.sources.length > 0
                        ? props.item()!.sources.map((s) => s.shortName).join(" · ")
                        : props.item()!.fallbackSourceShortName ?? c().fromGonePc}
                    </Text>
                  }
                />
                {props.item()!.contentSha256 ? (
                  <IosGroupedRow
                    title={pc().sha256Label}
                    subtitle={props.item()!.contentSha256!.slice(0, 24) + "…"}
                    trailing={
                      <Button
                        onPress={() => void copySha()}
                        class="rounded-full bg-tint-soft px-2.5 py-1 active:opacity-70"
                      >
                        <Text class="text-xs font-semibold text-tint">
                          {copiedSha() ? pc().copied : pc().copyPath}
                        </Text>
                      </Button>
                    }
                  />
                ) : null}
              </IosGroupedSection>
            </View>
          </Scroll>
        </View>
      ) : null}
    </Dialog>
  );
}

/** Page-sheet inspecting raw caption cues or segmented sentences. */
export function RawSubtitlesSheet(props: {
  open: () => boolean;
  cues: () => CaptionCue[];
  sentences: () => Sentence[];
  locale: () => Locale;
  onClose: () => void;
}) {
  const c = () => copyFor(props.locale());
  const pc = () => playerCopyFor(props.locale());
  const tab = signal<"sentences" | "cues">("sentences");

  const tabOptions = () => [
    { value: "sentences" as const, label: `${pc().sentencesTab} (${props.sentences().length})` },
    { value: "cues" as const, label: `${pc().rawCuesTab} (${props.cues().length})` },
  ];

  return (
    <Dialog
      open={props.open()}
      presentation="pageSheet"
      closeOnSwipe
      closeOnBackdropPress
      onOpenChange={(e) => {
        if (!e.open) props.onClose();
      }}
      accessibilityLabel={pc().rawSubtitles}
    >
      <View class="flex-1 flex-col bg-background">
        <View class="items-center pt-2.5 pb-1">
          <View class="h-1 w-9 rounded-full bg-dim/50" />
        </View>
        <View class="flex-row items-center justify-between border-b border-line/60 px-4 py-3">
          <View class="w-12" />
          <Text class="text-[17px] font-semibold text-foreground">{pc().rawSubtitles}</Text>
          <Button onPress={props.onClose} class="min-w-[48px] items-end py-1 active:opacity-60">
            <Text class="text-[16px] font-semibold text-tint">{c().done}</Text>
          </Button>
        </View>

        <View class="px-4 pt-3 pb-2">
          <IosSegmented options={tabOptions()} value={() => tab()} onChange={(v) => tab.set(v)} />
        </View>

        <Scroll class="flex-1">
          <View class="flex-col gap-2 px-4 pt-1 pb-10">
            {tab() === "sentences" ? (
              props.sentences().length === 0 ? (
                <Text class="py-8 text-center text-sm text-muted-foreground">
                  {pc().rawSubtitlesEmpty}
                </Text>
              ) : (
                props.sentences().map((s) => (
                  <View class="flex-row items-start gap-2.5 rounded-xl border border-line/60 bg-card px-3 py-2.5">
                    <Text class="w-11 shrink-0 font-mono text-[11px] text-dim">
                      {formatSentenceTime(s.startMs)}
                    </Text>
                    <Text class="min-w-0 flex-1 text-sm leading-snug text-foreground">
                      {s.text}
                    </Text>
                  </View>
                ))
              )
            ) : props.cues().length === 0 ? (
              <Text class="py-8 text-center text-sm text-muted-foreground">
                {pc().rawSubtitlesEmpty}
              </Text>
            ) : (
              props.cues().map((cue) => (
                <View class="flex-row items-start gap-2.5 rounded-xl border border-line/60 bg-card px-3 py-2">
                  <Text class="w-11 shrink-0 font-mono text-[11px] text-dim">
                    {formatSentenceTime(cue.startMs)}
                  </Text>
                  <Text class="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                    {cue.text}
                  </Text>
                </View>
              ))
            )}
          </View>
        </Scroll>
      </View>
    </Dialog>
  );
}
