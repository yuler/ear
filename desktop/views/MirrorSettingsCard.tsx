import { Canvas, Clipboard, effect, signal, Text, View } from "nsh";
import { Button, Switch } from "nsh/base";
import { encodeQr } from "../mirror/qr";
import {
  mirrorError,
  mirrorRunning,
  mirrorSnapshot,
  mirrorStarting,
  refreshMirrorCode,
  removeMirrorDevice,
  startMirrorServer,
  stopMirrorServer,
  type MirrorDevice,
} from "../mirror/service";
import { Icon } from "../ui/Icon";

function formatCountdown(expiresAtSec: number, nowSec: number): string {
  const left = Math.max(0, expiresAtSec - nowSec);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function QrCodeCanvas(props: { value: () => string; size?: number }) {
  const boxSize = props.size ?? 144;
  return (
    <View
      style={{ width: boxSize, height: boxSize }}
      class="items-center justify-center rounded-xl border border-line bg-white p-2"
    >
      <Canvas
        style={{ width: boxSize - 16, height: boxSize - 16 }}
        draw={(cx, canvasSize) => {
          const text = props.value();
          cx.fillStyle = "#ffffff";
          cx.fillRect(0, 0, canvasSize.width, canvasSize.height);
          if (!text) return;
          const qr = encodeQr(text);
          const quiet = 2;
          const total = qr.size + quiet * 2;
          const cell = Math.min(canvasSize.width, canvasSize.height) / total;
          const ox = (canvasSize.width - cell * total) / 2;
          const oy = (canvasSize.height - cell * total) / 2;
          cx.fillStyle = "#0a0a0a";
          for (let r = 0; r < qr.size; r++) {
            for (let c = 0; c < qr.size; c++) {
              if (qr.modules[r * qr.size + c]) {
                cx.fillRect(
                  ox + (c + quiet) * cell,
                  oy + (r + quiet) * cell,
                  Math.ceil(cell),
                  Math.ceil(cell),
                );
              }
            }
          }
        }}
      />
    </View>
  );
}

function DeviceRow(props: { device: MirrorDevice; onRemove: () => void }) {
  const d = props.device;
  const statusText = d.online ? (d.background ? "后台" : "在线") : "离线";
  const statusClass = d.online
    ? "bg-ready-soft text-ready"
    : "bg-well text-muted-foreground";

  return (
    <View class="flex-row items-center justify-between gap-3 rounded-xl border border-line bg-well px-3 py-2.5">
      <View class="min-w-0 flex-1 gap-0.5">
        <View class="flex-row items-center gap-2">
          <Text class="text-xs font-semibold text-foreground">{d.name}</Text>
          <View class={`rounded-full px-2 py-0.5 ${statusClass}`}>
            <Text class="text-[10px] font-semibold">{statusText}</Text>
          </View>
        </View>
        <Text class="font-mono text-[11px] text-muted-foreground">
          已镜像 {d.syncedCount}/{d.totalCount}
        </Text>
      </View>
      <Button
        onPress={props.onRemove}
        class="rounded-lg border border-line bg-raised px-2.5 py-1 transition active:bg-accent"
      >
        <Text class="text-[11px] font-medium text-destructive">移除</Text>
      </Button>
    </View>
  );
}

/** Desktop Settings section for LAN mobile mirroring (QR, 4-digit code, paired devices). */
export function MirrorSettingsCard() {
  const nowSec = signal(Math.floor(Date.now() / 1000));
  const copied = signal(false);

  effect(() => {
    if (!mirrorRunning()) return;
    const timer = setInterval(() => {
      nowSec.set(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  });

  const handleToggle = (checked: boolean) => {
    if (checked) startMirrorServer();
    else stopMirrorServer();
  };

  const handleCopyPairUrl = async () => {
    const url = mirrorSnapshot()?.pairUrl;
    if (!url) return;
    try {
      await Clipboard.writeText(url);
      copied.set(true);
      setTimeout(() => copied.set(false), 1800);
    } catch {
      // ignore clipboard errors in headless tests
    }
  };

  const snap = () => mirrorSnapshot();

  return (
    <View class="flex-col gap-3">
      <View class="flex-row items-center gap-2 px-1">
        <Icon name="link" size={14} tone="primary" />
        <Text class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          手机镜像 (Phone Mirror · LAN)
        </Text>
      </View>

      <View class="flex-col rounded-2xl border border-line bg-card p-5 gap-4">
        <View class="flex-row items-center justify-between gap-6">
          <View class="min-w-0 flex-1 gap-0.5">
            <Text class="text-sm font-semibold text-foreground">
              局域网镜像服务 (LAN Mirror Server)
            </Text>
            <Text class="text-xs leading-relaxed text-muted-foreground">
              开启后，同一 Wi-Fi 下的 iPhone 可扫码或输入 4 位配对码，自动同步已下载的视频与字幕。
            </Text>
          </View>
          <Switch
            checked={mirrorRunning() || mirrorStarting()}
            onChange={(e) => handleToggle(e.checked)}
            accessibilityLabel="Enable LAN Mirror Server"
            trackClass="h-5 w-9 rounded-full bg-line p-0.5 checked:bg-primary"
            thumbClass="h-4 w-4 rounded-full bg-background transition checked:translate-x-4"
          />
        </View>

        {mirrorError() ? (
          <Text class="text-xs text-destructive">{mirrorError()}</Text>
        ) : null}

        {mirrorStarting() && !snap() ? (
          <Text class="text-xs text-muted-foreground">正在启动局域网镜像服务…</Text>
        ) : null}

        {mirrorRunning() && snap() ? (
          <View class="flex-col gap-4 border-t border-line pt-4">
            {snap()!.pairLocked ? (
              <View class="flex-col gap-2.5 rounded-xl border border-destructive/40 bg-danger-soft p-3.5">
                <Text class="text-xs font-semibold text-destructive">
                  配对已临时锁定（连续输错配对码次数过多）
                </Text>
                <Text class="text-xs text-muted-foreground">
                  {snap()!.pairLockedUntil
                    ? `将在 ${formatCountdown(snap()!.pairLockedUntil!, nowSec())} 后自动解锁，或手动重新开启配对并生成新配对码。`
                    : "请手动重新开启配对并生成新配对码。"}
                </Text>
                <View class="flex-row items-center gap-2 pt-0.5">
                  <Button
                    onPress={refreshMirrorCode}
                    class="rounded-lg bg-primary px-3 py-1.5 transition active:opacity-80"
                  >
                    <Text class="text-xs font-medium text-primary-foreground">
                      重新开启配对
                    </Text>
                  </Button>
                </View>
              </View>
            ) : (
              <View class="flex-row items-start gap-5">
                <QrCodeCanvas value={() => snap()?.pairUrl ?? ""} size={148} />

                <View class="min-w-0 flex-1 flex-col gap-2.5">
                  <View class="gap-0.5">
                    <Text class="text-xs text-muted-foreground">
                      4 位一次性配对码（{formatCountdown(snap()!.codeExpiresAt, nowSec())} 后刷新）
                    </Text>
                    <Text class="font-mono text-2xl font-bold tracking-[6px] text-foreground select-text">
                      {snap()!.code}
                    </Text>
                  </View>

                  <View class="gap-0.5">
                    <Text class="text-xs text-muted-foreground">局域网地址</Text>
                    <Text class="font-mono text-xs text-foreground select-text">
                      {snap()!.host}:{snap()!.port} · {snap()!.libraryCount} 个可镜像视频
                    </Text>
                  </View>

                  <View class="flex-row flex-wrap items-center gap-2 pt-1">
                    <Button
                      onPress={refreshMirrorCode}
                      class="rounded-lg border border-line bg-raised px-3 py-1.5 transition active:bg-accent"
                    >
                      <Text class="text-xs font-medium text-foreground">刷新配对码</Text>
                    </Button>
                    <Button
                      onPress={() => void handleCopyPairUrl()}
                      class="rounded-lg border border-line bg-raised px-3 py-1.5 transition active:bg-accent"
                    >
                      <Text class="text-xs font-medium text-foreground">
                        {copied() ? "已复制配对链接" : "复制配对链接"}
                      </Text>
                    </Button>
                  </View>
                </View>
              </View>
            )}

            <View class="flex-col gap-2 border-t border-line pt-4">
              <Text class="text-xs font-semibold text-muted-foreground">
                已配对设备 ({snap()!.devices.length})
              </Text>
              {snap()!.devices.length === 0 ? (
                <Text class="text-xs text-muted-foreground">
                  暂无已配对手机。用 iPhone 相机扫描二维码，或在 Ear iOS 里输入上方地址和配对码。
                </Text>
              ) : (
                <View class="flex-col gap-2">
                  {snap()!.devices.map((dev) => (
                    <DeviceRow
                      device={dev}
                      onRemove={() => removeMirrorDevice(dev.id)}
                    />
                  ))}
                </View>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
