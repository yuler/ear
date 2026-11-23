import { Text, View } from "nsh";
import { Button, Dialog } from "nsh/base";
import { copyFor, type Locale } from "../i18n";
import type { MirrorItemView } from "../mirror/types";
import {
  formatBytesShort,
  formatDurationMs,
  IosGroupedRow,
  IosGroupedSection,
  IosStatusBadge,
} from "../ui/IosPrimitives";

/** Clean iOS page-sheet preview for an offline-ready mirrored video. */
export function OfflinePreviewSheet(props: {
  item: () => MirrorItemView | null;
  locale: () => Locale;
  onClose: () => void;
}) {
  const c = () => copyFor(props.locale());

  return (
    <Dialog
      open={props.item() !== null}
      presentation="pageSheet"
      closeOnSwipe
      closeOnBackdropPress
      onOpenChange={(e) => {
        if (!e.open) props.onClose();
      }}
      accessibilityLabel={c().offlinePreviewTitle}
    >
      {props.item() ? (
        <View class="flex-1 flex-col bg-background">
          {/* iOS Sheet Grabber + Header */}
          <View class="items-center pt-2.5 pb-1">
            <View class="h-1 w-9 rounded-full bg-dim/50" />
          </View>
          <View class="flex-row items-center justify-between px-4 py-3 border-b border-line/60">
            <View class="w-12" />
            <Text class="text-[17px] font-semibold text-foreground">
              {c().offlinePreviewTitle}
            </Text>
            <Button
              onPress={props.onClose}
              class="min-w-[48px] items-end py-1 active:opacity-60"
            >
              <Text class="text-[16px] font-semibold text-tint">{c().done}</Text>
            </Button>
          </View>

          <View class="flex-1 flex-col gap-5 p-4">
            {/* Hero Summary Card */}
            <View class="flex-col gap-2.5 rounded-2xl bg-card border border-line/60 p-4">
              <View class="flex-row items-center gap-2">
                <IosStatusBadge label={c().badgeReady} tone="ready" />
                {formatDurationMs(props.item()!.durationMs) ? (
                  <Text class="font-mono text-xs text-muted-foreground">
                    {formatDurationMs(props.item()!.durationMs)}
                  </Text>
                ) : null}
              </View>
              <Text class="text-[17px] font-semibold leading-snug text-foreground">
                {props.item()!.title}
              </Text>
              <Text class="text-[13px] leading-relaxed text-muted-foreground">
                {c().offlinePreviewBody}
              </Text>
            </View>

            {/* Offline Metadata */}
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
                title={c().captionsStatus}
                showDivider
                trailing={
                  <Text class="text-sm text-muted-foreground">
                    {props.item()!.hasCaptions
                      ? c().captionsIncluded
                      : c().captionsUnavailable}
                  </Text>
                }
              />
              <IosGroupedRow
                title={c().sourceComputers}
                trailing={
                  <Text class="text-sm text-muted-foreground">
                    {props.item()!.sources.length > 0
                      ? props.item()!.sources.map((s) => s.shortName).join(" · ")
                      : props.item()!.fallbackSourceShortName ?? c().fromGonePc}
                  </Text>
                }
              />
            </IosGroupedSection>
          </View>
        </View>
      ) : null}
    </Dialog>
  );
}
