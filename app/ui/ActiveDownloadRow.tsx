import { createMotion, effect, Image, LayoutAnimation, Text, View } from "nsh";
import { Button } from "nsh/base";
import { formatEta, formatSpeed } from "../library/download";
import type { DownloadTaskProgress } from "../library/types";
import { Icon } from "./Icon";
import { shellT } from "./shellI18n";

/** Clamped 0..100 progress of a download task. */
export function taskPercent(task: DownloadTaskProgress): number {
  return Math.max(0, Math.min(100, task.percent || 0));
}

/** A thin progress bar laid over the bottom edge of a poster. */
export function PosterProgress(props: { task: () => DownloadTaskProgress }) {
  const color = () => {
    const stage = props.task().stage;
    if (stage === "paused") return "bg-amber";
    if (stage === "error") return "bg-destructive";
    if (stage === "done") return "bg-ready";
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
 * An in-progress download in the Library grid:
 * preserves Downbit-style slide-in entrance, color-to-grayscale progressive
 * poster reveal with glowing frontier cut line, and completion transition.
 */
export function ActiveDownloadCard(props: {
  task: () => DownloadTaskProgress;
  onPause?: (videoId: string) => void;
  onResume?: (videoId: string) => void;
  onCancel?: (videoId: string) => void;
}) {
  const slideMotion = createMotion({
    enter: "slideInDown",
    duration: 380,
  });

  const stage = () => props.task().stage;
  const isPaused = () => stage() === "paused";
  const isError = () => stage() === "error";
  const isDone = () => stage() === "done";
  const percent = () => taskPercent(props.task());
  const roundedPercent = () => Math.round(percent());

  effect(() => {
    if (isDone()) {
      void slideMotion.play({
        keyframes: {
          scale: [1, 0.88],
          translateX: [0, -12],
          translateY: [0, 32],
          opacity: [1, 0.92, 0],
        },
        duration: 520,
        easing: [0.22, 1, 0.36, 1],
      });
    }
  });

  effect(() => {
    try {
      LayoutAnimation.easeInEaseOut();
    } catch {
      // ignore on test host
    }
  });

  const status = () => {
    const t = shellT();
    const task = props.task();
    if (stage() === "starting") return t.stageStarting;
    if (stage() === "merging") return t.stageMerging;
    if (isPaused()) return `${t.stagePaused} · ${roundedPercent()}%`;
    if (isError()) return task.error || t.stageError;
    const parts = [`${roundedPercent()}%`];
    const speed = formatSpeed(task.speedBps);
    if (speed) parts.push(speed);
    const eta = formatEta(task.etaSeconds);
    if (eta) parts.push(eta);
    return parts.join(" · ");
  };

  return (
    <View
      style={{ transformOrigin: "top left", ...slideMotion.style }}
      class="flex-col gap-2 rounded-lg p-1.5"
    >
      <View class="relative aspect-video w-full overflow-hidden rounded-lg border border-line/70 bg-black">
        {/* Base Layer: 100% grayscale un-downloaded picture */}
        <Image
          src={props.task().thumbnailUrl}
          style={{ filter: "grayscale(100%) brightness(0.82) contrast(1.05)" }}
          class="absolute inset-0 h-full w-full object-cover"
        />

        {/* Top Layer: Downloaded portion revealed in full vibrant color from left to right */}
        <Image
          src={props.task().thumbnailUrl}
          style={{
            maskImage: `linear-gradient(to right, #000 ${percent()}%, transparent ${percent()}%)`,
          }}
          class="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />

        {/* Progress Cut Line: glowing indicator at current download frontier */}
        <If when={percent() > 0 && percent() < 100}>
          <View
            style={{ left: `${percent()}%` }}
            class={`pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 shadow-[0_0_8px_#ffffff] ${
              isPaused()
                ? "bg-amber"
                : isError()
                  ? "bg-destructive"
                  : "bg-white"
            }`}
          />
        </If>

        {/* Center status indicator */}
        <View class="pointer-events-none absolute inset-0 items-center justify-center">
          <View
            class={`h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm ${
              isDone()
                ? "bg-ready/85"
                : isPaused()
                  ? "bg-amber/85"
                  : isError()
                    ? "bg-destructive/85"
                    : "bg-black/60"
            }`}
          >
            <If when={isDone()}>
              <Icon name="check" size={14} color="#ffffff" />
            </If>
            <If when={isPaused()}>
              <Icon name="pause" size={13} color="#ffffff" />
            </If>
            <If when={isError()}>
              <Icon name="repeat" size={13} color="#ffffff" />
            </If>
            <If when={!isDone() && !isPaused() && !isError()}>
              <Icon name="loader" size={14} color="#ffffff" class="animate-spin" />
            </If>
          </View>
        </View>

        {/* Corner percentage badge */}
        <View class="pointer-events-none absolute right-1.5 bottom-2 rounded bg-black/80 px-1.5 py-0.5">
          <Text class="font-mono text-[10px] font-bold tabular-nums text-white">
            {roundedPercent()}%
          </Text>
        </View>

        <PosterProgress task={props.task} />
      </View>

      <View class="min-w-0 gap-1 px-0.5">
        <Text class="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {props.task().title}
        </Text>
        <View class="flex-row items-center gap-1.5">
          <Text
            class={`min-w-0 flex-1 truncate font-mono text-xs tabular-nums ${
              isError() ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {status()}
          </Text>
          <If when={!isDone()}>
            <View class="shrink-0 flex-row items-center gap-1">
              <If when={isPaused() || isError()}>
                <Button
                  onPress={() => props.onResume?.(props.task().videoId)}
                  class="h-6 flex-row items-center gap-1 rounded-md bg-brand px-2 transition hover:opacity-90 active:scale-95"
                  accessibilityLabel={isError() ? shellT().retry : shellT().resume}
                >
                  <Icon name="play" size={10} color="#ffffff" />
                  <Text class="text-[10px] font-semibold text-brand-foreground">
                    {isError() ? shellT().retry : shellT().resume}
                  </Text>
                </Button>
              </If>
              <If when={!isPaused() && !isError()}>
                <Button
                  onPress={() => props.onPause?.(props.task().videoId)}
                  class="h-6 w-6 items-center justify-center rounded-md border border-line bg-well transition hover:bg-accent active:scale-95"
                  accessibilityLabel={shellT().pause}
                >
                  <Icon name="pause" size={11} tone="foreground" />
                </Button>
              </If>
              <Button
                onPress={() => props.onCancel?.(props.task().videoId)}
                class="h-6 w-6 items-center justify-center rounded-md border border-line bg-well transition hover:bg-destructive/20 active:scale-95"
                accessibilityLabel={shellT().cancelDownload}
              >
                <Icon name="x" size={11} tone="muted-foreground" />
              </Button>
            </View>
          </If>
        </View>
      </View>
    </View>
  );
}
