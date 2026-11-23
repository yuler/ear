import { Image, safeArea, Scroll, Text, View } from "nsh";
import { Button, NavPage, Progress } from "nsh/base";
import { Haptics } from "nsh/mobile";
import { copyFor, type Locale } from "../i18n";
import type { MirrorEngine } from "../mirror/engine";
import type { MirrorItemView } from "../mirror/types";
import {
  formatBytesShort,
  formatDurationMs,
  IosStatusBadge,
} from "../ui/IosPrimitives";

function SyncStatusBanner(props: {
  engine: MirrorEngine;
  locale: () => Locale;
}) {
  const c = () => copyFor(props.locale());
  const stats = () => props.engine.stats();
  const onlineMacs = () =>
    props.engine.macs().filter((m) => props.engine.isMacOnline(m.id));
  const onlineNames = () => onlineMacs().map((m) => m.name).join("、");

  if (props.engine.macs().length === 0) return null;

  if (props.engine.storagePaused()) {
    return (
      <View class="flex-col gap-2.5 rounded-2xl bg-danger-soft border border-destructive/30 p-4">
        <View class="flex-row items-center justify-between gap-3">
          <View class="min-w-0 flex-1 gap-0.5">
            <Text class="text-[15px] font-semibold text-destructive">
              {c().storagePausedTitle}
            </Text>
            <Text class="text-xs leading-relaxed text-destructive/80">
              {c().storagePausedDesc}
            </Text>
          </View>
          <Button
            onPress={() => {
              Haptics.impact("light");
              props.engine.resumeAfterStorageError();
            }}
            class="rounded-full bg-destructive px-3.5 py-1.5 active:opacity-80"
          >
            <Text class="text-xs font-semibold text-white">
              {c().resumeSync}
            </Text>
          </Button>
        </View>
      </View>
    );
  }

  const isOffline = () => onlineMacs().length === 0;
  const isSyncing = () => !isOffline() && !stats().complete;
  const pct = () => Math.round(stats().overallProgress * 100);

  return (
    <View class="flex-col gap-2.5 rounded-2xl bg-card border border-line/60 p-4">
      <View class="flex-row items-center justify-between gap-3">
        <View class="min-w-0 flex-1 flex-row items-center gap-3">
          <View
            class={`h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              isOffline()
                ? "bg-well"
                : isSyncing()
                  ? "bg-tint-soft"
                  : "bg-ready-soft"
            }`}
          >
            <Text
              class={`text-base font-bold ${
                isOffline()
                  ? "text-muted-foreground"
                  : isSyncing()
                    ? "text-tint"
                    : "text-ready"
              }`}
            >
              {isOffline() ? "○" : isSyncing() ? "↻" : "✓"}
            </Text>
          </View>

          <View class="min-w-0 flex-1 gap-0.5">
            <Text class="text-[15px] font-semibold text-foreground">
              {isOffline()
                ? c().offlineTitle
                : isSyncing()
                  ? c().syncingTitle(
                      stats().ready,
                      stats().reachableWanted,
                      Math.max(1, stats().syncing),
                    )
                  : c().syncedTitle(onlineNames())}
            </Text>
            <Text class="text-xs text-muted-foreground">
              {isOffline()
                ? c().offlineDesc
                : isSyncing()
                  ? c().syncingFrom(onlineNames())
                  : stats().away > 0
                    ? c().awaySummary(stats().away)
                    : c().syncedReadyCount(stats().ready)}
            </Text>
          </View>
        </View>

        <Button
          disabled={props.engine.polling()}
          onPress={() => {
            Haptics.selection();
            void props.engine.pollAllMacs();
          }}
          class="shrink-0 rounded-full bg-well px-3 py-1.5 active:opacity-70"
        >
          <Text class="text-xs font-semibold text-tint">{c().refreshNow}</Text>
        </Button>
      </View>

      {isSyncing() ? (
        <Progress
          value={pct()}
          accessibilityLabel={c().syncingTitle(
            stats().ready,
            stats().reachableWanted,
            stats().syncing,
          )}
          trackClass="h-1.5 w-full overflow-hidden rounded-full bg-well"
          indicatorClass="h-full rounded-full bg-tint"
        />
      ) : null}
    </View>
  );
}

function LibraryRow(props: {
  item: MirrorItemView;
  locale: Locale;
  showDivider: boolean;
  onPress: () => void;
  onDelete: () => void;
  onMirrorAgain: () => void;
}) {
  const c = copyFor(props.locale);
  const item = props.item;
  const pct = Math.round(item.progress * 100);
  const dur = formatDurationMs(item.durationMs);
  const sourceText =
    item.sources.length > 0
      ? item.sources.map((s) => s.shortName).join(" · ")
      : item.fallbackSourceShortName ?? c.fromGonePc;

  const badge = () => {
    if (item.status === "ready") {
      return <IosStatusBadge label={c.badgeReady} tone="ready" />;
    }
    if (item.status === "syncing") {
      return <IosStatusBadge label={c.badgeSyncing(pct)} tone="syncing" />;
    }
    if (item.status === "away") {
      return (
        <IosStatusBadge
          label={c.badgeAway(item.sources[0]?.shortName ?? "")}
          tone="away"
        />
      );
    }
    if (item.status === "queued") {
      return (
        <IosStatusBadge
          label={item.priority ? c.badgePriority : c.badgeQueued}
          tone={item.priority ? "syncing" : "queued"}
        />
      );
    }
    return null;
  };

  return (
    <View class="flex-col">
      <View class="flex-row items-center gap-3 px-3.5 py-3">
        <Button
          onPress={props.onPress}
          class="min-w-0 flex-1 flex-row items-center gap-3 bg-transparent active:opacity-75"
        >
          {/* 16:9 Video Thumbnail */}
          <View class="relative h-[58px] w-[102px] shrink-0 overflow-hidden rounded-xl bg-well">
            {item.thumbnailUrl ? (
              <Image
                src={item.thumbnailUrl}
                class="h-full w-full"
                style={{ width: 102, height: 58 }}
              />
            ) : null}
            {dur ? (
              <View class="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5">
                <Text class="font-mono text-[10px] font-semibold text-white">
                  {dur}
                </Text>
              </View>
            ) : null}
            {item.status === "syncing" ? (
              <View class="absolute inset-x-0 bottom-0 h-1 bg-black/35">
                <View
                  style={{ width: `${Math.max(4, pct)}%` }}
                  class="h-full bg-tint"
                />
              </View>
            ) : null}
          </View>

          {/* Metadata */}
          <View class="min-w-0 flex-1 flex-col gap-1.5">
            <Text
              class={`line-clamp-2 text-[15px] font-semibold leading-snug ${
                item.status === "ready"
                  ? "text-foreground"
                  : "text-foreground/80"
              }`}
            >
              {item.title}
            </Text>
            <View class="flex-row flex-wrap items-center gap-1.5">
              {badge()}
              <Text class="text-xs text-muted-foreground">
                {sourceText} · {formatBytesShort(item.sizeBytes)}
              </Text>
            </View>
          </View>
        </Button>

        {/* Trailing Action: Mirror Again (removed) or Delete Local Copy */}
        {item.status === "removed" ? (
          <Button
            onPress={() => {
              Haptics.selection();
              props.onMirrorAgain();
            }}
            class="shrink-0 rounded-full bg-tint-soft px-3 py-1.5 active:opacity-70"
          >
            <Text class="text-xs font-semibold text-tint">
              {c.mirrorAgain}
            </Text>
          </Button>
        ) : (
          <Button
            onPress={() => {
              Haptics.impact("medium");
              props.onDelete();
            }}
            accessibilityLabel={`${c.delete} ${item.title}`}
            class="shrink-0 rounded-full bg-danger-soft px-2.5 py-1.5 active:opacity-70"
          >
            <Text class="text-xs font-semibold text-destructive">
              {c.delete}
            </Text>
          </Button>
        )}
      </View>
      {props.showDivider ? <View class="ml-[128px] h-[1px] bg-line/60" /> : null}
    </View>
  );
}

/** Primary iOS Library screen showing auto-mirrored videos, sync status, and quick pairing. */
export function LibraryScreen(props: {
  engine: MirrorEngine;
  onOpenSettings: () => void;
  onOpenPair: () => void;
  onSelectReady: (item: MirrorItemView) => void;
  onDeleteItem: (item: MirrorItemView) => void;
  onTapNotReady: (item: MirrorItemView) => void;
}) {
  const locale = () => props.engine.settings().language;
  const c = () => copyFor(locale());
  const lib = () => props.engine.library();
  const kept = () => lib().filter((x) => x.status !== "removed");
  const removed = () => lib().filter((x) => x.status === "removed");

  const headerRightBtn = (
    <Button
      onPress={() => {
        Haptics.selection();
        props.onOpenSettings();
      }}
      accessibilityLabel={c().settings}
      class="min-h-[36px] min-w-[36px] items-center justify-center rounded-full px-2 active:opacity-60"
    >
      <Text class="text-[18px] text-tint">⚙</Text>
    </Button>
  );

  return (
    <NavPage
      title={c().appTitle}
      headerRight={headerRightBtn}
      ios={{ headerRightSymbol: "gearshape" }}
      header={
        <View class="flex-row items-center justify-between border-b border-line/60 bg-card px-4 py-3">
          <Text class="text-[22px] font-bold tracking-tight text-foreground">
            {c().appTitle}
          </Text>
          {headerRightBtn}
        </View>
      }
      class="flex-1 bg-background"
    >
      <Scroll class="flex-1">
        <View
          style={{ paddingBottom: Math.max(32, safeArea().bottom + 72) }}
          class="flex-col gap-4 p-4"
        >
          <SyncStatusBanner engine={props.engine} locale={locale} />

          {/* Case 1: No paired computers yet -> Clean iOS onboarding card */}
          {props.engine.macs().length === 0 && lib().length === 0 ? (
            <View class="mt-8 flex-col items-center gap-4 rounded-3xl bg-card border border-line/60 px-6 py-8">
              <View class="h-16 w-16 items-center justify-center rounded-2xl bg-tint-soft">
                <Text class="text-2xl font-bold text-tint">⌗</Text>
              </View>
              <View class="items-center gap-1.5">
                <Text class="text-center text-[20px] font-bold text-foreground">
                  {c().quickTitle}
                </Text>
                <Text class="text-center text-[14px] leading-relaxed text-muted-foreground">
                  {c().quickDesc}
                </Text>
              </View>
              <Button
                onPress={() => {
                  Haptics.impact("light");
                  props.onOpenPair();
                }}
                class="mt-1 min-h-[50px] w-full items-center justify-center rounded-2xl bg-primary px-6 py-3 active:opacity-80"
              >
                <Text class="text-[16px] font-semibold text-primary-foreground">
                  {c().quickBtn}
                </Text>
              </Button>
              <Text class="text-center text-xs leading-relaxed text-muted-foreground">
                {c().quickQrTip}
              </Text>
            </View>
          ) : null}

          {/* Case 2: Paired, waiting for computer to download first video */}
          {props.engine.macs().length > 0 && lib().length === 0 ? (
            <View class="mt-4 flex-col items-center gap-3 rounded-3xl bg-card border border-line/60 px-6 py-8">
              <Text class="text-center text-[17px] font-semibold text-foreground">
                {c().emptyPairedTitle}
              </Text>
              <Text class="text-center text-sm leading-relaxed text-muted-foreground">
                {c().emptyPairedDesc}
              </Text>
            </View>
          ) : null}

          {/* Active & Ready Mirrored Videos */}
          {kept().length > 0 ? (
            <View class="flex-col gap-2">
              <View class="overflow-hidden rounded-2xl bg-card border border-line/60">
                {kept().map((item, idx) => (
                  <LibraryRow
                    item={item}
                    locale={locale()}
                    showDivider={idx < kept().length - 1}
                    onPress={() => {
                      if (item.status === "ready") {
                        Haptics.selection();
                        props.onSelectReady(item);
                      } else {
                        Haptics.selection();
                        props.onTapNotReady(item);
                      }
                    }}
                    onDelete={() => props.onDeleteItem(item)}
                    onMirrorAgain={() => props.engine.mirrorAgain(item.videoId)}
                  />
                ))}
              </View>
              <Text class="px-2 text-xs text-muted-foreground">
                {c().swipeHint}
              </Text>
            </View>
          ) : null}

          {/* Removed Locally ("On Computer Only") */}
          {removed().length > 0 ? (
            <View class="flex-col gap-2 pt-2">
              <Text class="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {c().onlyOnPcSection}
              </Text>
              <View class="overflow-hidden rounded-2xl bg-card border border-line/60">
                {removed().map((item, idx) => (
                  <LibraryRow
                    item={item}
                    locale={locale()}
                    showDivider={idx < removed().length - 1}
                    onPress={() => props.engine.mirrorAgain(item.videoId)}
                    onDelete={() => {}}
                    onMirrorAgain={() => props.engine.mirrorAgain(item.videoId)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Scroll>
    </NavPage>
  );
}
