import {
  effect,
  keymap,
  lifecycle,
  mount,
  Scroll,
  signal,
  View,
  type InputRef,
} from "nsh";
import { Application, currentWindow, isAvailable } from "nsh/desktop";
import { createDownloadController } from "./appDownloads";
import {
  localDiscoverEntry,
  resolvePlayableSrc,
  revealEntry,
} from "./appMedia";
import { createPreviewController } from "./appPreview";
import { installAppMenu, setupWindowChrome } from "./appWindow";
import type { ClipboardVideoPreview } from "./clipboard";
import { isDevMode } from "./env";
import { deleteEntry, listEntriesSafe } from "./library/index";
import type { LibraryEntry } from "./library/types";
import { DevRibbon } from "./ui/DevRibbon";
import { initSettings, settings } from "./ui/settings";
import { shellT } from "./ui/shellI18n";
import { ShortcutsModal } from "./ui/ShortcutsModal";
import { showToast, ToastHost } from "./ui/Toast";
import { TopBar, type MediaTab } from "./ui/TopBar";
import { UpdateModal } from "./ui/UpdateModal";
import {
  checkUpdateInBackground,
  dismissGlobalUpdateModal,
  globalUpdateModalOpen,
} from "./updater";
import { DiscoverView } from "./views/discover/DiscoverView";
import { loadDiscover } from "./views/discover/source";
import type { DiscoverItem } from "./views/discover/types";
import { LibraryView } from "./views/LibraryView";
import { SettingsView } from "./views/SettingsView";
import { VideoDetailView } from "./views/VideoDetailView";
import type { ViewTransitionRect } from "./views/viewTransition";
import { extractVideoId } from "./youtube/parse";

function App() {
  const url = signal("");
  const activeTab = signal<MediaTab>("discover");
  /** The page Settings returns to. */
  const previousTab = signal<"discover" | "library">("discover");
  const savedEntries = signal<LibraryEntry[]>([]);
  const playingEntry = signal<LibraryEntry | null>(null);
  const playingSrc = signal<string | null>(null);
  const transitionOriginRect = signal<ViewTransitionRect | null>(null);
  const showShortcutsModal = signal(false);
  let urlInputRef: InputRef | null = null;
  /** Until the user picks a page, the first library load picks it. */
  let startPageChosen = false;

  const preview = createPreviewController(url);
  const downloads = createDownloadController({
    savedEntries,
    onError: (message) => showToast(message || shellT().downloadFailed, "error"),
  });

  const selectTab = (tab: MediaTab) => {
    startPageChosen = true;
    if (tab !== "settings") previousTab.set(tab);
    activeTab.set(tab);
  };
  const toggleSettings = () =>
    selectTab(activeTab() === "settings" ? previousTab() : "settings");
  const toggleShortcutsModal = () => {
    if (globalUpdateModalOpen()) return;
    showShortcutsModal.set(!showShortcutsModal());
  };
  const focusLink = () => setTimeout(() => urlInputRef?.focus(), 50);

  setupWindowChrome();
  void checkUpdateInBackground();
  void loadDiscover();

  void initSettings().then((s) => {
    if (s.clipboardAuto) void preview.checkClipboard();
  });
  void listEntriesSafe().then((entries) => {
    savedEntries.set(entries);
    // Start page: the Library when it has anything, else Discover.
    if (!startPageChosen && entries.length > 0) {
      previousTab.set("library");
      activeTab.set("library");
    }
    startPageChosen = true;
  });

  effect(() => {
    if (lifecycle() === "active" && settings().clipboardAuto) {
      void preview.checkClipboard();
    }
  });

  // Refresh the library for downloads the CLI runs in the background.
  effect(() => {
    if (lifecycle() !== "active") return;
    const interval = setInterval(() => void downloads.refresh(), 1500);
    return () => clearInterval(interval);
  });

  const downloadPreview = (p: ClipboardVideoPreview | null = preview.active()) => {
    if (!p) return;
    const qualityId = preview.qualityId();
    const trackId = preview.trackId();
    preview.reset(p.videoId);
    urlInputRef?.blur();
    void downloads.start({
      videoId: p.videoId,
      url: p.rawUrl,
      title: p.title,
      thumbnailUrl: p.thumbnailUrl,
      qualityId,
      trackId,
      parsed: p.parsedVideo ?? null,
    });
  };

  const openEntry = async (
    entry: LibraryEntry,
    originRect?: ViewTransitionRect | null,
  ) => {
    transitionOriginRect.set(originRect ?? null);
    const src = await resolvePlayableSrc(entry);
    if (!src) {
      showToast(shellT().noLocalFile(entry.title), "error");
      return;
    }
    playingSrc.set(src);
    playingEntry.set(entry);
  };

  const deleteLibraryEntry = async (entry: LibraryEntry) => {
    await deleteEntry(entry.videoId, { deleteMediaFile: true });
    await downloads.refresh();
  };

  /** A Discover card's one action: open it when downloaded, else download it. */
  const selectDiscoverItem = async (
    item: DiscoverItem,
    originRect?: ViewTransitionRect | null,
  ) => {
    const existing =
      savedEntries().find((e) => e.videoId === item.videoId && e.state === "ready") ??
      (await localDiscoverEntry(item));
    if (existing) {
      await openEntry(existing, originRect);
      return;
    }
    if (downloads.list().some((d) => d.videoId === item.videoId)) return;
    void downloads.start({
      videoId: item.videoId,
      url: item.url,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      qualityId: settings().defaultQuality ?? "360p",
      language: item.language,
    });
  };

  const isBackgroundDisabled = () =>
    Boolean(playingEntry()) || showShortcutsModal() || globalUpdateModalOpen();

  keymap.bind(
    {
      enter: () => {
        if (isBackgroundDisabled()) return;
        if (preview.active()) downloadPreview();
      },
      "shift+/": toggleShortcutsModal,
      f1: toggleShortcutsModal,
    },
    { when: "notEditing" },
  );

  keymap.bind({
    "mod+l": () => {
      if (!isBackgroundDisabled()) focusLink();
    },
    "mod+k": () => {
      if (!isBackgroundDisabled()) focusLink();
    },
    "mod+,": () => {
      if (!isBackgroundDisabled()) toggleSettings();
    },
    "mod+1": () => {
      if (!isBackgroundDisabled()) selectTab("discover");
    },
    "mod+2": () => {
      if (!isBackgroundDisabled()) selectTab("library");
    },
    escape: () => {
      if (globalUpdateModalOpen()) {
        dismissGlobalUpdateModal();
        return;
      }
      if (showShortcutsModal()) {
        showShortcutsModal.set(false);
        return;
      }
      // The player closes itself with its own transition.
      if (playingEntry()) return;
      if (preview.active()) {
        preview.dismiss();
        return;
      }
      if (activeTab() === "settings") selectTab(previousTab());
    },
  });

  effect(() => {
    if (!isAvailable) return;
    return Application.on("secondInstance", (launch) => {
      try {
        currentWindow().focus();
      } catch {
        // outside a window
      }
      const arg = (launch.args ?? []).find((a) => extractVideoId(a));
      if (arg) {
        preview.undismiss();
        url.set(arg);
      }
    });
  });

  installAppMenu({
    activeTab,
    selectTab,
    toggleSettings,
    focusLink: () => urlInputRef?.focus(),
    readClipboard: () => void preview.checkClipboard(true),
    toggleShortcuts: toggleShortcutsModal,
  });

  return (
    <View class="relative flex-1 flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={selectTab}
        onOpenSettings={toggleSettings}
        activeDownloadCount={() => downloads.list().length}
        url={url}
        onUrlChange={(v) => {
          url.set(v);
          preview.undismiss();
        }}
        onClearUrl={() => {
          preview.dismiss();
          url.set("");
        }}
        onInputRef={(ref) => {
          urlInputRef = ref;
        }}
        onSubmit={() => downloadPreview()}
        onReadClipboard={() => void preview.checkClipboard(true)}
        showClipboardButton={() => !settings().clipboardAuto && url().length === 0}
        preview={preview.active}
        parsing={preview.isParsing}
        selectedQualityId={preview.qualityId}
        onSelectQuality={preview.selectQuality}
        selectedTrackId={preview.trackId}
        onSelectTrack={preview.selectTrack}
        onDownload={(p) => downloadPreview(p)}
        onDismissPreview={preview.dismiss}
      />

      <If when={activeTab() === "settings"}>
        <View class="min-h-0 flex-1">
          <SettingsView onOpenShortcuts={toggleShortcutsModal} />
        </View>
      </If>

      <If when={activeTab() !== "settings"}>
        <Scroll class="flex-1">
          <View class="mx-auto w-full max-w-[1440px] p-4">
            <If when={activeTab() === "discover"}>
              <DiscoverView
                disabled={isBackgroundDisabled}
                onSelectItem={(item, rect) => void selectDiscoverItem(item, rect)}
                savedEntries={savedEntries}
                activeDownloads={downloads.list}
              />
            </If>
            <If when={activeTab() === "library"}>
              <LibraryView
                disabled={isBackgroundDisabled}
                savedEntries={savedEntries}
                activeDownloads={downloads.list}
                onOpenEntry={(entry, rect) => void openEntry(entry, rect)}
                onOpenFolder={(entry) => void revealEntry(entry)}
                onDeleteEntry={(entry) => void deleteLibraryEntry(entry)}
                onPauseDownload={downloads.pause}
                onResumeDownload={(vid) => void downloads.resume(vid)}
                onCancelDownload={(vid) => void downloads.cancel(vid)}
              />
            </If>
          </View>
        </Scroll>
      </If>

      <ToastHost />

      <If when={playingEntry() && playingSrc()}>
        {() => (
          <VideoDetailView
            entry={() => playingEntry()!}
            src={() => playingSrc()!}
            originRect={() => transitionOriginRect()}
            disabled={() => showShortcutsModal() || globalUpdateModalOpen()}
            onClose={() => {
              playingEntry.set(null);
              playingSrc.set(null);
              transitionOriginRect.set(null);
            }}
          />
        )}
      </If>

      <If when={isDevMode()}>
        <DevRibbon />
      </If>

      <ShortcutsModal
        open={showShortcutsModal}
        onClose={() => showShortcutsModal.set(false)}
      />

      <UpdateModal />
    </View>
  );
}

mount(App);
