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
import { isLinkText, type ClipboardVideoPreview } from "./clipboard";
import { isDevMode } from "./env";
import { deleteEntry, listEntriesSafe } from "./library/index";
import type { LibraryEntry } from "./library/types";
import { DevRibbon } from "./ui/DevRibbon";
import { initSettings, settings } from "./ui/settings";
import { SettingsModal } from "./ui/SettingsModal";
import { shellT } from "./ui/shellI18n";
import { ShortcutsModal } from "./ui/ShortcutsModal";
import { showToast, ToastHost } from "./ui/Toast";
import { TopBar, type AppPage } from "./ui/TopBar";
import { UpdateModal } from "./ui/UpdateModal";
import {
  checkUpdateInBackground,
  dismissGlobalUpdateModal,
  globalUpdateModalOpen,
} from "./updater";
import { DiscoverView } from "./views/discover/DiscoverView";
import {
  discoverItems,
  isDiscoverLoading,
  loadDiscover,
} from "./views/discover/source";
import type { DiscoverItem } from "./views/discover/types";
import { LibraryView } from "./views/LibraryView";
import { VideoDetailView } from "./views/VideoDetailView";
import type { ViewTransitionRect } from "./views/viewTransition";
import { extractVideoId } from "./youtube/parse";

function App() {
  const url = signal("");
  const activePage = signal<AppPage>("library");
  const savedEntries = signal<LibraryEntry[]>([]);
  const playingEntry = signal<LibraryEntry | null>(null);
  const playingSrc = signal<string | null>(null);
  const transitionOriginRect = signal<ViewTransitionRect | null>(null);
  const showSettingsModal = signal(false);
  const showShortcutsModal = signal(false);
  let urlInputRef: InputRef | null = null;

  const preview = createPreviewController(url);
  const downloads = createDownloadController({
    savedEntries,
    onError: (message) => showToast(message || shellT().downloadFailed, "error"),
  });

  const isLink = () => isLinkText(url());
  const searchQuery = () => (isLink() ? "" : url().trim());

  const selectPage = (page: AppPage) => {
    activePage.set(page);
  };
  const toggleSettings = () => {
    if (globalUpdateModalOpen()) return;
    showSettingsModal.set(!showSettingsModal());
  };
  const toggleShortcutsModal = () => {
    if (globalUpdateModalOpen()) return;
    showShortcutsModal.set(!showShortcutsModal());
  };
  const openShortcutsFromSettings = () => {
    if (globalUpdateModalOpen()) return;
    showSettingsModal.set(false);
    showShortcutsModal.set(true);
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
      language: p.language ?? null,
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

  const deleteLibraryEntries = async (entries: LibraryEntry[]) => {
    for (const entry of entries) {
      await deleteEntry(entry.videoId, { deleteMediaFile: true });
    }
    await downloads.refresh();
  };

  /**
   * Discover card press: open it when already downloaded; otherwise load its
   * URL into the top search bar so the user can pick format & quality first.
   */
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
    preview.selectFromDiscover(item);
  };

  const isBackgroundDisabled = () =>
    Boolean(playingEntry()) ||
    showSettingsModal() ||
    showShortcutsModal() ||
    globalUpdateModalOpen();

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
      if (!playingEntry() && !showShortcutsModal() && !globalUpdateModalOpen()) {
        toggleSettings();
      }
    },
    "mod+1": () => {
      if (!isBackgroundDisabled()) selectPage("library");
    },
    "mod+2": () => {
      if (!isBackgroundDisabled()) selectPage("discover");
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
      if (showSettingsModal()) {
        showSettingsModal.set(false);
        return;
      }
      // The player closes itself with its own transition.
      if (playingEntry()) return;
      if (preview.active()) {
        preview.dismiss();
        return;
      }
      if (activePage() === "discover") {
        selectPage("library");
      }
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
    activePage,
    selectPage,
    toggleSettings,
    focusLink: () => urlInputRef?.focus(),
    readClipboard: () => void preview.checkClipboard(true),
    toggleShortcuts: toggleShortcutsModal,
  });

  return (
    <View class="relative flex-1 flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <TopBar
        settingsOpen={showSettingsModal}
        onOpenSettings={toggleSettings}
        url={url}
        isLink={isLink}
        onUrlChange={(v) => {
          url.set(v);
          if (isLinkText(v)) preview.undismiss();
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
        parseMessage={preview.parseMessage}
        selectedQualityId={preview.qualityId}
        onSelectQuality={preview.selectQuality}
        selectedTrackId={preview.trackId}
        onSelectTrack={preview.selectTrack}
        onDownload={(p) => downloadPreview(p)}
        onDismissPreview={preview.dismiss}
      />

      <If when={activePage() === "library"}>
        <LibraryView
          disabled={isBackgroundDisabled}
          previewOpen={() => Boolean(preview.active())}
          savedEntries={savedEntries}
          activeDownloads={downloads.list}
          searchQuery={searchQuery}
          onClearSearch={() => url.set("")}
          discoverItems={discoverItems}
          discoverLoading={isDiscoverLoading}
          onSelectDiscoverItem={(item, rect) =>
            void selectDiscoverItem(item, rect)
          }
          onOpenDiscover={() => selectPage("discover")}
          onOpenEntry={(entry, rect) => void openEntry(entry, rect)}
          onOpenFolder={(entry) => void revealEntry(entry)}
          onDeleteEntry={(entry) => void deleteLibraryEntry(entry)}
          onDeleteEntries={(entries) => void deleteLibraryEntries(entries)}
          onPauseDownload={downloads.pause}
          onResumeDownload={(vid) => void downloads.resume(vid)}
          onCancelDownload={(vid) => void downloads.cancel(vid)}
        />
      </If>

      <If when={activePage() === "discover"}>
        <Scroll class="min-h-0 flex-1">
          <View class="mx-auto w-full max-w-[1440px] px-4 pt-2 pb-4">
            <DiscoverView
              disabled={isBackgroundDisabled}
              onBack={() => selectPage("library")}
              onSelectItem={(item, rect) => void selectDiscoverItem(item, rect)}
              savedEntries={savedEntries}
              activeDownloads={downloads.list}
              searchQuery={searchQuery}
              onClearSearch={() => url.set("")}
            />
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
            disabled={() =>
              showSettingsModal() ||
              showShortcutsModal() ||
              globalUpdateModalOpen()
            }
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

      <SettingsModal
        open={showSettingsModal}
        onClose={() => showSettingsModal.set(false)}
        onOpenShortcuts={openShortcutsFromSettings}
      />

      <ShortcutsModal
        open={showShortcutsModal}
        onClose={() => showShortcutsModal.set(false)}
      />

      <UpdateModal />
    </View>
  );
}

mount(App);
