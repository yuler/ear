import {
  cleanup,
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
import { deleteEntry, listEntriesSafe, writeEntry } from "./library/index";
import { mediaRoot, openDirectory } from "./library/paths";
import { backfillVideoDimensions, needsDimensionProbe } from "./library/probe";
import { queryDiskSpace, type DiskSpaceInfo } from "./library/storage";
import type { LibraryEntry } from "./library/types";
import { noteDownloadError, recheckFfmpeg } from "./ffmpeg/notice";
import { DevRibbon } from "./ui/DevRibbon";
import { FfmpegBanner } from "./ui/FfmpegNotice";
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
import { isNativeHost } from "./youtube/host";
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
  const diskSpace = signal<DiskSpaceInfo | null>(null);
  const probedVideoIds = new Set<string>();
  let urlInputRef: InputRef | null = null;
  const downloadFolder = () => mediaRoot(settings().downloadFolder);

  const applyVideoDimensions = (
    updates: Record<string, { width: number; height: number }>,
  ) => {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    savedEntries.update((list) =>
      list.map((item) => {
        const dims = updates[item.videoId];
        if (!dims) return item;
        if (item.videoWidth === dims.width && item.videoHeight === dims.height) {
          return item;
        }
        return { ...item, videoWidth: dims.width, videoHeight: dims.height };
      }),
    );
    const curPlaying = playingEntry();
    const curDims = curPlaying ? updates[curPlaying.videoId] : undefined;
    if (
      curPlaying &&
      curDims &&
      (curPlaying.videoWidth !== curDims.width ||
        curPlaying.videoHeight !== curDims.height)
    ) {
      playingEntry.set({
        ...curPlaying,
        videoWidth: curDims.width,
        videoHeight: curDims.height,
      });
    }
  };

  const recordMediaDimensions = (videoId: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const roundedW = Math.round(width);
    const roundedH = Math.round(height);
    probedVideoIds.add(videoId);
    applyVideoDimensions({ [videoId]: { width: roundedW, height: roundedH } });
    const existing = savedEntries().find((e) => e.videoId === videoId);
    if (existing) {
      void writeEntry({ ...existing, videoWidth: roundedW, videoHeight: roundedH }).catch(
        () => {},
      );
    }
  };

  const preview = createPreviewController(url);
  const downloads = createDownloadController({
    savedEntries,
    onError: (message) => {
      noteDownloadError(message);
      showToast(message || shellT().downloadFailed, "error");
    },
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
  if (isNativeHost()) void recheckFfmpeg();
  void loadDiscover();

  void initSettings().then((s) => {
    if (s.clipboardAuto) void preview.checkClipboard();
  });
  void listEntriesSafe().then((entries) => {
    savedEntries.set(entries);
  });

  // Probe dimensions once for legacy local videos missing videoWidth/videoHeight
  // so Home cards show their orientation icon and detail transitions start in the right mode.
  let unmounted = false;
  cleanup(() => {
    unmounted = true;
  });
  effect(() => {
    const list = savedEntries();
    if (!list.some((e) => !probedVideoIds.has(e.videoId) && needsDimensionProbe(e))) {
      return;
    }
    void backfillVideoDimensions(list, probedVideoIds).then((updates) => {
      if (!unmounted) applyVideoDimensions(updates);
    });
  });

  effect(() => {
    if (lifecycle() === "active" && settings().clipboardAuto) {
      void preview.checkClipboard();
    }
  });

  let lastQueriedDir: string | null = null;
  effect(() => {
    const dir = downloadFolder();
    // Re-query when library entry count changes or window becomes active.
    const _count = savedEntries().length;
    const _state = lifecycle();
    let cancelled = false;
    const delayMs = lastQueriedDir !== null && lastQueriedDir !== dir ? 350 : 0;
    const run = () => {
      if (cancelled) return;
      lastQueriedDir = dir;
      void queryDiskSpace(dir).then((info) => {
        if (cancelled) return;
        if (info) {
          diskSpace.set(info);
        } else if (diskSpace()?.path !== dir) {
          diskSpace.set(null);
        }
      });
    };
    const timer = delayMs > 0 ? setTimeout(run, delayMs) : null;
    if (!timer) run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
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
    const latest =
      savedEntries().find((e) => e.videoId === entry.videoId) ?? entry;
    transitionOriginRect.set(originRect ?? null);
    const src = await resolvePlayableSrc(latest);
    if (!src) {
      showToast(shellT().noLocalFile(latest.title), "error");
      return;
    }
    playingSrc.set(src);
    playingEntry.set(latest);
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
        onLogoPress={() => selectPage("library")}
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

      <FfmpegBanner />

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
          downloadFolder={downloadFolder}
          diskSpace={diskSpace}
          onOpenDownloadFolder={() => void openDirectory(downloadFolder())}
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
              previewOpen={() => Boolean(preview.active())}
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
            onMediaDimensions={recordMediaDimensions}
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

      <ToastHost />
    </View>
  );
}

mount(App);
