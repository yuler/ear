import {
  colorScheme,
  effect,
  keymap,
  LayoutAnimation,
  lifecycle,
  mount,
  platform,
  Scroll,
  signal,
  View,
  type InputRef,
} from "nsh";
import { Application, currentWindow, isAvailable, Menu } from "nsh/desktop";
import {
  buildVideoPreview,
  fetchVideoPreviewMeta,
  formatDurationMs,
  readSystemClipboard,
  type ClipboardVideoPreview,
} from "./clipboard";
import { extractVideoId } from "./youtube/parse";
import { downloadLesson } from "./library/download";
import {
  deleteEntry,
  listEntriesSafe,
  loadLessonFromEntry,
  normalizeEntry,
  readEntry,
  upsertEntry,
} from "./library/index";
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
import { Sidebar } from "./ui/Sidebar";
import { VideoDetailView } from "./views/VideoDetailView";
import { SettingsView } from "./views/SettingsView";
import { initSettings, settings, updateSettings } from "./ui/settings";
import { TopBar, type MediaTab } from "./ui/TopBar";
import { playDingSound } from "./ui/sound";
import { isAudioEntry, LibraryView } from "./views/LibraryView";
import { DiscoverView } from "./views/discover/DiscoverView";
import { discoverItems, loadDiscover } from "./views/discover/source";
import type { DiscoverItem } from "./views/discover/types";
import type { ViewTransitionRect } from "./views/viewTransition";
import { hostFetch } from "./youtube/host";
import {
  captionTrackId,
  loadLesson,
  loadLessonFromParsed,
  preferBestCaptionTrack,
  preferEnglishTrack,
} from "./youtube/parse";
import type { LoadedLesson } from "./youtube/types";
import { checkUpdateInBackground } from "./updater";

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
  const previousTab = signal<MediaTab>("video");
  const savedEntries = signal<LibraryEntry[]>([]);
  const clipboardPreview = signal<ClipboardVideoPreview | null>(null);
  const previewMetaMap = signal<Record<string, ClipboardVideoPreview>>({});
  const parsingMap = signal<Record<string, boolean>>({});
  const parseMessageMap = signal<Record<string, string>>({});
  const selectedQualityMap = signal<Record<string, string>>({});
  const selectedTrackMap = signal<Record<string, string>>({});
  const downloadTasks = signal<Record<string, DownloadTaskProgress>>({});
  const activeDownloadControllers = new Map<string, AbortController>();
  const dismissedVideoId = signal<string | null>(null);
  const playingEntry = signal<LibraryEntry | null>(null);
  const playingSrc = signal<string | null>(null);
  const transitionOriginRect = signal<ViewTransitionRect | null>(null);
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
        [vid]: ev.message ?? "",
      });
    })
      .then((enriched) => {
        previewMetaMap.set({
          ...previewMetaMap(),
          [vid]: enriched,
        });

        // Default quality selection: user preferred default quality (default 360p for speed & mobile sync)
        if (!selectedQualityMap()[vid]) {
          const qs = enriched.qualities ?? [];
          const pref = settings().defaultQuality ?? "360p";
          const defQ =
            qs.find((q) => q.id === pref)?.id ??
            qs.find((q) => q.id === "360p")?.id ??
            qs.find((q) => q.id === "480p")?.id ??
            qs.find((q) => q.id === "720p")?.id ??
            qs[0]?.id ??
            "360p";
          selectedQualityMap.set({
            ...selectedQualityMap(),
            [vid]: defQ,
          });
        }

        // Default subtitle track selection: prefer Manual track matching video language
        if (!selectedTrackMap()[vid]) {
          const pref = preferBestCaptionTrack(
            enriched.captionTracks ?? [],
            enriched.title,
          );
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
    try {
      const win = currentWindow();
      if (platform.os === "macos") {
        win.set({ titleBar: { style: "hidden", height: 44 } });
      } else {
        Menu.setMenuBar("autoHide");
      }
    } catch {
      // ignore if called outside Window rendering
    }
  }

  void checkUpdateInBackground();
  void loadDiscover();

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

  // Periodically refresh library to reflect background CLI downloads and status changes
  effect(() => {
    if (lifecycle() !== "active") return;
    const interval = setInterval(async () => {
      try {
        const entries = await listEntriesSafe();
        savedEntries.set(entries);
      } catch {
        // ignore
      }
    }, 1500);
    return () => clearInterval(interval);
  });

  // Active video prompt row (either from clipboard or typed YouTube link)
  const activePreview = (): ClipboardVideoPreview | null => {
    const typed = url().trim();
    const clip = clipboardPreview();
    const typedVid = typed ? extractVideoId(typed) : null;
    const fromInput = typed
      ? clip && (clip.rawUrl === typed || (typedVid && clip.videoId === typedVid))
        ? clip
        : buildVideoPreview(
            typed,
            clip?.rawUrl === typed ? "clipboard" : "input",
          )
      : null;
    const candidate = fromInput ?? clip;
    if (!candidate) return null;
    if (dismissedVideoId() === candidate.videoId) return null;
    ensurePreviewEnriched(candidate);
    const enriched = previewMetaMap()[candidate.videoId];
    return enriched
      ? { ...candidate, ...enriched, rawUrl: candidate.rawUrl, source: candidate.source }
      : candidate;
  };

  const activeSelectedQualityId = (): string => {
    const cur = activePreview();
    const fallback = settings().defaultQuality ?? "360p";
    if (!cur) return fallback;
    return selectedQualityMap()[cur.videoId] ?? fallback;
  };

  const activeSelectedTrackId = (): string | null => {
    const cur = activePreview();
    if (!cur) return null;
    const explicit = selectedTrackMap()[cur.videoId];
    if (explicit) return explicit;
    const tracks = cur.captionTracks ?? [];
    const pref = preferBestCaptionTrack(tracks, cur.title);
    return pref ? captionTrackId(pref) : "en:manual";
  };

  const activeDownloadsList = (): DownloadTaskProgress[] => {
    const fromSignals = { ...downloadTasks() };
    const libraryEntries = savedEntries();
    for (const e of libraryEntries) {
      if (e.state === "downloading" || e.state === "paused") {
        if (!fromSignals[e.videoId]) {
          fromSignals[e.videoId] = {
            videoId: e.videoId,
            title: e.title,
            thumbnailUrl:
              e.thumbnailUrl ||
              `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
            qualityLabel: e.quality || "720p",
            subtitleLabel: e.subtitleLabel || "English",
            subtitleIsAuto: e.subtitleIsAuto ?? false,
            targetPath: e.videoPath || e.audioPath || "",
            stage: e.state === "paused" ? "paused" : "downloading",
            percent: e.percent ?? 0,
            downloadedBytes: e.downloadedBytes ?? 0,
            totalBytes: e.sizeBytes ?? 0,
            speedBps: e.speedBps ?? 0,
            etaSeconds: e.etaSeconds ?? null,
            error: e.note ?? null,
          };
        }
      }
    }
    return Object.values(fromSignals);
  };

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
      settings().defaultQuality ??
      "360p";

    // Auto-switch tab to match downloading media type immediately
    if (activeTab() !== "settings" && activeTab() !== "discover") {
      if (effectiveQuality === "audio") {
        activeTab.set("audio");
      } else {
        activeTab.set("video");
      }
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

    const ctrl = new AbortController();
    activeDownloadControllers.set(vid, ctrl);

    try {
      const { entry, audioNote } = await downloadLesson(target, {
        fetchImpl: hostFetch,
        downloadFolder: settings().downloadFolder,
        qualityId: effectiveQuality,
        signal: ctrl.signal,
        onProgress: (prog) => {
          downloadTasks.set({
            ...downloadTasks(),
            [vid]: prog,
          });
        },
      });

      if (entry.state === "paused") {
        const currentTask = downloadTasks()[vid];
        if (currentTask) {
          downloadTasks.set({
            ...downloadTasks(),
            [vid]: { ...currentTask, stage: "paused", speedBps: 0, etaSeconds: null },
          });
        }
        const entries = await listEntriesSafe();
        savedEntries.set(entries);
        return;
      }

      if (entry.state === "error") {
        error.set(audioNote || entry.note || "Download failed");
        const nextTasks = { ...downloadTasks() };
        delete nextTasks[vid];
        downloadTasks.set(nextTasks);
        const entries = await listEntriesSafe();
        savedEntries.set(entries);
        return;
      }

      // 3. Mark stage as done at 100% so the completion shrink & move animation triggers
      const currentTask = downloadTasks()[vid];
      if (currentTask) {
        downloadTasks.set({
          ...downloadTasks(),
          [vid]: {
            ...currentTask,
            percent: 100,
            stage: "done",
          },
        });
      }

      // Play completion chime
      playDingSound();

      // Wait 380ms for the downward-left displacement travel of ActiveDownloadRow to get underway
      await delay(380);

      try {
        LayoutAnimation.configureNext({
          duration: 400,
          create: {
            type: "easeOut",
            property: "opacity",
          },
          update: {
            type: "spring",
            springDamping: 0.85,
          },
          delete: {
            type: "easeOut",
            property: "opacity",
          },
        });
      } catch {
        // ignore on test host
      }

      // Atomic handoff: remove from downloadTasks and insert into savedEntries in the same tick
      activeDownloadControllers.delete(vid);
      activeDownloadIds.delete(vid);
      const nextTasks = { ...downloadTasks() };
      delete nextTasks[vid];
      downloadTasks.set(nextTasks);
      saving.set(activeDownloadIds.size > 0);

      const entries = await listEntriesSafe();
      savedEntries.set(entries);

      // Auto-switch tab to match downloaded media type
      if (activeTab() !== "settings" && activeTab() !== "discover") {
        if (isAudioEntry(entry)) {
          activeTab.set("audio");
        } else {
          activeTab.set("video");
        }
      }
    } catch (e) {
      error.set(e instanceof Error ? e.message : String(e));
    } finally {
      activeDownloadControllers.delete(vid);
      activeDownloadIds.delete(vid);
      if (downloadTasks()[vid] && downloadTasks()[vid]?.stage !== "paused") {
        const next = { ...downloadTasks() };
        delete next[vid];
        downloadTasks.set(next);
      }
      saving.set(activeDownloadIds.size > 0);
    }
  };

  const handlePauseDownload = (vid: string) => {
    const ctrl = activeDownloadControllers.get(vid);
    if (ctrl) {
      ctrl.abort();
      activeDownloadControllers.delete(vid);
    }
    const current = downloadTasks()[vid];
    if (current) {
      downloadTasks.set({
        ...downloadTasks(),
        [vid]: { ...current, stage: "paused", speedBps: 0, etaSeconds: null },
      });
    }
  };

  const handleResumeDownload = async (vid: string) => {
    const current = downloadTasks()[vid];
    if (current) {
      downloadTasks.set({
        ...downloadTasks(),
        [vid]: { ...current, stage: "starting" },
      });
    }
    const existing = await readEntry(vid);
    if (!existing) return;
    const lesson = await loadLessonFromEntry(existing).catch(() => null);
    if (lesson) {
      void downloadTargetLesson(lesson);
    } else {
      const candidateUrl =
        existing.url || `https://www.youtube.com/watch?v=${vid}`;
      url.set(candidateUrl);
      void onStartDownload();
    }
  };

  const handleCancelDownload = async (vid: string) => {
    const ctrl = activeDownloadControllers.get(vid);
    if (ctrl) {
      ctrl.abort();
      activeDownloadControllers.delete(vid);
    }
    const next = { ...downloadTasks() };
    delete next[vid];
    downloadTasks.set(next);
    activeDownloadIds.delete(vid);
    await deleteEntry(vid, { deleteMediaFile: true });
    const entries = await listEntriesSafe();
    savedEntries.set(entries);
  };

  // User triggers download (either via button or Return ↵ in omnibar)
  const onStartDownload = async (previewCandidate?: ClipboardVideoPreview | null) => {
    const cur = previewCandidate ?? activePreview();
    const rawVal = url().trim();
    if (!cur && !rawVal) return;
    if (loading()) return;

    // 1. Immediately clear the input field and close the dropdown popup drawer
    url.set("");
    if (cur) {
      dismissedVideoId.set(cur.videoId);
    }
    clipboardPreview.set(null);
    urlInputRef?.blur();

    loading.set(true);
    error.set(null);
    status.set(null);

    const chosenQualityId = activeSelectedQualityId();
    const chosenTrackId = activeSelectedTrackId();

    // Auto-switch tab to match downloading media type immediately
    if (activeTab() !== "settings") {
      if (chosenQualityId === "audio" && activeTab() !== "discover") {
        activeTab.set("audio");
      } else {
        activeTab.set("video");
      }
    }

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

      activityKind.set(null);
      void downloadTargetLesson(loaded, chosenQualityId);
    } catch (e) {
      activityKind.set(null);
      error.set(e instanceof Error ? e.message : String(e));
    } finally {
      loading.set(false);
    }
  };

  const handleOpenEntry = async (
    entry: LibraryEntry,
    originRect?: ViewTransitionRect | null,
  ) => {
    transitionOriginRect.set(originRect ?? null);
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
    let target = entry.videoPath || entry.audioPath || null;
    if (!target && entry.videoId) {
      const candidates = localMediaCandidates({
        videoId: entry.videoId,
        videoPath: entry.videoPath,
        audioPath: entry.audioPath,
        dataDir: process.dataDir ?? null,
      });
      for (const p of candidates) {
        try {
          if (await exists(p)) {
            target = p;
            break;
          }
        } catch {
          // ignore
        }
      }
    }
    target = target || entry.captionsPath || null;
    if (target) {
      await openFileParentFolder(target);
    } else {
      await openDirectory(mediaRoot(settings().downloadFolder));
    }
  };

  const handleDeleteEntry = async (entry: LibraryEntry) => {
    await deleteEntry(entry.videoId, { deleteMediaFile: true });
    const updated = await listEntriesSafe();
    savedEntries.set(updated);
  };

  const handleInspectDiscoverItem = (item: DiscoverItem) => {
    dismissedVideoId.set(null);
    url.set(item.url);
    const basePreview = buildVideoPreview(item.url, "input");
    if (basePreview) {
      const preview: ClipboardVideoPreview = {
        ...basePreview,
        title: item.title,
        channel: item.author,
        thumbnailUrl: item.thumbnailUrl,
        durationLabel: formatDurationMs(item.durationMs),
        qualities: [],
        captionTracks: [],
        isParsed: false,
      };
      clipboardPreview.set(preview);
      ensurePreviewEnriched(preview);
    }
    urlInputRef?.focus();
  };

  const handleDownloadDiscoverItem = (item: DiscoverItem) => {
    const basePreview = buildVideoPreview(item.url, "input");
    if (basePreview) {
      const preview: ClipboardVideoPreview = {
        ...basePreview,
        title: item.title,
        channel: item.author,
        thumbnailUrl: item.thumbnailUrl,
        durationLabel: formatDurationMs(item.durationMs),
      };
      activeTab.set("video");
      void onStartDownload(preview);
    }
  };

  const handlePracticeDiscoverItem = async (
    item: DiscoverItem,
    originRect?: ViewTransitionRect | null,
  ) => {
    const existing = savedEntries().find((e) => e.videoId === item.videoId);
    if (existing) {
      await handleOpenEntry(existing, originRect);
      return;
    }
    const cand = localMediaCandidates({
      videoId: item.videoId,
      videoPath: null,
      audioPath: null,
      dataDir: process.dataDir ?? null,
    });
    let foundPath: string | null = null;
    for (const p of cand) {
      try {
        if (await exists(p)) {
          foundPath = p;
          break;
        }
      } catch {
        // ignore
      }
    }

    if (foundPath) {
      const dummyEntry = normalizeEntry({
        videoId: item.videoId,
        url: item.url,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        videoPath: foundPath,
        subtitleLabel: item.formatLabel,
      });
      await handleOpenEntry(dummyEntry, originRect);
    } else {
      handleInspectDiscoverItem(item);
      status.set(`推荐视频《${item.title}》尚未下载，已填入下载解析栏`);
    }
  };

  keymap.bind(
    {
      enter: () => {
        if (playingEntry()) return;
        if (activeTab() === "settings") return;
        const cur = activePreview();
        if (cur && !loading()) {
          void onStartDownload(cur);
        }
      },
    },
    { when: "notEditing" },
  );

  keymap.bind({
    "mod+l": () => {
      if (activeTab() === "settings") {
        activeTab.set("video");
      }
      setTimeout(() => urlInputRef?.focus(), 50);
    },
    "mod+k": () => {
      if (activeTab() === "settings") {
        activeTab.set("video");
      }
      setTimeout(() => urlInputRef?.focus(), 50);
    },
    "mod+,": () => {
      if (activeTab() === "settings") {
        activeTab.set(previousTab());
      } else {
        previousTab.set(activeTab());
        activeTab.set("settings");
      }
    },
    escape: () => {
      if (playingEntry()) {
        // Let VideoDetailView keymap run smooth closing transition
        return;
      }
      if (activeTab() === "settings") {
        activeTab.set(previousTab());
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
    const unlisten = Application.on("secondInstance", (launch) => {
      try {
        currentWindow().focus();
      } catch {
        // ignore outside window rendering
      }
      if (launch.args && launch.args.length > 0) {
        for (const arg of launch.args) {
          const vid = extractVideoId(arg);
          if (vid) {
            url.set(arg);
            break;
          }
        }
      }
    });
    return unlisten;
  });

  effect(() => {
    if (!isAvailable) return;
    const tabName =
      activeTab() === "video"
        ? "Video"
        : activeTab() === "audio"
          ? "Audio"
          : activeTab() === "discover"
            ? "Discover"
            : "Settings";
    if (isAvailable) {
      try {
        currentWindow().set({ title: `Ear — ${tabName}` });
      } catch {
        // ignore outside window rendering
      }
    }

    if (platform.os === "macos") {
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
              onSelect: () => {
                if (activeTab() === "settings") {
                  activeTab.set(previousTab());
                } else {
                  previousTab.set(activeTab());
                  activeTab.set("settings");
                }
              },
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
    } else {
      Menu.setApplicationMenu([]);
    }
  });

  const videoEntriesCount = () =>
    savedEntries().filter((e) => !isAudioEntry(e)).length;
  const audioEntriesCount = () =>
    savedEntries().filter((e) => isAudioEntry(e)).length;

  return (
    <View class="relative flex-1 flex-row bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* 1. Left Navigation Sidebar (Discover, Videos, Audio, Settings) */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab: MediaTab) => {
          if (tab !== "settings" && activeTab() !== "settings") {
            previousTab.set(tab);
          }
          activeTab.set(tab);
        }}
        videoCount={videoEntriesCount}
        audioCount={audioEntriesCount}
        discoverCount={() => discoverItems().length}
        activeDownloadCount={() => activeDownloadsList().length}
        onOpenSettings={() => {
          if (activeTab() !== "settings") {
            previousTab.set(activeTab());
          }
          activeTab.set("settings");
        }}
      />

      {/* 2. feed content area: TopBar + Scroll Workspace OR Settings View */}
      <View class="flex-1 flex-col min-w-0 h-full">
        <If when={activeTab() === "settings"}>
          <SettingsView />
        </If>

        <If when={activeTab() !== "settings"}>
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
            discoverCount={() => discoverItems().length}
            onOpenSettings={() => {
              if (activeTab() !== "settings") {
                previousTab.set(activeTab());
              }
              activeTab.set("settings");
            }}
            activityKind={topBarActivityKind}
            activityProgress={topBarActivityProgress}
          />

          {/* Workspace scroll area: Download telemetry banner + Media list / Discover */}
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

              <If when={activeTab() === "discover"}>
                <DiscoverView
                  onInspectItem={handleInspectDiscoverItem}
                  onPracticeItem={(item, rect) => void handlePracticeDiscoverItem(item, rect)}
                  onDownloadItem={handleDownloadDiscoverItem}
                  savedEntries={savedEntries}
                  activeDownloads={activeDownloadsList}
                />
              </If>

              <If when={activeTab() !== "discover"}>
                <LibraryView
                  activeTab={activeTab}
                  savedEntries={savedEntries}
                  activeDownloads={activeDownloadsList}
                  onOpenEntry={(entry, rect) => void handleOpenEntry(entry, rect)}
                  onOpenFolder={(entry) => void handleOpenFolder(entry)}
                  onDeleteEntry={(entry) => void handleDeleteEntry(entry)}
                  onPauseDownload={handlePauseDownload}
                  onResumeDownload={handleResumeDownload}
                  onCancelDownload={handleCancelDownload}
                />
              </If>
            </View>
          </Scroll>
        </If>
      </View>

      {/* 3. Transition video practice page (View transition: enlarged video + subtitle list + mask + listen) */}
      <If when={playingEntry() && playingSrc()}>
        {() => (
          <VideoDetailView
            entry={() => playingEntry()!}
            src={() => playingSrc()!}
            originRect={() => transitionOriginRect()}
            onClose={() => {
              playingEntry.set(null);
              playingSrc.set(null);
              transitionOriginRect.set(null);
            }}
          />
        )}
      </If>
    </View>
  );
}

mount(App);
