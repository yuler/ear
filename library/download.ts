import { mkdir, writeFile } from "fs/promises";
import type { LoadedLesson } from "../youtube/types";
import { hostFetch } from "../youtube/host";
import { upsertEntry } from "./index";
import { audioFile, captionsFile, entryDir } from "./paths";
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
  /** Why audioPath may be null (size / no url / fetch). */
  audioNote: string | null;
};

/**
 * Persist captions (+ audio when ≤ 8 MiB) under dataDir/library/<id>/.
 * Skeleton: no yt-dlp; uses host fetch of the progressive audio URL.
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

  let audioPath: string | null = null;
  let audioNote: string | null = null;

  if (!video.audioUrl) {
    audioNote = "no audio url in player response";
  } else {
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
          audioPath = audioFile(video.videoId, ext);
          await writeFile(audioPath, buf);
        }
      }
    } catch (e) {
      audioNote = e instanceof Error ? e.message : String(e);
    }
  }

  const entry: LibraryEntry = {
    videoId: video.videoId,
    title: video.title,
    captionsPath,
    audioPath,
    audioUrl: video.audioUrl,
    audioMimeType: video.audioMimeType,
    updatedAt: Date.now(),
  };
  await upsertEntry(entry);
  return { entry, audioNote };
}
