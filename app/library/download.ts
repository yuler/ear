import { exists, mkdir, stat, writeFile } from "fs/promises";
import { earDownload, type DownloadProgressEvent } from "../youtube/earClient";
import {
  captionTrackBadge,
  cleanCaptionTrackName,
  earBinaryCandidates,
  formatBytes,
  isAutoCaptionTrack,
} from "../youtube/parse";
import type { LoadedLesson } from "../youtube/types";
import { readEntry, upsertEntry } from "./index";
import {
  audioFile,
  captionsFile,
  entryDir,
  mediaRoot,
  videoFile,
} from "./paths";
import type {
  DownloadStage,
  DownloadTaskProgress,
  LibraryEntry,
} from "./types";

export { earBinaryCandidates };

/** nsh `fs/promises.writeFile` caps a single write at 8 MiB (kept for test compatibility). */
export const MAX_AUDIO_WRITE_BYTES = 8 * 1024 * 1024;

/** Format transfer rate in Downbit style, e.g. "14.2 MB/s" or "840 KB/s". */
export function formatSpeed(speedBps: number): string {
  if (!Number.isFinite(speedBps) || speedBps <= 0) return "";
  if (speedBps >= 1024 * 1024) {
    return `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${Math.max(1, Math.round(speedBps / 1024))} KB/s`;
}

/** Format remaining time in Downbit style, e.g. "0:08 left" or "1:24 left". */
export function formatEta(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || !Number.isFinite(etaSeconds) || etaSeconds < 0) {
    return "";
  }
  const total = Math.max(0, Math.round(etaSeconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")} left`;
}

/** Format byte progress in Downbit style, e.g. "44.2 MB of 105.0 MB". */
export function formatSizeProgress(
  downloadedBytes: number,
  totalBytes: number,
): string {
  const doneStr = formatBytes(downloadedBytes);
  const totalStr = formatBytes(totalBytes);
  if (doneStr && totalStr) {
    return `${doneStr} of ${totalStr}`;
  }
  if (doneStr) return doneStr;
  if (totalStr) return totalStr;
  return "";
}

function audioExt(mime: string | null): string {
  if (!mime) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
    return "m4a";
  }
  return "bin";
}

function videoExt(mime: string | null): string {
  if (!mime) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  return "bin";
}

export type DownloadOptions = {
  fetchImpl?: typeof fetch;
  /** Override media folder; empty/null → ~/Downloads. */
  downloadFolder?: string | null;
  /** Chosen quality ID (e.g. "1080p", "720p", "480p", "360p", "audio"). */
  qualityId?: string | null;
  /** Real-time progress callback for Downbit-style background download UI. */
  onProgress?: (progress: DownloadTaskProgress) => void;
};

export type DownloadResult = {
  entry: LibraryEntry;
  /** Why audioPath or videoPath may be null (size / no url / fetch). */
  audioNote: string | null;
};

/**
 * Persist captions under dataDir/library/<id>/captions.json, download media
 * via the Rust `ear` parallel range downloader into ~/Downloads,
 * and record `library/<id>.json` + archive.jsonl.
 */
export async function downloadLesson(
  lesson: LoadedLesson,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const folder = mediaRoot(options.downloadFolder);
  const { video, track, cues, sentences } = lesson;
  const now = Date.now();
  const existing = await readEntry(video.videoId).catch(() => null);
  const watchUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

  const qualities = video.qualities ?? [];
  const chosenQuality =
    lesson.selectedQuality ??
    (options.qualityId
      ? qualities.find((q) => q.id === options.qualityId)
      : null) ??
    qualities.find((q) => q.id === "720p") ??
    qualities[0] ??
    null;

  const qualityLabel = chosenQuality?.label ?? (options.qualityId || "720p");
  const isAudioOnly =
    chosenQuality?.mode === "audio" || options.qualityId === "audio";

  const subtitleIsAuto = track ? isAutoCaptionTrack(track) : false;
  const subtitleLabel = track
    ? `${cleanCaptionTrackName(track)} · ${captionTrackBadge(track).shortLabel}`
    : "No Subtitles";

  const thumbnailUrl =
    video.thumbnailUrl ||
    `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

  const targetVideoPath = videoFile(
    video.videoId,
    videoExt(chosenQuality?.mimeType ?? video.videoMimeType ?? null),
    folder,
  );
  const targetAudioPath = audioFile(
    video.videoId,
    audioExt(chosenQuality?.mimeType ?? video.audioMimeType),
    folder,
  );
  const primaryTargetPath = isAudioOnly ? targetAudioPath : targetVideoPath;

  const emitProgress = (partial: Partial<DownloadTaskProgress>) => {
    options.onProgress?.({
      videoId: video.videoId,
      title: video.title,
      thumbnailUrl,
      qualityLabel,
      subtitleLabel,
      subtitleIsAuto,
      targetPath: primaryTargetPath,
      stage: "downloading",
      percent: 0,
      downloadedBytes: 0,
      totalBytes: chosenQuality?.sizeBytes ?? 0,
      speedBps: 0,
      etaSeconds: null,
      ...partial,
    });
  };

  emitProgress({ stage: "starting", percent: 2 });

  await mkdir(entryDir(video.videoId), { recursive: true });
  await mkdir(folder, { recursive: true });

  // Mark pending while work runs
  await upsertEntry({
    videoId: video.videoId,
    url: watchUrl,
    title: video.title,
    thumbnailUrl,
    site: "YouTube",
    state: "pending",
    captionsPath: existing?.captionsPath ?? null,
    videoPath: existing?.videoPath ?? null,
    audioPath: existing?.audioPath ?? null,
    videoUrl: video.videoUrl ?? null,
    audioUrl: video.audioUrl,
    audioMimeType: video.audioMimeType,
    durationMs: video.durationMs,
    quality: qualityLabel,
    subtitleLabel,
    subtitleIsAuto,
    sizeBytes: existing?.sizeBytes ?? chosenQuality?.sizeBytes ?? null,
    note: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  const captionsPath = captionsFile(video.videoId);
  try {
    await writeFile(
      captionsPath,
      JSON.stringify(
        {
          videoId: video.videoId,
          title: video.title,
          track,
          cues,
          sentences,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    const note = e instanceof Error ? e.message : String(e);
    emitProgress({ stage: "error", error: note });
    const entry: LibraryEntry = {
      videoId: video.videoId,
      url: watchUrl,
      title: video.title,
      thumbnailUrl,
      site: "YouTube",
      state: "error",
      captionsPath: null,
      videoPath: null,
      audioPath: null,
      videoUrl: video.videoUrl ?? null,
      audioUrl: video.audioUrl,
      audioMimeType: video.audioMimeType,
      durationMs: video.durationMs,
      quality: qualityLabel,
      subtitleLabel,
      subtitleIsAuto,
      note,
      createdAt: existing?.createdAt ?? now,
      updatedAt: Date.now(),
    };
    await upsertEntry(entry);
    return { entry, audioNote: note };
  }

  let videoPath: string | null = null;
  let audioPath: string | null = null;
  let audioNote: string | null = null;
  let finalSizeBytes: number | null = chosenQuality?.sizeBytes ?? null;

  // 1. Check if target file already exists on disk in ~/Downloads
  if (!isAudioOnly && (await exists(targetVideoPath))) {
    videoPath = targetVideoPath;
    try {
      const st = await stat(targetVideoPath);
      if (st.size > 0) finalSizeBytes = st.size;
    } catch {
      // ignore
    }
  } else if (isAudioOnly && (await exists(targetAudioPath))) {
    audioPath = targetAudioPath;
    try {
      const st = await stat(targetAudioPath);
      if (st.size > 0) finalSizeBytes = st.size;
    } catch {
      // ignore
    }
  } else {
    // 2. Primary: Download via Rust `ear` parallel range downloader into ~/Downloads
    try {
      const rustDl = await earDownload({
        videoId: video.videoId,
        qualityId: chosenQuality?.id ?? (isAudioOnly ? "audio" : "720p"),
        outputPath: primaryTargetPath,
        videoUrl: isAudioOnly
          ? null
          : (chosenQuality?.videoUrl ?? video.videoUrl ?? null),
        audioUrl: chosenQuality?.audioUrl ?? video.audioUrl ?? null,
        onProgress: (ev: DownloadProgressEvent) => {
          emitProgress({
            stage: ev.stage as DownloadStage,
            percent: ev.percent,
            downloadedBytes: ev.downloadedBytes,
            totalBytes: ev.totalBytes || (chosenQuality?.sizeBytes ?? 0),
            speedBps: ev.speedBps,
            etaSeconds: ev.etaSeconds,
          });
        },
      });

      if (isAudioOnly) {
        audioPath = rustDl.path;
      } else {
        videoPath = rustDl.path;
      }
      if (rustDl.sizeBytes > 0) {
        finalSizeBytes = rustDl.sizeBytes;
      }
    } catch (e) {
      audioNote = e instanceof Error ? e.message : String(e);
      emitProgress({ stage: "error", error: audioNote });
      const entry: LibraryEntry = {
        videoId: video.videoId,
        url: watchUrl,
        title: video.title,
        thumbnailUrl,
        site: "YouTube",
        state: "error",
        captionsPath,
        videoPath: null,
        audioPath: null,
        videoUrl: video.videoUrl ?? null,
        audioUrl: video.audioUrl,
        audioMimeType: video.audioMimeType,
        durationMs: video.durationMs,
        quality: qualityLabel,
        subtitleLabel,
        subtitleIsAuto,
        sizeBytes: null,
        note: audioNote,
        createdAt: existing?.createdAt ?? now,
        updatedAt: Date.now(),
      };
      await upsertEntry(entry);
      return { entry, audioNote };
    }
  }

  emitProgress({
    stage: "done",
    percent: 100,
    downloadedBytes: finalSizeBytes ?? 0,
    totalBytes: finalSizeBytes ?? 0,
    speedBps: 0,
    etaSeconds: 0,
  });

  const entry: LibraryEntry = {
    videoId: video.videoId,
    url: watchUrl,
    title: video.title,
    thumbnailUrl,
    site: "YouTube",
    state: "ready",
    captionsPath,
    videoPath,
    audioPath,
    videoUrl: video.videoUrl ?? null,
    audioUrl: video.audioUrl,
    audioMimeType: video.audioMimeType,
    durationMs: video.durationMs,
    quality: qualityLabel,
    subtitleLabel,
    subtitleIsAuto,
    sizeBytes: finalSizeBytes,
    note: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: Date.now(),
  };
  await upsertEntry(entry);
  return { entry, audioNote: null };
}
