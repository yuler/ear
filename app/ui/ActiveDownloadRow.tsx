import { Image, Text, View } from "nsh";
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
 * An in-progress download in the Library grid: the poster dimmed with a
 * progress bar, the title, and a status line with pause / resume / cancel.
 */
export function ActiveDownloadCard(props: {
  task: () => DownloadTaskProgress;
  onPause?: (videoId: string) => void;
  onResume?: (videoId: string) => void;
  onCancel?: (videoId: string) => void;
}) {
  const stage = () => props.task().stage;
  const isPaused = () => stage() === "paused";
  const isError = () => stage() === "error";
  const isDone = () => stage() === "done";

  const status = () => {
    const t = shellT();
    const task = props.task();
    if (stage() === "starting") return t.stageStarting;
    if (stage() === "merging") return t.stageMerging;
    if (isPaused()) return `${t.stagePaused} · ${Math.round(taskPercent(task))}%`;
    if (isError()) return task.error || t.stageError;
    const parts = [`${Math.round(taskPercent(task))}%`];
    const speed = formatSpeed(task.speedBps);
    if (speed) parts.push(speed);
    const eta = formatEta(task.etaSeconds);
    if (eta) parts.push(eta);
    return parts.join(" · ");
  };

  return (
    <View class="flex-col gap-2 rounded-lg p-1.5">
      <View class="relative aspect-video w-full overflow-hidden rounded-lg bg-well">
        <Image
          src={props.task().thumbnailUrl}
          style={{ filter: isDone() ? "none" : "grayscale(60%) brightness(0.7)" }}
          class="h-full w-full object-cover"
        />
        <View class="pointer-events-none absolute inset-0 items-center justify-center">
          <View class="h-8 w-8 items-center justify-center rounded-full bg-black/60">
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
        <PosterProgress task={props.task} />
      </View>

      <View class="min-w-0 gap-0.5 px-0.5">
        <Text class="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {props.task().title}
        </Text>
        <View class="flex-row items-center gap-1">
          <Text
            class={`min-w-0 flex-1 truncate font-mono text-xs tabular-nums ${
              isError() ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {status()}
          </Text>
          <If when={!isDone()}>
            <View class="shrink-0 flex-row items-center gap-0.5">
              <If when={isPaused() || isError()}>
                <Button
                  onPress={() => props.onResume?.(props.task().videoId)}
                  class="h-6 w-6 items-center justify-center rounded-md active:bg-accent hover:bg-well"
                  accessibilityLabel={isError() ? shellT().retry : shellT().resume}
                >
                  <Icon name="play" size={11} tone="foreground" />
                </Button>
              </If>
              <If when={!isPaused() && !isError()}>
                <Button
                  onPress={() => props.onPause?.(props.task().videoId)}
                  class="h-6 w-6 items-center justify-center rounded-md active:bg-accent hover:bg-well"
                  accessibilityLabel={shellT().pause}
                >
                  <Icon name="pause" size={11} tone="foreground" />
                </Button>
              </If>
              <Button
                onPress={() => props.onCancel?.(props.task().videoId)}
                class="h-6 w-6 items-center justify-center rounded-md active:bg-accent hover:bg-well"
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
