import { exists, mkdir, writeFile } from "fs/promises";
import process from "process";
import type { LoadedLesson } from "../youtube/types";
import { hostFetch } from "../youtube/host";
import { upsertEntry } from "./index";
import { audioFile, captionsFile, entryDir, videoFile } from "./paths";
import type { LibraryEntry } from "./types";

/** nsh `fs/promises.writeFile` caps a single write at 8 MiB. */
export const MAX_AUDIO_WRITE_BYTES = 8 * 1024 * 1024;

function audioExt(mime: string | null): string {
  if (!mime) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
    return "m4a";
  }
  return "bin";
}

export type DownloadResult = {
  entry: LibraryEntry;
  /** Why audioPath or videoPath may be null (size / no url / fetch). */
  audioNote: string | null;
};

/**
 * Persist captions (+ video/audio) under dataDir/library/<id>/.
 * Attempts to download multiplexed MP4 via yt-dlp first for video+audio offline playback;
 * falls back to downloading audio stream via fetchImpl.
 */
export async function downloadLesson(
  lesson: LoadedLesson,
  fetchImpl: typeof fetch = hostFetch,
): Promise<DownloadResult> {
  const { video, track, cues, sentences } = lesson;
  const dir = entryDir(video.videoId);
  await mkdir(dir, { recursive: true });

  const captionsPath = captionsFile(video.videoId);
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

  let videoPath: string | null = null;
  let audioPath: string | null = null;
  let audioNote: string | null = null;

  // 1. Check if video already exists on disk
  const targetVideoPath = videoFile(video.videoId, "mp4");
  try {
    if (await exists(targetVideoPath)) {
      videoPath = targetVideoPath;
    } else if (typeof process.run === "function") {
      try {
        await process.run("yt-dlp", [
          "-f",
          "18/best[height<=720][ext=mp4]/best",
          "--no-playlist",
          "--no-warnings",
          "-o",
          targetVideoPath,
          `https://www.youtube.com/watch?v=${video.videoId}`,
        ]);
        if (await exists(targetVideoPath)) {
          videoPath = targetVideoPath;
        }
      } catch {
        // yt-dlp error or not installed
      }
    }
  } catch {
    // ignore
  }

  // 2. If videoPath not obtained, download audio stream via fetch
  if (!videoPath && video.audioUrl) {
    try {
      const res = await fetchImpl(video.audioUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) {
        audioNote = `audio HTTP ${res.status}`;
      } else {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength > MAX_AUDIO_WRITE_BYTES) {
          audioNote = `audio ${buf.byteLength} bytes > ${MAX_AUDIO_WRITE_BYTES} write cap; keep remote url`;
        } else {
          const ext = audioExt(video.audioMimeType);
          const targetAudio = audioFile(video.videoId, ext);
          await writeFile(targetAudio, buf);
          audioPath = targetAudio;
        }
      }
    } catch (e) {
      audioNote = e instanceof Error ? e.message : String(e);
    }
  } else if (!videoPath && !video.audioUrl) {
    audioNote = "no audio url in player response";
  }

  const entry: LibraryEntry = {
    videoId: video.videoId,
    title: video.title,
    captionsPath,
    audioPath,
    audioUrl: video.audioUrl,
    audioMimeType: video.audioMimeType,
    videoPath,
    videoUrl: video.videoUrl ?? null,
    updatedAt: Date.now(),
  };
  await upsertEntry(entry);
  return { entry, audioNote };
}
