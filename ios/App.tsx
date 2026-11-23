import { effect, lifecycle, mount, safeArea, signal, Text, UrlScheme, View } from "nsh";
import { Button, createNavStack, NavStack } from "nsh/base";
import { Haptics } from "nsh/mobile";
import { copyFor } from "./i18n";
import { mirrorEngine, type MirrorEngine } from "./mirror/engine";
import { parsePairUrl } from "./mirror/transport";
import type { MirrorItemView } from "./mirror/types";
import { LibraryScreen } from "./views/LibraryScreen";
import { OfflinePreviewSheet } from "./views/OfflinePreviewSheet";
import { PairModal } from "./views/PairModal";
import { SettingsSheet } from "./views/SettingsSheet";

const POLL_INTERVAL_MS = 5000;

interface ToastState {
  text: string;
  undo?: () => void;
}

export function EarMobileApp(props?: { engine?: MirrorEngine; disableAutoPoll?: boolean }) {
  const engine = props?.engine ?? mirrorEngine;
  const nav = createNavStack(["library"] as const);
  const settingsOpen = signal(false);
  const pairOpen = signal(false);
  const incomingPairUrl = signal<string | null>(null);
  const previewItem = signal<MirrorItemView | null>(null);
  const toast = signal<ToastState | null>(null);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
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

  const handleOpenPairUrl = (url: string | null) => {
    if (!url || !parsePairUrl(url)) return;
    settingsOpen.set(false);
    incomingPairUrl.set(url);
    pairOpen.set(true);
  };

  // Initial hydration + URL scheme listener + auto LAN poll.
  effect(() => {
    let disposed = false;
    void engine.hydrate().then(() => {
      if (!disposed && !props?.disableAutoPoll) {
        void engine.pollAllMacs();
      }
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
            onOpenSettings={() => settingsOpen.set(true)}
            onOpenPair={() => {
              incomingPairUrl.set(null);
              pairOpen.set(true);
            }}
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
        onOpenPair={() => {
          incomingPairUrl.set(null);
          pairOpen.set(true);
        }}
      />

      <PairModal
        open={() => pairOpen()}
        engine={engine}
        initialUrl={() => incomingPairUrl()}
        onClose={() => {
          pairOpen.set(false);
          incomingPairUrl.set(null);
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
