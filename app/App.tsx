import {
  colorScheme,
  effect,
  keymap,
  lifecycle,
  mount,
  Scroll,
  signal,
  View,
  type InputRef,
} from "nsh";
import { isAvailable, Menu, Window } from "nsh/desktop";
import {
  buildVideoPreview,
  fetchVideoPreviewMeta,
  readSystemClipboard,
  type ClipboardVideoPreview,
} from "./clipboard";
import { downloadLesson } from "./library/download";
import { deleteEntry, listEntriesSafe } from "./library/index";
import { exists } from "fs/promises";
import process from "process";
import {
  mediaRoot,
  openDirectory,
  openFileParentFolder,
} from "./library/paths";
import type { DownloadTaskProgress, LibraryEntry } from "./library/types";
import { localMediaCandidates, localMediaFileUrl } from "./player";
import { ActivityBanner, type ActivityKind } from "./ui/ActivityBanner";
import { MediaPlayer } from "./ui/MediaPlayer";
import { SettingsPanel } from "./ui/SettingsPanel";
import { initSettings, settings, updateSettings } from "./ui/settings";
import { TopBar, type MediaTab } from "./ui/TopBar";
import { isAudioEntry, LibraryView } from "./views/LibraryView";
import { hostFetch } from "./youtube/host";
import {
  captionTrackId,
  loadLesson,
  loadLessonFromParsed,
  preferEnglishTrack,
} from "./youtube/parse";
import type { LoadedLesson } from "./youtube/types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function App() {
  const url = signal("");
  const loading = signal(false);
  const saving = signal(false);
  const activityKind = signal<ActivityKind>(null);
  const activityProgress = signal(0);
  const activityTitle = signal("");
  const error = signal<string | null>(null);
  const status = signal<string | null>(null);
  const activeTab = signal<MediaTab>("video");
  const savedEntries = signal<LibraryEntry[]>([]);
  const clipboardPreview = signal<ClipboardVideoPreview | null>(null);
  const previewMetaMap = signal<Record<string, ClipboardVideoPreview>>({});
  const parsingMap = signal<Record<string, boolean>>({});
  const parseMessageMap = signal<Record<string, string>>({});
  const selectedQualityMap = signal<Record<string, string>>({});
  const selectedTrackMap = signal<Record<string, string>>({});
  const downloadTasks = signal<Record<string, DownloadTaskProgress>>({});
  const dismissedVideoId = signal<string | null>(null);
  const playingEntry = signal<LibraryEntry | null>(null);
  const playingSrc = signal<string | null>(null);
  const settingsOpen = signal(false);
  let urlInputRef: InputRef | null = null;
  const fetchingMetaIds = new Set<string>();
  const activeDownloadIds = new Set<string>();

  const ensurePreviewEnriched = (preview: ClipboardVideoPreview) => {
    const vid = preview.videoId;
    if (previewMetaMap()[vid] || fetchingMetaIds.has(vid)) {
      return;
    }
    fetchingMetaIds.add(vid);
    parsingMap.set({ ...parsingMap(), [vid]: true });
    parseMessageMap.set({
      ...parseMessageMap(),
      [vid]: "Connecting to YouTube…",
    });

    void fetchVideoPreviewMeta(preview, hostFetch, (ev) => {
      parseMessageMap.set({
        ...parseMessageMap(),
        [vid]: ev.message,
      });
    })
      .then((enriched) => {
        previewMetaMap.set({
          ...previewMetaMap(),
          [vid]: enriched,
        });

        // Default quality selection: prefer 720p, else first available quality
        if (!selectedQualityMap()[vid]) {
          const qs = enriched.qualities ?? [];
          const defQ =
            qs.find((q) => q.id === "720p")?.id ?? qs[0]?.id ?? "720p";
          selectedQualityMap.set({
            ...selectedQualityMap(),
            [vid]: defQ,
          });
        }

        // Default subtitle track selection: prefer Manual English, then CC English
        if (!selectedTrackMap()[vid]) {
          const pref = preferEnglishTrack(enriched.captionTracks ?? []);
          if (pref) {
            selectedTrackMap.set({
              ...selectedTrackMap(),
              [vid]: captionTrackId(pref),
            });
          }
        }
      })
      .finally(() => {
        fetchingMetaIds.delete(vid);
        const nextParsing = { ...parsingMap() };
        delete nextParsing[vid];
        parsingMap.set(nextParsing);
      });
  };

  if (isAvailable) {
    Window.setTitleBar({ style: "hidden", height: 44 });
  }

  // Auto-read clipboard on startup (when enabled) and when window becomes active
  const checkClipboard = async (forceShow = false) => {
    if (!forceShow && !settings().clipboardAuto) return;
    const text = await readSystemClipboard();
    const preview = buildVideoPreview(text, "clipboard");
    if (preview) {
      if (!forceShow && dismissedVideoId() === preview.videoId) return;
      if (forceShow) dismissedVideoId.set(null);
      clipboardPreview.set(preview);
      if (!url().trim()) {
        url.set(preview.rawUrl);
      }
    }
  };

  // Hydrate persisted state and local library on startup
  void initSettings().then((s) => {
    if (s.clipboardAuto) void checkClipboard();
  });
  void listEntriesSafe().then((entries) => {
    savedEntries.set(entries);
  });

  effect(() => {
    if (lifecycle() === "active" && settings().clipboardAuto) {
      void checkClipboard();
    }
  });

  // Active video prompt row (either from clipboard or typed YouTube link)
  const activePreview = (): ClipboardVideoPreview | null => {
    const typed = url().trim();
    const fromInput = typed
      ? buildVideoPreview(
          typed,
          clipboardPreview()?.rawUrl === typed ? "clipboard" : "input",
        )
      : null;
    const candidate = fromInput ?? clipboardPreview();
    if (!candidate) return null;
    if (dismissedVideoId() === candidate.videoId) return null;
    ensurePreviewEnriched(candidate);
    const enriched = previewMetaMap()[candidate.videoId];
    return enriched
      ? { ...enriched, rawUrl: candidate.rawUrl, source: candidate.source }
      : candidate;
  };

  const activeSelectedQualityId = (): string => {
    const cur = activePreview();
    if (!cur) return "720p";
    return selectedQualityMap()[cur.videoId] ?? "720p";
  };

  const activeSelectedTrackId = (): string | null => {
    const cur = activePreview();
    if (!cur) return null;
    const explicit = selectedTrackMap()[cur.videoId];
    if (explicit) return explicit;
    const tracks = cur.captionTracks ?? [];
    const pref = preferEnglishTrack(tracks);
    return pref ? captionTrackId(pref) : "en:manual";
  };

  const activeDownloadsList = (): DownloadTaskProgress[] =>
    Object.values(downloadTasks());

  const topBarActivityKind = (): ActivityKind => {
    if (activityKind()) return activityKind();
    const cur = activePreview();
    if (cur && parsingMap()[cur.videoId]) return "parsing";
    if (activeDownloadsList().length > 0) return "downloading";
    return null;
  };

  const topBarActivityProgress = (): number => {
    if (activityKind()) return activityProgress();
    const dls = activeDownloadsList();
    if (dls.length > 0) {
      const sum = dls.reduce((acc, d) => acc + d.percent, 0);
      return Math.round(sum / dls.length);
    }
    return 0;
  };

  const resolveLessonForPreview = async (
    value: string,
    qualityId: string,
    trackId: string | null,
  ): Promise<LoadedLesson> => {
    const curPreview = activePreview();
    if (curPreview?.parsedVideo && curPreview.rawUrl === value) {
      return loadLessonFromParsed(curPreview.parsedVideo, {
        qualityId,
        trackId,
        fetchImpl: hostFetch,
      });
    }
    return loadLesson(value, hostFetch, {
      qualityId,
      trackId,
    });
  };

  const downloadTargetLesson = async (
    target: LoadedLesson,
    qualityId?: string,
  ) => {
    const vid = target.video.videoId;
    if (activeDownloadIds.has(vid)) return;
    activeDownloadIds.add(vid);
    saving.set(true);
    error.set(null);

    const effectiveQuality =
      qualityId ??
      selectedQualityMap()[vid] ??
      target.selectedQuality?.id ??
      "720p";

    // Auto-switch tab to match downloading media type immediately
    if (effectiveQuality === "audio") {
      activeTab.set("audio");
    } else {
      activeTab.set("video");
    }

    // Immediately display active download in library list at 0%
    downloadTasks.set({
      ...downloadTasks(),
      [vid]: {
        videoId: vid,
        title: target.video.title || "Downloading video…",
        thumbnailUrl:
          target.video.thumbnailUrl ||
          `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        qualityLabel:
          effectiveQuality === "audio"
            ? "Audio (M4A)"
            : `${effectiveQuality} MP4`,
        subtitleLabel: target.track?.name ?? "English",
        subtitleIsAuto: target.track?.isAuto ?? false,
        targetPath: "",
        stage: "starting",
        percent: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedBps: 0,
        etaSeconds: null,
      },
    });

    try {
      const { entry, audioNote } = await downloadLesson(target, {
        fetchImpl: hostFetch,
        downloadFolder: settings().downloadFolder,
        qualityId: effectiveQuality,
        onProgress: (prog) => {
          downloadTasks.set({
            ...downloadTasks(),
            [vid]: prog,
          });
        },
      });
      const entries = await listEntriesSafe();
      savedEntries.set(entries);

      // Auto-switch tab to match downloaded media type
      if (isAudioEntry(entry)) {
        activeTab.set("audio");
      } else {
        activeTab.set("video");
      }

      await delay(300);
      status.set(
        entry.videoPath
          ? `Downloaded (${entry.quality ?? effectiveQuality}) → ${entry.videoPath}`
          : entry.audioPath
            ? `Downloaded audio → ${entry.audioPath}`
            : audioNote
              ? `Downloaded captions → ${entry.captionsPath} (${audioNote})`
              : `Downloaded locally → ${entry.captionsPath}`,
      );
    } catch (e) {
      error.set(e instanceof Error ? e.message : String(e));
    } finally {
      activeDownloadIds.delete(vid);
      const next = { ...downloadTasks() };
      delete next[vid];
      downloadTasks.set(next);
      saving.set(activeDownloadIds.size > 0);
    }
  };

  // User triggers download (either via button or Return ↵ in omnibar)
  const onStartDownload = async (previewCandidate?: ClipboardVideoPreview | null) => {
    const cur = previewCandidate ?? activePreview();
    const rawVal = url().trim();
    if (!cur && !rawVal) return;
    if (loading()) return;

    loading.set(true);
    error.set(null);
    status.set(null);

    const chosenQualityId = activeSelectedQualityId();
    const chosenTrackId = activeSelectedTrackId();

    try {
      activityKind.set("parsing");
      activityTitle.set(cur?.title || rawVal);
      const loaded = cur?.parsedVideo
        ? await loadLessonFromParsed(cur.parsedVideo, {
            qualityId: chosenQualityId,
            trackId: chosenTrackId,
            fetchImpl: hostFetch,
          })
        : await resolveLessonForPreview(
            cur?.rawUrl || rawVal,
            chosenQualityId,
            chosenTrackId,
          );

      if (cur) dismissedVideoId.set(cur.videoId);
      url.set("");
      activityKind.set(null);
      void downloadTargetLesson(loaded, chosenQualityId);
    } catch (e) {
      activityKind.set(null);
      error.set(e instanceof Error ? e.message : String(e));
    } finally {
      loading.set(false);
    }
  };

  const handleOpenEntry = async (entry: LibraryEntry) => {
    const candidates = localMediaCandidates({
      videoId: entry.videoId,
      videoPath: entry.videoPath,
      audioPath: entry.audioPath,
      dataDir: process.dataDir ?? null,
    });
    let src: string | null = null;
    for (const path of candidates) {
      try {
        if (await exists(path)) {
          src = path;
          break;
        }
      } catch {
        // try next
      }
    }
    src = src ?? localMediaFileUrl(entry);
    if (!src) {
      error.set(`没有可播放的本地文件：${entry.title}`);
      return;
    }
    error.set(null);
    playingSrc.set(src);
    playingEntry.set(entry);
  };

  const handleOpenFolder = async (entry: LibraryEntry) => {
    const target = entry.videoPath || entry.audioPath || entry.captionsPath;
    if (target) {
      await openFileParentFolder(target);
    } else {
      await openDirectory(mediaRoot(settings().downloadFolder));
    }
  };

  const handleDeleteEntry = async (entry: LibraryEntry) => {
    await deleteEntry(entry.videoId);
    const updated = await listEntriesSafe();
    savedEntries.set(updated);
  };

  keymap.bind({
    "mod+l": () => urlInputRef?.focus(),
    "mod+k": () => urlInputRef?.focus(),
    "mod+,": () => settingsOpen.set(!settingsOpen()),
    escape: () => {
      if (playingEntry()) {
        playingEntry.set(null);
        playingSrc.set(null);
        return;
      }
      if (settingsOpen()) {
        settingsOpen.set(false);
        return;
      }
      const cur = activePreview();
      if (cur) dismissedVideoId.set(cur.videoId);
    },
    "mod+1": () => activeTab.set("video"),
    "mod+2": () => activeTab.set("audio"),
  });

  effect(() => {
    if (!isAvailable) return;
    const tabName = activeTab() === "video" ? "Video" : "Audio";
    Window.setTitle(`Ear — ${tabName}`);

    Menu.setApplicationMenu([
      {
        label: "File",
        submenu: [
          {
            label: "Focus Link Field",
            shortcut: "mod+l",
            onSelect: () => urlInputRef?.focus(),
          },
          {
            label: "Read Link from Clipboard",
            onSelect: () => void checkClipboard(true),
          },
          {
            label: "Open Download Folder",
            onSelect: () =>
              void openDirectory(mediaRoot(settings().downloadFolder)),
          },
          { type: "separator" },
          {
            label: "Settings…",
            shortcut: "mod+,",
            onSelect: () => settingsOpen.set(true),
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "Video",
            shortcut: "mod+1",
            checked: activeTab() === "video",
            onSelect: () => activeTab.set("video"),
          },
          {
            label: "Audio",
            shortcut: "mod+2",
            checked: activeTab() === "audio",
            onSelect: () => activeTab.set("audio"),
          },
          { type: "separator" },
          {
            label: "Switch Appearance",
            onSelect: () =>
              updateSettings({
                appearance: colorScheme() === "dark" ? "light" : "dark",
              }),
          },
        ],
      },
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          { role: "toggleFullScreen" },
        ],
      },
    ]);
  });

  const videoEntriesCount = () =>
    savedEntries().filter((e) => !isAudioEntry(e)).length;
  const audioEntriesCount = () =>
    savedEntries().filter((e) => isAudioEntry(e)).length;

  return (
    <View class="relative flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* 1. Top bar with expandable omnibar + Video / Audio tabs */}
      <TopBar
        url={url}
        onUrlChange={(v) => {
          url.set(v);
          dismissedVideoId.set(null);
        }}
        onClearUrl={() => {
          const cur = activePreview();
          if (cur) dismissedVideoId.set(cur.videoId);
          url.set("");
        }}
        onInputRef={(ref) => {
          urlInputRef = ref;
        }}
        onSubmitParse={() => void onStartDownload()}
        onReadClipboard={() => void checkClipboard(true)}
        showClipboardButton={() =>
          !settings().clipboardAuto && url().length === 0
        }
        loading={loading}
        parsing={() => {
          const cur = activePreview();
          return cur ? Boolean(parsingMap()[cur.videoId]) : false;
        }}
        parseMessage={() => {
          const cur = activePreview();
          return cur ? (parseMessageMap()[cur.videoId] ?? "") : "";
        }}
        activePreview={activePreview}
        selectedQualityId={activeSelectedQualityId}
        onSelectQuality={(q) => {
          const cur = activePreview();
          if (cur) {
            selectedQualityMap.set({
              ...selectedQualityMap(),
              [cur.videoId]: q,
            });
          }
        }}
        selectedTrackId={activeSelectedTrackId}
        onSelectTrack={(t) => {
          const cur = activePreview();
          if (cur) {
            selectedTrackMap.set({
              ...selectedTrackMap(),
              [cur.videoId]: t,
            });
          }
        }}
        onDownloadPreview={(p: ClipboardVideoPreview) => void onStartDownload(p)}
        onDismissPreview={() => {
          const cur = activePreview();
          if (cur) dismissedVideoId.set(cur.videoId);
        }}
        activeTab={activeTab}
        onSelectTab={(tab: MediaTab) => activeTab.set(tab)}
        videoCount={videoEntriesCount}
        audioCount={audioEntriesCount}
        activeDownloadCount={() => activeDownloadsList().length}
        onOpenSettings={() => settingsOpen.set(true)}
        activityKind={topBarActivityKind}
        activityProgress={topBarActivityProgress}
      />

      {/* 2. Workspace scroll area: Download telemetry banner + Media list */}
      <Scroll class="flex-1">
        <View class="mx-auto w-full max-w-[960px] gap-4 p-4 md:p-5">
          <ActivityBanner
            kind={activityKind}
            progress={activityProgress}
            targetTitle={activityTitle}
            error={error}
            status={status}
            onDismissStatus={() => {
              error.set(null);
              status.set(null);
            }}
          />

          <LibraryView
            activeTab={activeTab}
            savedEntries={savedEntries}
            activeDownloads={activeDownloadsList}
            onOpenEntry={(entry) => void handleOpenEntry(entry)}
            onOpenFolder={(entry) => void handleOpenFolder(entry)}
            onDeleteEntry={(entry) => void handleDeleteEntry(entry)}
          />
        </View>
      </Scroll>

      {/* 3. In-app media player (bare path via nsh <Video>) */}
      <If when={playingEntry() && playingSrc()}>
        {() => (
          <MediaPlayer
            entry={() => playingEntry()!}
            src={() => playingSrc()!}
            onClose={() => {
              playingEntry.set(null);
              playingSrc.set(null);
            }}
          />
        )}
      </If>

      {/* 4. Settings modal overlay */}
      <If when={settingsOpen()}>
        <SettingsPanel onClose={() => settingsOpen.set(false)} />
      </If>
    </View>
  );
}

mount(App);
