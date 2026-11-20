import { LayoutAnimation, signal, type Signal } from "nsh";
import { pickDefaultTrack } from "./appPreview";
import { downloadLesson } from "./library/download";
import {
  deleteEntry,
  listEntriesSafe,
  loadLessonFromEntry,
  readEntry,
} from "./library/index";
import type { DownloadTaskProgress, LibraryEntry } from "./library/types";
import { playDingSound } from "./ui/sound";
import { settings } from "./ui/settings";
import { hostFetch } from "./youtube/host";
import {
  captionTrackId,
  loadLessonFromParsed,
  parseYouTubeWithRust,
} from "./youtube/parse";
import type { LoadedLesson, ParsedVideo } from "./youtube/types";

/** What to download: a link, with what is known of it for the card. */
export type DownloadRequest = {
  videoId: string;
  url: string;
  title: string;
  thumbnailUrl?: string | null;
  qualityId: string;
  /** The chosen subtitle track; the recommended one when absent. */
  trackId?: string | null;
  /** Metadata already parsed (the link card's), to skip parsing again. */
  parsed?: ParsedVideo | null;
  /** The video's language, to pick its subtitle track (Discover's). */
  language?: string | null;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function qualityLabel(qualityId: string): string {
  return qualityId === "audio" ? "Audio (M4A)" : `${qualityId} MP4`;
}

/** A Library entry still downloading (from a previous run or the CLI) as a task. */
function entryAsTask(e: LibraryEntry): DownloadTaskProgress {
  return {
    videoId: e.videoId,
    title: e.title,
    thumbnailUrl: e.thumbnailUrl || `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
    qualityLabel: e.quality || "720p",
    subtitleLabel: e.subtitleLabel || "",
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

/**
 * Downloads in progress: start (parsing first when needed), pause, resume
 * and cancel, with live progress, and the Library refreshed as they end.
 */
export function createDownloadController(deps: {
  savedEntries: Signal<LibraryEntry[]>;
  onError: (message: string) => void;
}) {
  const tasks = signal<Record<string, DownloadTaskProgress>>({});
  const controllers = new Map<string, AbortController>();
  const busy = new Set<string>();

  const setTask = (vid: string, task: DownloadTaskProgress | null) => {
    const next = { ...tasks() };
    if (task) next[vid] = task;
    else delete next[vid];
    tasks.set(next);
  };
  const patchTask = (vid: string, patch: Partial<DownloadTaskProgress>) => {
    const cur = tasks()[vid];
    if (cur) setTask(vid, { ...cur, ...patch });
  };
  const refresh = async () => deps.savedEntries.set(await listEntriesSafe());

  /** Tasks of this run, then entries downloading in the background. */
  const list = (): DownloadTaskProgress[] => {
    const all = { ...tasks() };
    for (const e of deps.savedEntries()) {
      if ((e.state === "downloading" || e.state === "paused") && !all[e.videoId]) {
        all[e.videoId] = entryAsTask(e);
      }
    }
    return Object.values(all);
  };

  const runDownload = async (lesson: LoadedLesson, qualityId: string) => {
    const vid = lesson.video.videoId;
    patchTask(vid, {
      title: lesson.video.title || tasks()[vid]?.title || vid,
      subtitleLabel: lesson.track?.name ?? "",
      subtitleIsAuto: lesson.track?.isAuto ?? false,
    });
    const ctrl = new AbortController();
    controllers.set(vid, ctrl);
    const { entry, audioNote } = await downloadLesson(lesson, {
      fetchImpl: hostFetch,
      downloadFolder: settings().downloadFolder,
      qualityId,
      signal: ctrl.signal,
      onProgress: (prog) => setTask(vid, prog),
    });
    controllers.delete(vid);

    if (entry.state === "paused") {
      patchTask(vid, { stage: "paused", speedBps: 0, etaSeconds: null });
      await refresh();
      return;
    }
    if (entry.state === "error") {
      setTask(vid, null);
      deps.onError(audioNote || entry.note || "Download failed");
      await refresh();
      return;
    }

    patchTask(vid, { percent: 100, stage: "done" });
    playDingSound();
    await delay(380);
    try {
      LayoutAnimation.configureNext({
        duration: 400,
        create: { type: "easeOut", property: "opacity" },
        update: { type: "spring", springDamping: 0.85 },
        delete: { type: "easeOut", property: "opacity" },
      });
    } catch {
      // not on the test host
    }
    // Hand the card over to the finished entry in the same tick.
    const entries = await listEntriesSafe();
    setTask(vid, null);
    deps.savedEntries.set(entries);
  };

  const resolveLesson = async (req: DownloadRequest): Promise<LoadedLesson> => {
    const video = req.parsed ?? (await parseYouTubeWithRust(req.url));
    const track = req.trackId
      ? null
      : pickDefaultTrack(video.captionTracks ?? [], {
          language: req.language,
          title: video.title,
        });
    return loadLessonFromParsed(video, {
      qualityId: req.qualityId,
      trackId: req.trackId ?? (track ? captionTrackId(track) : null),
      fetchImpl: hostFetch,
    });
  };

  /** Runs `job` for `vid` unless one runs already; reports what fails. */
  const guarded = async (vid: string, job: () => Promise<void>) => {
    if (busy.has(vid)) return;
    busy.add(vid);
    try {
      await job();
    } catch (e) {
      // A pause aborts the transfer: that is no failure to report.
      if (tasks()[vid]?.stage === "paused") return;
      setTask(vid, null);
      deps.onError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.delete(vid);
      controllers.delete(vid);
    }
  };

  const start = (req: DownloadRequest) =>
    guarded(req.videoId, async () => {
      setTask(req.videoId, {
        videoId: req.videoId,
        title: req.title,
        thumbnailUrl:
          req.thumbnailUrl || `https://i.ytimg.com/vi/${req.videoId}/hqdefault.jpg`,
        qualityLabel: qualityLabel(req.qualityId),
        subtitleLabel: "",
        subtitleIsAuto: false,
        targetPath: "",
        stage: "starting",
        percent: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedBps: 0,
        etaSeconds: null,
      });
      const lesson = await resolveLesson(req);
      await runDownload(lesson, req.qualityId);
    });

  const pause = (vid: string) => {
    controllers.get(vid)?.abort();
    controllers.delete(vid);
    patchTask(vid, { stage: "paused", speedBps: 0, etaSeconds: null });
  };

  const resume = async (vid: string) => {
    const existing = await readEntry(vid);
    if (!existing) return;
    const lesson = await loadLessonFromEntry(existing).catch(() => null);
    if (!lesson) {
      setTask(vid, null);
      void start({
        videoId: vid,
        url: existing.url || `https://www.youtube.com/watch?v=${vid}`,
        title: existing.title,
        thumbnailUrl: existing.thumbnailUrl,
        qualityId: settings().defaultQuality ?? "360p",
      });
      return;
    }
    if (!tasks()[vid]) setTask(vid, entryAsTask(existing));
    patchTask(vid, { stage: "starting", error: null });
    const qualityId =
      lesson.selectedQuality?.id ?? settings().defaultQuality ?? "360p";
    void guarded(vid, () => runDownload(lesson, qualityId));
  };

  const cancel = async (vid: string) => {
    controllers.get(vid)?.abort();
    controllers.delete(vid);
    busy.delete(vid);
    setTask(vid, null);
    await deleteEntry(vid, { deleteMediaFile: true });
    await refresh();
  };

  return { list, start, pause, resume, cancel, refresh };
}

export type DownloadController = ReturnType<typeof createDownloadController>;
