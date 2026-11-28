import { createMotion, Image, Text, View, type ViewRef } from "nsh";
import { Button } from "nsh/base";
import {
  formatEta,
  formatSizeProgress,
  formatSpeed,
} from "../library/download";
import type { DownloadTaskProgress } from "../library/types";
import { Icon } from "./Icon";
import { shellT } from "./shellI18n";

const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_HEIGHT = 90;

/** Clamped 0..100 progress of a download task. */
export function taskPercent(task: DownloadTaskProgress): number {
  return Math.max(0, Math.min(100, task.percent || 0));
}

/** Aggregate telemetry across active download tasks for the section header. */
export function summarizeDownloads(tasks: readonly DownloadTaskProgress[]): {
  count: number;
  totalSpeedBps: number;
  maxEtaSeconds: number | null;
  hasRunning: boolean;
  hasPaused: boolean;
} {
  let totalSpeedBps = 0;
  let maxEtaSeconds: number | null = null;
  let hasRunning = false;
  let hasPaused = false;

  for (const task of tasks) {
    if (task.stage === "paused" || task.stage === "error") {
      hasPaused = true;
      continue;
    }
    if (task.stage !== "done") {
      hasRunning = true;
      if (Number.isFinite(task.speedBps) && task.speedBps > 0) {
        totalSpeedBps += task.speedBps;
      }
      if (
        task.etaSeconds != null &&
        Number.isFinite(task.etaSeconds) &&
        task.etaSeconds >= 0
      ) {
        maxEtaSeconds =
          maxEtaSeconds == null
            ? task.etaSeconds
            : Math.max(maxEtaSeconds, task.etaSeconds);
      }
    }
  }

  return {
    count: tasks.length,
    totalSpeedBps,
    maxEtaSeconds,
    hasRunning,
    hasPaused,
  };
}

/** A thin progress bar laid over the bottom edge of a poster (used by DiscoverCard). */
export function PosterProgress(props: { task: () => DownloadTaskProgress }) {
  const color = () => {
    const stage = props.task().stage;
    if (stage === "paused") return "bg-brand/60";
    if (stage === "error") return "bg-destructive";
    return "bg-brand";
  };
  return (
    <View class="absolute right-0 bottom-0 left-0 h-1 bg-black/50">
      <View
        style={{ width: `${Math.max(2, taskPercent(props.task()))}%` }}
        class={`h-full ${color()} transition-all duration-150`}
      />
    </View>
  );
}

/**
 * Downbit-style active download row displayed in its own block above the
 * Library grid: slide-in entrance, color-to-grayscale progressive thumbnail
 * reveal with frontier cut line, live speed / size / ETA telemetry, inline
 * progress bar, and circular pause / resume / cancel controls.
 */
export function ActiveDownloadRow(props: {
  task: () => DownloadTaskProgress;
  onPause?: (videoId: string) => void;
  onResume?: (videoId: string) => void;
  onCancel?: (videoId: string) => void;
  onThumbnailRef?: (node: ViewRef | null) => void;
}) {
  const slideMotion = createMotion({
    enter: "slideInDown",
    duration: 320,
  });

  const stage = () => props.task().stage;
  const isPaused = () => stage() === "paused";
  const isError = () => stage() === "error";
  const isDone = () => stage() === "done";
  const percent = () => taskPercent(props.task());
  const roundedPercent = () => Math.round(percent());

  const sizeStr = () =>
    formatSizeProgress(props.task().downloadedBytes, props.task().totalBytes);
  const speedStr = () => formatSpeed(props.task().speedBps);
  const etaStr = () => formatEta(props.task().etaSeconds);

  const stageLabel = () => {
    const t = shellT();
    if (stage() === "starting") return t.stageStarting;
    if (stage() === "merging") return t.stageMerging;
    if (isPaused()) return t.stagePaused;
    if (isDone()) return t.stageDone;
    if (isError()) return props.task().error || t.stageError;
    return "";
  };

  const telemetryParts = (): string => {
    const parts: string[] = [];
    const size = sizeStr();
    if (size) parts.push(size);
    if (!isPaused() && !isError() && !isDone()) {
      const speed = speedStr();
      if (speed) parts.push(speed);
      const eta = etaStr();
      if (eta) parts.push(eta);
    }
    const st = stageLabel();
    if (st) parts.push(st);
    return parts.join(" · ");
  };

  const barColor = () => {
    if (isError()) return "bg-destructive";
    if (isPaused()) return "bg-brand/60";
    return "bg-brand";
  };

  return (
    <View
      style={{ transformOrigin: "top left", ...slideMotion.style }}
      class={`relative overflow-hidden rounded-xl border bg-popover p-3 shadow-sm transition-all duration-200 ${
        isError()
          ? "border-destructive/50"
          : isDone()
            ? "border-brand/55"
            : "border-line/90 hover:border-brand/50"
      }`}
    >
      {/* Subtle ambient progress wash behind the horizontal block */}
      <View
        style={{ width: `${percent()}%` }}
        class={`pointer-events-none absolute inset-y-0 left-0 transition-all duration-150 ${
          isError()
            ? "bg-destructive/5"
            : isDone()
              ? "bg-brand/10"
              : "bg-brand/5"
        }`}
      />

      <View class="relative flex-row items-center gap-4">
        {/* 1. Thumbnail with left-to-right color reveal over grayscale base */}
        <View
          ref={(node) => props.onThumbnailRef?.(node)}
          style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }}
          class="relative shrink-0 overflow-hidden rounded-lg border border-line/70 bg-black"
        >
          <Image
            src={props.task().thumbnailUrl}
            style={{ filter: "grayscale(100%) brightness(0.84) contrast(1.05)" }}
            class="absolute inset-0 h-full w-full object-cover"
          />
          <Image
            src={props.task().thumbnailUrl}
            style={{
              maskImage: `linear-gradient(to right, #000 ${percent()}%, transparent ${percent()}%)`,
            }}
            class="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />

          {/* Glowing frontier vertical cut line */}
          <If when={percent() > 0 && percent() < 100}>
            <View
              style={{ left: `${percent()}%` }}
              class={`pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 shadow-[0_0_8px_#ffffff] ${
                isError() ? "bg-destructive" : "bg-white"
              }`}
            />
          </If>

          {/* Center status badge */}
          <View class="pointer-events-none absolute inset-0 items-center justify-center">
            <View
              class={`h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm ${
                isDone()
                  ? "bg-brand/90"
                  : isPaused()
                    ? "bg-brand/75"
                    : isError()
                      ? "bg-destructive/85"
                      : "bg-black/55"
              }`}
            >
              <If when={isDone()}>
                <Icon name="check" size={13} color="#ffffff" />
              </If>
              <If when={isPaused()}>
                <Icon name="pause" size={12} color="#ffffff" />
              </If>
              <If when={isError()}>
                <Icon name="repeat" size={12} color="#ffffff" />
              </If>
              <If when={!isDone() && !isPaused() && !isError()}>
                <Icon name="loader" size={13} color="#ffffff" class="animate-spin" />
              </If>
            </View>
          </View>

          <View class="pointer-events-none absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5">
            <Text class="font-mono text-[10px] font-bold tabular-nums text-white">
              {roundedPercent()}%
            </Text>
          </View>
        </View>

        {/* 2. Title, meta, live telemetry (percent · size · speed · ETA), and progress bar */}
        <View selectable class="min-w-0 flex-1 gap-1.5 select-text">
          <View class="gap-0.5">
            <Text class="select-text truncate text-sm font-semibold text-foreground">
              {props.task().title}
            </Text>
            <View class="flex-row flex-wrap items-center gap-1.5">
              <Text class="text-xs text-muted-foreground">
                {props.task().qualityLabel}
              </Text>
              <If when={Boolean(props.task().subtitleLabel)}>
                <Text class="text-xs text-dim">·</Text>
                <View
                  class={`rounded px-1.5 py-0.5 ${
                    props.task().subtitleIsAuto ? "bg-well" : "bg-brand-soft"
                  }`}
                >
                  <Text
                    class={`font-mono text-[10px] font-medium ${
                      props.task().subtitleIsAuto
                        ? "text-muted-foreground"
                        : "text-brand"
                    }`}
                  >
                    {props.task().subtitleLabel}
                  </Text>
                </View>
              </If>
            </View>
          </View>

          <View class="gap-1.5 pt-0.5">
            <View class="flex-row flex-wrap items-baseline gap-2">
              <Text
                class={`font-mono text-base font-bold tabular-nums leading-none ${
                  isError() ? "text-destructive" : "text-brand"
                }`}
              >
                {roundedPercent()}%
              </Text>
              <If when={Boolean(telemetryParts())}>
                <Text
                  class={`min-w-0 flex-1 truncate font-mono text-xs tabular-nums ${
                    isError() ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {telemetryParts()}
                </Text>
              </If>
            </View>

            <View class="h-1.5 w-full overflow-hidden rounded-full bg-well/90">
              <View
                style={{ width: `${Math.max(2, percent())}%` }}
                class={`h-full rounded-full ${barColor()} transition-all duration-150`}
              />
            </View>
          </View>
        </View>

        {/* 3. Right circular Pause / Resume & Cancel controls */}
        <If when={!isDone()}>
          <View class="shrink-0 flex-row items-center gap-2 pl-2">
            <If when={isPaused() || isError()}>
              <Button
                onPress={() => props.onResume?.(props.task().videoId)}
                class="h-8 w-8 items-center justify-center rounded-full bg-brand transition hover:opacity-90 active:scale-95"
                accessibilityLabel={isError() ? shellT().retry : shellT().resume}
              >
                <Icon
                  name={isError() ? "repeat" : "play"}
                  size={13}
                  color="#ffffff"
                />
              </Button>
            </If>
            <If when={!isPaused() && !isError()}>
              <Button
                onPress={() => props.onPause?.(props.task().videoId)}
                class="h-8 w-8 items-center justify-center rounded-full border border-line bg-well transition hover:bg-accent active:scale-95"
                accessibilityLabel={shellT().pause}
              >
                <Icon name="pause" size={13} tone="foreground" />
              </Button>
            </If>
            <Button
              onPress={() => props.onCancel?.(props.task().videoId)}
              class="h-8 w-8 items-center justify-center rounded-full border border-line bg-well transition hover:bg-destructive/20 active:scale-95"
              accessibilityLabel={shellT().cancelDownload}
            >
              <Icon name="x" size={13} tone="muted-foreground" />
            </Button>
          </View>
        </If>
      </View>
    </View>
  );
}

/**
 * Dedicated Downloading section block placed above the Library poster grid:
 * displays aggregate count / speed / ETA, Pause All / Resume All, and stacked
 * horizontal ActiveDownloadRow items.
 */
export function ActiveDownloadsSection(props: {
  tasks: () => DownloadTaskProgress[];
  onPause?: (videoId: string) => void;
  onResume?: (videoId: string) => void;
  onCancel?: (videoId: string) => void;
  onThumbnailRef?: (videoId: string, node: ViewRef | null) => void;
}) {
  const summary = () => summarizeDownloads(props.tasks());

  const headerMeta = (): string => {
    const s = summary();
    const parts = [`${s.count}`];
    const speed = formatSpeed(s.totalSpeedBps);
    if (speed) parts.push(speed);
    const eta = formatEta(s.maxEtaSeconds);
    if (eta) parts.push(eta);
    return parts.join(" · ");
  };

  const pauseAll = () => {
    for (const task of props.tasks()) {
      if (task.stage !== "paused" && task.stage !== "error" && task.stage !== "done") {
        props.onPause?.(task.videoId);
      }
    }
  };

  const resumeAll = () => {
    for (const task of props.tasks()) {
      if (task.stage === "paused" || task.stage === "error") {
        props.onResume?.(task.videoId);
      }
    }
  };

  return (
    <If when={props.tasks().length > 0}>
      <View class="gap-2">
        <View class="flex-row items-center justify-between gap-2 px-1">
          <View class="flex-row items-center gap-2">
            <Text class="text-xs font-semibold text-foreground">
              {shellT().downloadingSection}
            </Text>
            <Text class="font-mono text-xs tabular-nums text-muted-foreground">
              {headerMeta()}
            </Text>
          </View>

          <If when={summary().hasRunning && Boolean(props.onPause)}>
            <Button
              onPress={pauseAll}
              class="rounded-md px-2 py-0.5 transition hover:bg-well active:bg-accent"
              accessibilityLabel={shellT().pauseAll}
            >
              <Text class="text-xs font-medium text-brand">
                {shellT().pauseAll}
              </Text>
            </Button>
          </If>
          <If when={!summary().hasRunning && summary().hasPaused && Boolean(props.onResume)}>
            <Button
              onPress={resumeAll}
              class="rounded-md px-2 py-0.5 transition hover:bg-well active:bg-accent"
              accessibilityLabel={shellT().resumeAll}
            >
              <Text class="text-xs font-medium text-brand">
                {shellT().resumeAll}
              </Text>
            </Button>
          </If>
        </View>

        <View class="gap-2.5">
          <Each of={props.tasks()} key={(t) => t.videoId}>
            {(getTask) => (
              <ActiveDownloadRow
                task={getTask}
                onPause={props.onPause}
                onResume={props.onResume}
                onCancel={props.onCancel}
                onThumbnailRef={(node) =>
                  props.onThumbnailRef?.(getTask().videoId, node)
                }
              />
            )}
          </Each>
        </View>
      </View>
    </If>
  );
}
