import { Image, signal, Text, Video, View } from "nsh";
import { Button } from "nsh/base";
import type { LibraryEntry } from "../library/types";
import { isAudioEntry } from "../views/libraryViewHelpers";
import { videoPosterUrl } from "../youtube/parse";
import { Icon } from "./Icon";
import { MediaErrorNotice } from "./MediaErrorNotice";

export function MediaPlayer(props: {
  entry: () => LibraryEntry;
  /** Absolute filesystem path for nsh <Video src> (not file://). */
  src: () => string;
  onClose: () => void;
}) {
  const paused = signal(false);
  const errorMsg = signal<string | null>(null);
  const entry = () => props.entry();
  const src = () => props.src();
  const audioOnly = () => isAudioEntry(entry()) || !entry().videoPath;
  const poster = () =>
    videoPosterUrl(entry().videoId, entry().thumbnailUrl);

  return (
    <View class="absolute inset-0 z-50 items-center justify-center bg-black/80 p-4">
      <View class="w-full max-w-[880px] gap-3 rounded-xl border border-line bg-background p-4 shadow-2xl">
        <View class="flex-row items-start justify-between gap-3">
          <View selectable class="min-w-0 flex-1 gap-0.5 select-text">
            <Text class="select-text line-clamp-2 text-sm font-semibold text-foreground">
              {entry().title}
            </Text>
            <Text class="select-text font-mono text-xs text-muted-foreground">
              {entry().quality ?? (audioOnly() ? "Audio" : "Video")}
              {entry().videoId ? ` · ${entry().videoId}` : ""}
            </Text>
          </View>
          <Button
            onPress={props.onClose}
            class="h-8 w-8 items-center justify-center rounded-md border border-line active:bg-accent"
            accessibilityLabel="Close player"
          >
            <Icon name="x" size={14} tone="foreground" />
          </Button>
        </View>

        <View class="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          <Video
            src={src()}
            paused={paused()}
            volume={1}
            controls
            audioSession="playback"
            progressUpdateInterval={250}
            class="h-full w-full object-contain"
            onLoad={() => errorMsg.set(null)}
            onError={(e: { message?: string; code?: string }) => {
              paused.set(true);
              const code = e?.code ? ` [${e.code}]` : "";
              errorMsg.set(
                `${e?.message ?? "内嵌播放器加载失败"}${code} · ${src()}`,
              );
            }}
            onEnd={() => paused.set(true)}
          />

          <If when={audioOnly() && paused()}>
            <Image
              src={poster()}
              class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
            />
          </If>
        </View>

        <If when={Boolean(errorMsg())}>
          <MediaErrorNotice
            errorMsg={errorMsg}
            mediaPath={src}
            language={() => "zh"}
            onDismiss={() => errorMsg.set(null)}
          />
        </If>

        <View class="flex-row items-center justify-between gap-2">
          <Button
            onPress={() => {
              errorMsg.set(null);
              paused.set(!paused());
            }}
            class="flex-row items-center gap-2 rounded-md bg-primary px-3.5 py-2 active:opacity-90"
          >
            <Icon
              name={paused() ? "play" : "pause"}
              size={14}
              tone="primary-foreground"
            />
            <Text class="text-sm font-medium text-primary-foreground">
              {paused() ? "播放" : "暂停"}
            </Text>
          </Button>

          <Button
            onPress={props.onClose}
            class="rounded-md border border-line px-3 py-2 active:bg-accent"
          >
            <Text class="text-sm text-foreground">关闭</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
