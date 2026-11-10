import { exists, mkdir, stat, writeFile } from "fs/promises";
import { join } from "path";
import process from "process";
import { hostFetch, isNativeHost } from "../youtube/host";
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

/**
 * Mirror a Downloads media file into dataDir/library/<id>/ so in-app <Video>
 * can load a path that always sits under capabilities.fs.read dataDir.
 */
async function mirrorIntoEntryDir(
  videoId: string,
  sourcePath: string,
  kind: "video" | "audio",
): Promise<string | null> {
  if (!isNativeHost() || typeof process.run !== "function") return null;
  const destName = kind === "video" ? "video.mp4" : "audio.m4a";
  const dest = join(entryDir(videoId), destName);
  if (sourcePath === dest) return dest;
  try {
    await mkdir(entryDir(videoId), { recursive: true });
    const res = await process.run("cp", ["-f", sourcePath, dest]);
    if (res.code === 0 && (await exists(dest))) return dest;
  } catch {
    // ignore — Downloads path remains the catalog path
  }
  return null;
}

/** nsh `fs/promises.writeFile` caps a single write at 8 MiB. */
export const MAX_AUDIO_WRITE_BYTES = 8 * 1024 * 1024;

const MEDIA_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

async function fetchMediaBytes(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ buf: Uint8Array } | { note: string }> {
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": MEDIA_UA },
    });
    if (!res.ok) return { note: `HTTP ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_AUDIO_WRITE_BYTES) {
      return {
        note: `${buf.byteLength} bytes > ${MAX_AUDIO_WRITE_BYTES} write cap; keep remote url`,
      };
    }
    return { buf };
  } catch (e) {
    return { note: e instanceof Error ? e.message : String(e) };
  }
}

async function runRustEarDlDownload(params: {
  videoId: string;
  qualityId: string;
  targetPath: string;
  videoUrl: string | null;
  audioUrl: string | null;
  onEvent: (ev: {
    stage: DownloadStage;
    percent: number;
    downloadedBytes: number;
    totalBytes: number;
    speedBps: number;
    etaSeconds: number | null;
    sizeBytes?: number;
  }) => void;
}): Promise<{ ok: true; sizeBytes: number } | { ok: false; reason: string }> {
  if (!isNativeHost() || typeof process.spawn !== "function") {
    return { ok: false, reason: "process.spawn unavailable" };
  }

  const args = [
    "download",
    "--video-id",
    params.videoId,
    "--quality",
    params.qualityId,
    "--output",
    params.targetPath,
  ];
  if (params.videoUrl) {
    args.push("--video-url", params.videoUrl);
  }
  if (params.audioUrl) {
    args.push("--audio-url", params.audioUrl);
  }

  let lastReason = "ear binary not found";
  for (const bin of earBinaryCandidates()) {
    try {
      const result = await new Promise<
        { ok: true; sizeBytes: number } | { ok: false; reason: string }
      >((resolve) => {
        let doneSize: number | null = null;
        let errMsg: string | null = null;
        const child = process.spawn(bin, args, {
          lines: true,
          timeoutMs: 600_000,
        });
        child.on("stdout", (line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const msg = JSON.parse(trimmed) as {
              type?: string;
              stage?: string;
              percent?: number;
              downloadedBytes?: number;
              totalBytes?: number;
              speedBps?: number;
              etaSeconds?: number | null;
              sizeBytes?: number;
              message?: string;
            };
            if (msg.type === "progress") {
              const stage: DownloadStage =
                msg.stage === "merging"
                  ? "merging"
                  : msg.stage === "starting"
                    ? "starting"
                    : "downloading";
              params.onEvent({
                stage,
                percent: msg.percent ?? 0,
                downloadedBytes: msg.downloadedBytes ?? 0,
                totalBytes: msg.totalBytes ?? 0,
                speedBps: msg.speedBps ?? 0,
                etaSeconds: msg.etaSeconds ?? null,
              });
            } else if (msg.type === "done") {
              doneSize = msg.sizeBytes ?? 0;
              params.onEvent({
                stage: "done",
                percent: 100,
                downloadedBytes: doneSize,
                totalBytes: doneSize,
                speedBps: 0,
                etaSeconds: 0,
                sizeBytes: doneSize,
              });
            } else if (msg.type === "error") {
              errMsg = msg.message ?? "ear download error";
            }
          } catch {
            // ignore non-json output
          }
        });
        child.on("exit", (res) => {
          if (doneSize != null || res.code === 0) {
            resolve({ ok: true, sizeBytes: doneSize ?? 0 });
          } else {
            resolve({
              ok: false,
              reason:
                errMsg ||
                res.error ||
                `ear exited with code ${res.code ?? -1}`,
            });
          }
        });
      });

      if (result.ok && (await exists(params.targetPath))) {
        return result;
      }
      if (!result.ok) {
        lastReason = result.reason;
      }
    } catch (e) {
      lastReason = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, reason: lastReason };
}

/**
 * Persist captions under dataDir/library/<id>/captions.json, media under
 * ~/Downloads via the Rust `ear` parallel range downloader (with JS fetch
 * fallback for unit tests), and record `library/<id>.json` + archive.jsonl.
 */
export async function downloadLesson(
  lesson: LoadedLesson,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const fetchImpl = options.fetchImpl ?? hostFetch;
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
    emitProgress({
      stage: "done",
      percent: 100,
      downloadedBytes: finalSizeBytes ?? 0,
      totalBytes: finalSizeBytes ?? 0,
    });
  } else if (isAudioOnly && (await exists(targetAudioPath))) {
    audioPath = targetAudioPath;
    try {
      const st = await stat(targetAudioPath);
      if (st.size > 0) finalSizeBytes = st.size;
    } catch {
      // ignore
    }
    emitProgress({
      stage: "done",
      percent: 100,
      downloadedBytes: finalSizeBytes ?? 0,
      totalBytes: finalSizeBytes ?? 0,
    });
  } else {
    // 2. Primary: Download via Rust `ear` parallel range downloader into ~/Downloads
    const rustDl = await runRustEarDlDownload({
      videoId: video.videoId,
      qualityId: chosenQuality?.id ?? (isAudioOnly ? "audio" : "720p"),
      targetPath: primaryTargetPath,
      videoUrl: isAudioOnly
        ? null
        : (chosenQuality?.videoUrl ?? video.videoUrl ?? null),
      audioUrl: chosenQuality?.audioUrl ?? video.audioUrl ?? null,
      onEvent: (ev) => {
        emitProgress({
          stage: ev.stage,
          percent: ev.percent,
          downloadedBytes: ev.downloadedBytes,
          totalBytes: ev.totalBytes || (chosenQuality?.sizeBytes ?? 0),
          speedBps: ev.speedBps,
          etaSeconds: ev.etaSeconds,
        });
      },
    });

    if (rustDl.ok && (await exists(primaryTargetPath))) {
      if (isAudioOnly) {
        audioPath = primaryTargetPath;
      } else {
        videoPath = primaryTargetPath;
      }
      if (rustDl.sizeBytes > 0) {
        finalSizeBytes = rustDl.sizeBytes;
      }
    } else {
      // 3. Fallback: JS fetch (used in unit tests or small media ≤ 8 MiB)
      if (!isAudioOnly && video.videoUrl) {
        const got = await fetchMediaBytes(video.videoUrl, fetchImpl);
        if ("buf" in got) {
          await writeFile(targetVideoPath, got.buf);
          videoPath = targetVideoPath;
          finalSizeBytes = got.buf.byteLength;
        } else {
          audioNote = `video ${got.note}`;
        }
      }

      if (!videoPath && video.audioUrl) {
        if (await exists(targetAudioPath)) {
          audioPath = targetAudioPath;
        } else {
          const got = await fetchMediaBytes(video.audioUrl, fetchImpl);
          if ("buf" in got) {
            await writeFile(targetAudioPath, got.buf);
            audioPath = targetAudioPath;
            finalSizeBytes = got.buf.byteLength;
          } else {
            audioNote = audioNote ? `${audioNote}; audio ${got.note}` : got.note;
          }
        }
      } else if (!videoPath && !video.audioUrl) {
        audioNote =
          audioNote ??
          (rustDl.ok ? null : rustDl.reason) ??
          "no audio/video url in player response";
      }
    }
  }

  // Mirror into dataDir for in-app <Video>; catalog paths stay in ~/Downloads.
  if (videoPath) {
    await mirrorIntoEntryDir(video.videoId, videoPath, "video");
  } else if (audioPath) {
    await mirrorIntoEntryDir(video.videoId, audioPath, "audio");
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
    note: audioNote,
    createdAt: existing?.createdAt ?? now,
    updatedAt: Date.now(),
  };
  await upsertEntry(entry);
  return { entry, audioNote };
}
