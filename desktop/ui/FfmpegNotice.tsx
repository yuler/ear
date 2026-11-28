import { Text, View } from "nsh";
import { Button } from "nsh/base";
import {
  currentInstallPlan,
  dismissFfmpegBanner,
  ffmpegBannerOpen,
  recheckFfmpeg,
  runFfmpegInstall,
} from "../ffmpeg/notice";
import { Icon } from "./Icon";
import { t } from "./i18n";
import { settings } from "./settings";

function InstallActions() {
  const m = () => t(settings().language);
  const plan = () => currentInstallPlan();
  const needsHomebrew = () => {
    const next = plan();
    return next.kind === "copy" && next.needsHomebrew;
  };

  return (
    <View class="gap-2">
      <If when={needsHomebrew()}>
        <Text class="text-xs text-muted-foreground">{m().ffmpegNeedsHomebrew}</Text>
      </If>
      <View class="flex-col gap-2 rounded-lg border border-amber/30 bg-background p-2.5 sm:flex-row sm:items-center sm:justify-between">
        <Text class="select-text font-mono text-xs text-foreground">{plan().command}</Text>
        <View class="shrink-0 flex-row items-center gap-2">
          <Button
            onPress={() => void runFfmpegInstall()}
            class="flex-row items-center gap-1.5 rounded-md bg-amber/20 px-2.5 py-1.5 hover:bg-amber/30 active:opacity-80"
          >
            <Text class="text-xs font-medium text-foreground">
              {plan().kind === "run" ? m().ffmpegInstall : m().copyInstallCommand}
            </Text>
          </Button>
          <Button
            onPress={() => void recheckFfmpeg()}
            class="rounded-md border border-line px-2.5 py-1.5 active:opacity-80"
          >
            <Text class="text-xs font-medium text-foreground">{m().ffmpegRecheck}</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}

/** Non-blocking startup / merge-failure prompt. Hidden once ffmpeg is found. */
export function FfmpegBanner() {
  const m = () => t(settings().language);

  return (
    <If when={ffmpegBannerOpen()}>
      <View class="mx-auto w-full max-w-[1440px] px-4 pt-2">
        <View class="gap-2 rounded-lg border border-amber/40 bg-amber-soft p-3">
          <View class="flex-row items-start justify-between gap-2">
            <View class="min-w-0 flex-1 gap-1">
              <Text class="text-sm font-semibold text-foreground">{m().ffmpegMissingTitle}</Text>
              <Text class="text-xs leading-relaxed text-muted-foreground">
                {m().ffmpegMissingDesc}
              </Text>
            </View>
            <Button
              onPress={dismissFfmpegBanner}
              accessibilityLabel={m().ffmpegDismiss}
              class="rounded-md p-1 hover:bg-amber/20 active:opacity-80"
            >
              <Icon name="x" size={14} tone="muted-foreground" />
            </Button>
          </View>
          <InstallActions />
        </View>
      </View>
    </If>
  );
}

/** Same install entry, kept in Settings while ffmpeg is missing. */
export function FfmpegSettingsRow() {
  const m = () => t(settings().language);

  return (
    <View class="gap-2 border-b border-line py-3">
      <Text class="text-sm font-medium text-foreground">{m().ffmpegMissingTitle}</Text>
      <Text class="text-xs leading-relaxed text-muted-foreground">{m().ffmpegMissingDesc}</Text>
      <InstallActions />
    </View>
  );
}
