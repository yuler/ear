import { effect, lifecycle, mount, platform, safeArea, signal, Text, UrlScheme, View } from "nsh";
import { Button, createNavStack, NavStack } from "nsh/base";
import { Haptics } from "nsh/mobile";
import { copyFor } from "./i18n";
import { mirrorEngine, type MirrorEngine } from "./mirror/engine";
import {
  defaultPermissionsBridge,
  type MobilePermissionsBridge,
} from "./mirror/scanner";
import { parsePairUrl } from "./mirror/transport";
import type { MirrorItemView } from "./mirror/types";
import { LibraryScreen } from "./views/LibraryScreen";
import { OfflinePreviewSheet } from "./views/OfflinePreviewSheet";
import { PairModal, type PairModalIntent } from "./views/PairModal";
import { SettingsSheet } from "./views/SettingsSheet";

const POLL_INTERVAL_MS = 5000;

interface ToastState {
  text: string;
  undo?: () => void;
}

export function EarMobileApp(props?: {
  engine?: MirrorEngine;
  permissions?: MobilePermissionsBridge;
  disableAutoPoll?: boolean;
}) {
  const engine = props?.engine ?? mirrorEngine;
  const permissions = props?.permissions ?? defaultPermissionsBridge;
  const nav = createNavStack(["library"] as const);
  const settingsOpen = signal(false);
  const pairOpen = signal(false);
  const pairIntent = signal<PairModalIntent>({ kind: "link" });
  const scannerAvailable = signal(false);
  const canOpenSettings = signal(false);
  const previewItem = signal<MirrorItemView | null>(null);
  const toast = signal<ToastState | null>(null);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let sheetTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  let scanning = false;
  const pendingDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const locale = () => engine.settings().language;
  const c = () => copyFor(locale());

  const showToast = (text: string, undo?: () => void) => {
    if (toastTimer) clearTimeout(toastTimer);
    toast.set({ text, undo });
    toastTimer = setTimeout(() => {
      toast.set(null);
      toastTimer = null;
    }, undo ? 4000 : 2600);
  };

  const openPairModal = (intent: PairModalIntent, waitForSheetDismiss = false) => {
    if (sheetTransitionTimer) {
      clearTimeout(sheetTransitionTimer);
      sheetTransitionTimer = null;
    }
    const showNow = () => {
      pairIntent.set(intent);
      pairOpen.set(true);
    };
    if (waitForSheetDismiss && platform.os === "ios") {
      sheetTransitionTimer = setTimeout(() => {
        sheetTransitionTimer = null;
        showNow();
      }, 360);
    } else {
      showNow();
    }
  };

  const handleOpenPairUrl = (url: string | null) => {
    if (!url || !parsePairUrl(url)) return;
    const wasSettingsOpen = settingsOpen();
    settingsOpen.set(false);
    openPairModal({ kind: "deepLink", url }, wasSettingsOpen);
  };

  const startPairingFlow = async (fromSettingsSheet = false) => {
    if (scanning) return;
    scanning = true;
    try {
      const canScan = await permissions.scannerAvailable();
      scannerAvailable.set(canScan);
      if (!canScan) {
        openPairModal({ kind: "link" }, fromSettingsSheet);
        return;
      }

      const copy = c();
      const result = await permissions.scanQr({
        cancelLabel: copy.cancel,
        manualLabel: copy.scannerManualBtn,
        titleText: copy.scannerTitle,
        hintText: copy.scannerHint,
      });

      if (result.status === "cancelled") {
        return;
      }
      if (result.status === "denied") {
        openPairModal({ kind: "cameraDenied" }, fromSettingsSheet);
        return;
      }
      if (result.status === "manual") {
        openPairModal({ kind: "manual" }, false);
        return;
      }
      if (result.status === "scanned" && result.value) {
        openPairModal({ kind: "scanned", raw: result.value }, false);
        return;
      }
      openPairModal({ kind: "link" }, fromSettingsSheet);
    } finally {
      scanning = false;
    }
  };

  // Initial hydration + capability probes + URL scheme listener + auto LAN poll.
  effect(() => {
    let disposed = false;
    void engine.hydrate().then(() => {
      if (!disposed && !props?.disableAutoPoll) {
        void engine.pollAllMacs();
      }
    });
    void permissions.scannerAvailable().then((ok) => {
      if (!disposed) scannerAvailable.set(ok);
    });
    void permissions.appSettingsAvailable().then((ok) => {
      if (!disposed) canOpenSettings.set(ok);
    });

    const initialUrl = UrlScheme.url();
    if (initialUrl) handleOpenPairUrl(initialUrl);
    const stopUrl = UrlScheme.on("open", (ev) => {
      handleOpenPairUrl(ev.url);
    });

    const timer = props?.disableAutoPoll
      ? null
      : setInterval(() => {
          if (engine.macs().length > 0 && lifecycle() !== "background") {
            void engine.pollAllMacs();
          }
        }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      stopUrl();
      if (timer) clearInterval(timer);
      if (toastTimer) clearTimeout(toastTimer);
      if (sheetTransitionTimer) clearTimeout(sheetTransitionTimer);
      for (const t of pendingDeleteTimers.values()) clearTimeout(t);
      pendingDeleteTimers.clear();
    };
  });

  // Track iOS foreground / background transitions.
  effect(() => {
    engine.setAppLifecycle(lifecycle());
  });

  // Surface engine notices (e.g. unpaired remotely by computer).
  effect(() => {
    const notice = engine.lastNotice();
    if (!notice) return;
    if (notice.kind === "removedByPc" && notice.macName) {
      showToast(c().toastRemovedByPc(notice.macName));
      engine.clearNotice();
    }
  });

  const handleDeleteItem = (item: MirrorItemView) => {
    const existingTimer = pendingDeleteTimers.get(item.videoId);
    if (existingTimer) clearTimeout(existingTimer);

    const before = engine.deleteLocal(item.videoId);
    const commitTimer = setTimeout(() => {
      pendingDeleteTimers.delete(item.videoId);
      void engine.commitDeleteFiles(item.videoId);
    }, 4200);
    pendingDeleteTimers.set(item.videoId, commitTimer);

    showToast(c().toastDeleted(item.title), () => {
      const pending = pendingDeleteTimers.get(item.videoId);
      if (pending) {
        clearTimeout(pending);
        pendingDeleteTimers.delete(item.videoId);
      }
      engine.restoreLocal(item.videoId, before);
      Haptics.selection();
    });
  };

  const handleTapNotReady = (item: MirrorItemView) => {
    engine.prioritize(item.videoId);
    if (item.status === "syncing") {
      showToast(c().toastSyncingTap(Math.round(item.progress * 100)));
      return;
    }
    if (item.status === "away") {
      showToast(c().toastAwayTap(item.title, item.sources[0]?.shortName ?? ""));
      return;
    }
    showToast(c().toastPrioritized(item.title));
  };

  return (
    <View class="relative flex-1 bg-background">
      <NavStack state={nav} class="flex-1">
        {() => (
          <LibraryScreen
            engine={engine}
            canOpenSettings={() => canOpenSettings()}
            onOpenSettings={() => settingsOpen.set(true)}
            onOpenSystemSettings={() => void permissions.openAppSettings()}
            onOpenPair={() => void startPairingFlow(false)}
            onSelectReady={(item) => previewItem.set(item)}
            onDeleteItem={handleDeleteItem}
            onTapNotReady={handleTapNotReady}
          />
        )}
      </NavStack>

      {/* Floating iOS Undo / Info Toast */}
      {toast() ? (
        <View
          style={{ bottom: Math.max(16, safeArea().bottom + 12) }}
          class="absolute inset-x-4 flex-row items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-3 shadow-lg"
        >
          <Text class="min-w-0 flex-1 text-[13px] font-medium text-background">
            {toast()!.text}
          </Text>
          {toast()!.undo ? (
            <Button
              onPress={() => {
                const fn = toast()?.undo;
                toast.set(null);
                fn?.();
              }}
              class="shrink-0 rounded-lg px-2 py-1 active:opacity-70"
            >
              <Text class="text-[14px] font-bold text-tint">{c().undo}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}

      <SettingsSheet
        open={() => settingsOpen()}
        engine={engine}
        onClose={() => settingsOpen.set(false)}
        onOpenPair={() => void startPairingFlow(true)}
      />

      <PairModal
        open={() => pairOpen()}
        intent={() => pairIntent()}
        engine={engine}
        scannerAvailable={() => scannerAvailable()}
        canOpenSettings={() => canOpenSettings()}
        onRequestScan={() => void startPairingFlow(false)}
        onOpenSystemSettings={() => void permissions.openAppSettings()}
        onClose={() => {
          pairOpen.set(false);
        }}
        onPaired={(macName) => showToast(c().toastPaired(macName))}
      />

      <OfflinePreviewSheet
        item={() => previewItem()}
        locale={locale}
        onClose={() => previewItem.set(null)}
      />
    </View>
  );
}

mount(() => <EarMobileApp />);
