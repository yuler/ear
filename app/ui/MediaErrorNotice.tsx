import { Clipboard, Text, View, signal } from "nsh";
import { Button } from "nsh/base";
import { openSystemPath, revealInFileManager } from "../library/paths";
import { Icon } from "./Icon";
import { t, type EarLocale } from "./i18n";

export type MediaErrorNoticeProps = {
  errorMsg: () => string | null;
  mediaPath?: () => string | null | undefined;
  language: () => EarLocale;
  onDismiss?: () => void;
};

/** Detect if error message corresponds to missing GStreamer codecs or demuxers on Linux. */
export function isGStreamerPluginError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes("gstreamer") ||
    lower.includes("gst-plugins") ||
    lower.includes("gst-libav") ||
    lower.includes("qtdemux") ||
    lower.includes("quicktime") ||
    lower.includes("missing decoder") ||
    lower.includes("缺少插件") ||
    (lower.includes("decoder") &&
      (lower.includes("h.264") ||
        lower.includes("aac") ||
        lower.includes("quicktime")))
  );
}

export const DEFAULT_GSTREAMER_COMMAND =
  "sudo pacman -S gst-plugins-good gst-libav gst-plugins-ugly gst-plugins-bad";

export const GSTREAMER_DISTRO_HINTS = [
  {
    distro: "Arch / Omarchy",
    cmd: "sudo pacman -S gst-plugins-good gst-libav gst-plugins-ugly gst-plugins-bad",
  },
  {
    distro: "Ubuntu / Debian",
    cmd: "sudo apt install gstreamer1.0-plugins-good gstreamer1.0-libav gstreamer1.0-plugins-bad",
  },
  {
    distro: "Fedora",
    cmd: "sudo dnf install gstreamer1-plugins-good gstreamer1-plugin-libav",
  },
];

export function MediaErrorNotice(props: MediaErrorNoticeProps) {
  const m = () => t(props.language());
  const isGst = () => isGStreamerPluginError(props.errorMsg());
  const copied = signal(false);
  const showAllDistros = signal(false);

  const handleCopy = async (cmd: string = DEFAULT_GSTREAMER_COMMAND) => {
    try {
      if (typeof Clipboard?.writeText === "function") {
        await Clipboard.writeText(cmd);
      }
      copied.set(true);
      setTimeout(() => copied.set(false), 2000);
    } catch {
      // fallback
    }
  };

  const path = () => props.mediaPath?.() ?? null;

  const handlePlayExternal = () => {
    const target = path();
    if (target) void openSystemPath(target);
  };

  const handleReveal = () => {
    const target = path();
    if (target) void revealInFileManager(target);
  };

  return (
    <View class="w-full">
      <If when={isGst()}>
        <View class="gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm">
          {/* Header */}
          <View class="flex-row items-center justify-between gap-2">
            <View class="flex-row items-center gap-2">
              <Icon name="sparkles" size={15} tone="foreground" />
              <Text class="text-sm font-semibold text-foreground">
                {m().gstreamerMissingTitle}
              </Text>
            </View>

            <If when={Boolean(props.onDismiss)}>
              <Button
                onPress={props.onDismiss}
                class="rounded-md p-1 hover:bg-amber-500/20 active:opacity-80"
              >
                <Icon name="x" size={14} tone="muted-foreground" />
              </Button>
            </If>
          </View>

          {/* Description */}
          <Text class="text-xs leading-relaxed text-muted-foreground">
            {m().gstreamerMissingDesc}
          </Text>

          {/* Primary Command Code Box */}
          <View class="flex-col gap-2 rounded-lg border border-amber-500/30 bg-background/80 p-2.5 sm:flex-row sm:items-center sm:justify-between">
            <Text class="select-text font-mono text-xs text-foreground">
              {DEFAULT_GSTREAMER_COMMAND}
            </Text>

            <Button
              onPress={() => handleCopy(DEFAULT_GSTREAMER_COMMAND)}
              class="shrink-0 flex-row items-center gap-1.5 rounded-md bg-amber-500/20 px-2.5 py-1.5 hover:bg-amber-500/30 active:opacity-80"
            >
              <Icon
                name={copied() ? "check" : "clipboard"}
                size={12}
                tone="foreground"
              />
              <Text class="text-xs font-medium text-foreground">
                {copied() ? m().copied : m().copyInstallCommand}
              </Text>
            </Button>
          </View>

          {/* Actions: Play in external player & Reveal in file manager */}
          <View class="flex-row flex-wrap items-center gap-2 pt-1">
            <If when={Boolean(path())}>
              <Button
                onPress={handlePlayExternal}
                class="flex-row items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 active:opacity-90"
              >
                <Icon name="play" size={12} tone="primary-foreground" />
                <Text class="text-xs font-medium text-primary-foreground">
                  {m().playInExternalPlayer}
                </Text>
              </Button>

              <Button
                onPress={handleReveal}
                class="flex-row items-center gap-1.5 rounded-md border border-border/80 bg-background/60 px-3 py-1.5 hover:bg-background/80 active:opacity-80"
              >
                <Icon name="folder" size={12} tone="foreground" />
                <Text class="text-xs font-medium text-foreground">
                  {m().revealFile}
                </Text>
              </Button>
            </If>

            <Button
              onPress={() => showAllDistros.set(!showAllDistros())}
              class="px-2 py-1.5 active:opacity-70"
            >
              <Text class="text-xs text-muted-foreground underline">
                {showAllDistros() ? "收起其他发行版" : "查看其他发行版命令"}
              </Text>
            </Button>
          </View>

          {/* Other Linux Distros Collapsible */}
          <If when={showAllDistros()}>
            <View class="gap-1.5 rounded-lg border border-border/40 bg-background/50 p-2.5">
              {GSTREAMER_DISTRO_HINTS.map((hint) => (
                <View class="gap-0.5">
                  <Text class="text-[11px] font-semibold text-muted-foreground">
                    {hint.distro}:
                  </Text>
                  <Text class="select-text font-mono text-[11px] text-foreground">
                    {hint.cmd}
                  </Text>
                </View>
              ))}
            </View>
          </If>
        </View>
      </If>

      {/* General Non-GStreamer Error Notice */}
      <If when={!isGst()}>
        <View class="gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5">
          <View class="flex-row items-center justify-between gap-2">
            <Text class="text-xs text-destructive">{props.errorMsg()}</Text>
            <If when={Boolean(props.onDismiss)}>
              <Button onPress={props.onDismiss} class="p-1 active:opacity-70">
                <Icon name="x" size={12} tone="destructive" />
              </Button>
            </If>
          </View>

          <If when={Boolean(path())}>
            <View class="flex-row items-center gap-2 pt-1">
              <Button
                onPress={handlePlayExternal}
                class="flex-row items-center gap-1.5 rounded-md bg-destructive/20 px-2.5 py-1 hover:bg-destructive/30 active:opacity-80"
              >
                <Icon name="play" size={11} tone="destructive" />
                <Text class="text-xs font-medium text-destructive">
                  {m().playInExternalPlayer}
                </Text>
              </Button>
            </View>
          </If>
        </View>
      </If>
    </View>
  );
}
