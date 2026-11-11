import {
  createMotion,
  effect,
  Image,
  LayoutAnimation,
  Text,
  View,
} from "nsh";
import {
  formatEta,
  formatSizeProgress,
  formatSpeed,
} from "../library/download";
import type { DownloadTaskProgress } from "../library/types";
import { Icon } from "./Icon";

const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_HEIGHT = 88;

/**
 * Downbit-style active download row:
 * Displays at the top of the library as a horizontal bar (横条).
 * Features:
 * 1. Displacement entrance animation sliding down from the omnibar/placeholder.
 * 2. Visual color-to-grayscale transition across the video picture:
 *    left X% in full vibrant color, right (100 - X)% in grayscale.
 * 3. Live Downbit-style telemetry (MB/s, ETA, transferred size, stage).
 */
export function ActiveDownloadRow(props: {
  task: () => DownloadTaskProgress;
}) {
  const slideMotion = createMotion({
    enter: "slideInDown",
    duration: 420,
  });

  effect(() => {
    try {
      LayoutAnimation.easeInEaseOut();
    } catch {
      // ignore on test host
    }
  });

  const percent = () => Math.max(0, Math.min(100, props.task().percent));
  const roundedPercent = () => Math.round(percent());
  const speedStr = () => formatSpeed(props.task().speedBps);
  const etaStr = () => formatEta(props.task().etaSeconds);
  const sizeStr = () =>
    formatSizeProgress(props.task().downloadedBytes, props.task().totalBytes);

  const stageText = () => {
    const stage = props.task().stage;
    if (stage === "starting") return "Starting background download…";
    if (stage === "merging") return "Merging video & audio (FFmpeg)…";
    if (stage === "done") return "Download complete";
    return "Downloading to ~/Downloads…";
  };

  return (
    <View
      style={slideMotion.style}
      class="relative overflow-hidden rounded-xl border border-[#2f7cf6]/50 bg-popover p-3 shadow-md transition hover:border-[#2f7cf6]"
    >
      {/* Subtle ambient progress wash behind the horizontal card */}
      <View
        style={{ width: `${percent()}%` }}
        class="pointer-events-none absolute inset-y-0 left-0 bg-[#2f7cf6]/5 transition-all duration-150"
      />

      <View class="flex-row items-center gap-3.5">
        {/* 1. Video Thumbnail with Downbit-style Color-to-Grayscale Transition:
               Left X% is full color, Right (100 - X)% is grayscale */}
        <View
          style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }}
          class="relative shrink-0 overflow-hidden rounded-lg border border-line bg-black"
        >
          {/* Base Layer: 100% grayscale un-downloaded picture */}
          <Image
            src={props.task().thumbnailUrl}
            style={{
              filter: "grayscale(100%) brightness(0.85) contrast(1.05)",
            }}
            class="absolute inset-0 h-full w-full object-cover"
          />

          {/* Top Layer: Downloaded portion revealed in full vibrant color from left to right */}
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${percent()}%`,
              overflow: "hidden",
            }}
          >
            <Image
              src={props.task().thumbnailUrl}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: THUMBNAIL_WIDTH,
                minWidth: THUMBNAIL_WIDTH,
                height: THUMBNAIL_HEIGHT,
                maskImage: `linear-gradient(to right, #000 ${percent()}%, transparent ${percent()}%)`,
              }}
              class="h-full object-cover"
            />
          </View>

          {/* Progress Cut Line: glowing laser indicator at current download frontier */}
          <If when={percent() > 0 && percent() < 100}>
            <View
              style={{ left: `${percent()}%` }}
              class="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-white shadow-[0_0_8px_#ffffff]"
            />
          </If>

          {/* Center spinner overlay */}
          <View class="pointer-events-none absolute inset-0 items-center justify-center">
            <View class="h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
              <Icon
                name="loader"
                size={12}
                color="#ffffff"
                class="animate-spin"
              />
            </View>
          </View>

          {/* Corner percentage badge */}
          <View class="absolute right-1.5 bottom-1.5 rounded bg-black/85 px-1.5 py-0.5">
            <Text class="font-mono text-[10px] font-bold tabular-nums text-white">
              {roundedPercent()}%
            </Text>
          </View>
        </View>

        {/* 2. Video Metadata & Downbit-style Live Telemetry */}
        <View selectable class="min-w-0 flex-1 gap-1 select-text">
          <View class="flex-row items-center justify-between gap-2">
            <Text class="select-text min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {props.task().title}
            </Text>
            <View class="shrink-0 flex-row items-center gap-1.5">
              <View class="rounded bg-well px-1.5 py-0.5">
                <Text class="font-mono text-[10px] font-semibold text-foreground">
                  {props.task().qualityLabel}
                </Text>
              </View>
              <If when={Boolean(props.task().subtitleLabel)}>
                <View
                  class={`rounded px-1.5 py-0.5 ${
                    props.task().subtitleIsAuto
                      ? "bg-amber-soft"
                      : "bg-ready-soft"
                  }`}
                >
                  <Text
                    class={`font-mono text-[10px] font-semibold ${
                      props.task().subtitleIsAuto ? "text-amber" : "text-ready"
                    }`}
                  >
                    {props.task().subtitleLabel}
                  </Text>
                </View>
              </If>
            </View>
          </View>

          {/* Telemetry line: Percent · Size · Speed · ETA */}
          <View class="flex-row flex-wrap items-center justify-between gap-2 pt-0.5">
            <View class="flex-row flex-wrap items-center gap-2">
              <Text class="font-mono text-xs font-bold tabular-nums text-[#2f7cf6]">
                {roundedPercent()}%
              </Text>
              <If when={Boolean(sizeStr())}>
                <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                  · {sizeStr()}
                </Text>
              </If>
              <If when={Boolean(speedStr())}>
                <View class="rounded bg-[#2f7cf6]/15 px-1.5 py-0.5">
                  <Text class="font-mono text-[11px] font-semibold tabular-nums text-[#2f7cf6]">
                    ↓ {speedStr()}
                  </Text>
                </View>
              </If>
              <If when={Boolean(etaStr())}>
                <Text class="font-mono text-xs tabular-nums text-dim">
                  · {etaStr()}
                </Text>
              </If>
            </View>

            <Text class="font-mono text-[11px] text-dim">
              {stageText()}
            </Text>
          </View>
        </View>
      </View>

      {/* 3. Bottom animated progress bar of the horizontal bar */}
      <View class="absolute bottom-0 left-0 right-0 h-1 overflow-hidden bg-well/70">
        <View
          style={{
            width: `${Math.max(2, percent())}%`,
          }}
          class="h-full bg-[#2f7cf6] transition-all duration-150"
        />
      </View>
    </View>
  );
}
