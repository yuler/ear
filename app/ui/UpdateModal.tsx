import { keymap, Scroll, Text, View } from "nsh";
import { Button } from "nsh/base";
import {
  dismissGlobalUpdateModal,
  globalUpdateApplying,
  globalUpdateError,
  globalUpdateModalOpen,
  globalUpdateProgress,
  globalUpdateResult,
  globalUpdateStatus,
  runGlobalApplyUpdate,
  type UpdateCheckResult,
} from "../updater";
import { Icon } from "./Icon";

function resolveChangelogLines(res: UpdateCheckResult): string[] {
  if (res.changelogItems && res.changelogItems.length > 0) {
    return res.changelogItems;
  }
  const raw = res.changelog?.trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s+/, ""))
    .filter(Boolean);
}

function UpdateModalDialog(props: { result: () => UpdateCheckResult }) {
  const isBusy = () =>
    globalUpdateApplying() || globalUpdateStatus() === "restarting";

  keymap.bind(
    {
      escape: dismissGlobalUpdateModal,
      // Suppress underlying shortcuts, including App shift+/ / F1, while frontmost
      "shift+/": () => {},
      f1: () => {},
      space: () => {},
      enter: () => {},
      delete: () => {},
      backspace: () => {},
      up: () => {},
      down: () => {},
      left: () => {},
      right: () => {},
      o: () => {},
      r: () => {},
      m: () => {},
      b: () => {},
      "[": () => {},
      "]": () => {},
      "0": () => {},
      "alt+1": () => {},
      "alt+2": () => {},
      "alt+3": () => {},
    },
    { when: "notEditing" },
  );

  const lines = () => resolveChangelogLines(props.result());
  const actionLabel = () => {
    if (globalUpdateStatus() === "restarting") return "重启中...";
    if (globalUpdateApplying()) {
      return `下载中 ${Math.round(globalUpdateProgress() * 100)}%`;
    }
    const res = props.result();
    if (res.isIncremental) return "立即更新并重启";
    if (res.appUpdate?.canInstall) return "安装并重启";
    return "下载安装包";
  };

  return (
    <View class="fixed inset-0 z-50 flex-col items-center justify-center bg-black/65 backdrop-blur-md p-4 sm:p-6">
      <Button
        disabled={isBusy()}
        onPress={dismissGlobalUpdateModal}
        class="absolute inset-0 cursor-default"
        accessibilityLabel="Close update overlay"
      />

      <View
        style={{ maxHeight: "80%" }}
        class="relative w-full max-w-[540px] flex-col rounded-2xl border border-line bg-background shadow-2xl overflow-hidden z-10"
        accessibilityLabel="Software Update Dialog"
      >
        {/* Header */}
        <View class="flex-row items-center justify-between border-b border-line px-5 py-4 bg-well/30">
          <View class="flex-row items-center gap-3 min-w-0 flex-1">
            <View class="h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <Icon name="sparkles" size={17} tone="primary" />
            </View>
            <View class="flex-col min-w-0 flex-1 gap-0.5">
              <View class="flex-row items-center gap-2">
                <Text class="text-base font-bold text-foreground">
                  发现新版本 v{props.result().latestVersion}
                </Text>
                <View class="rounded-full bg-primary/15 px-2 py-0.5">
                  <Text class="font-mono text-[10px] font-semibold text-primary">
                    {props.result().isIncremental ? "增量热更" : "全量更新"}
                  </Text>
                </View>
              </View>
              <Text class="text-xs text-muted-foreground">
                当前版本 v{props.result().currentVersion} → v{props.result().latestVersion}
              </Text>
            </View>
          </View>

          <Button
            disabled={isBusy()}
            onPress={dismissGlobalUpdateModal}
            class="h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-well transition hover:bg-accent active:scale-95"
            accessibilityLabel="Close"
          >
            <Icon name="x" size={13} tone="foreground" />
          </Button>
        </View>

        {/* Scrollable Consolidated Release Notes */}
        <Scroll class="flex-1 p-5">
          <View class="flex-col gap-3">
            <Text class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              更新内容
            </Text>

            <View class="flex-col rounded-xl border border-line bg-well/25 p-4 gap-2.5">
              <If when={lines().length > 0}>
                <Each of={lines()} key={(item) => item}>
                  {(getItem) => (
                    <View class="flex-row items-start gap-2.5">
                      <View class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <Text class="flex-1 text-xs leading-relaxed text-foreground select-text">
                        {getItem()}
                      </Text>
                    </View>
                  )}
                </Each>
              </If>

              <If when={lines().length === 0}>
                <Text class="text-xs leading-relaxed text-muted-foreground">
                  包含体验优化与稳定性修复。
                </Text>
              </If>
            </View>

            <If when={isBusy()}>
              <View class="flex-col gap-1.5 pt-1">
                <View class="flex-row items-center justify-between">
                  <Text class="text-xs text-muted-foreground">
                    {globalUpdateStatus() === "restarting"
                      ? "准备重启以应用更新..."
                      : "正在下载更新包..."}
                  </Text>
                  <Text class="font-mono text-xs font-semibold text-primary tabular-nums">
                    {Math.round(globalUpdateProgress() * 100)}%
                  </Text>
                </View>
                <View class="h-1.5 w-full overflow-hidden rounded-full bg-well">
                  <View
                    class="h-full bg-primary transition-all duration-150"
                    style={{
                      width: `${Math.round(globalUpdateProgress() * 100)}%`,
                    }}
                  />
                </View>
              </View>
            </If>

            <If when={Boolean(globalUpdateError())}>
              <View class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <Text class="text-xs text-destructive">
                  {globalUpdateError()}
                </Text>
              </View>
            </If>
          </View>
        </Scroll>

        {/* Footer Actions */}
        <View class="flex-row items-center justify-end gap-2.5 border-t border-line bg-well/20 px-5 py-3">
          <Button
            disabled={isBusy()}
            onPress={dismissGlobalUpdateModal}
            class="rounded-lg border border-line bg-raised px-3.5 py-1.5 transition hover:bg-accent active:scale-95"
            accessibilityLabel="Later"
          >
            <Text class="text-xs font-medium text-foreground">稍后再说</Text>
          </Button>
          <Button
            disabled={isBusy()}
            onPress={() => void runGlobalApplyUpdate()}
            class="rounded-lg bg-primary px-4 py-1.5 transition active:scale-95"
            accessibilityLabel="Apply Update"
          >
            <Text class="text-xs font-semibold text-primary-foreground">
              {actionLabel()}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  );
}

export function UpdateModal() {
  const activeResult = () => {
    const res = globalUpdateResult();
    return globalUpdateModalOpen() && res?.hasUpdate ? res : null;
  };

  return (
    <If when={Boolean(activeResult())}>
      <UpdateModalDialog result={() => activeResult()!} />
    </If>
  );
}
