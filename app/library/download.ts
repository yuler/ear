import { exists, mkdir, writeFile } from "fs/promises";
import type { LoadedLesson } from "../youtube/types";
import { hostFetch } from "../youtube/host";
import { readEntry, upsertEntry } from "./index";
import {
  audioFile,
  captionsFile,
  entryDir,
  mediaRoot,
  videoFile,
} from "./paths";
import type { LibraryEntry } from "./types";

/** nsh `fs/promises.writeFile` caps a single write at 8 MiB. */
export const MAX_AUDIO_WRITE_BYTES = 8 * 1024 * 1024;

const MEDIA_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

/**
 * Persist captions under dataDir/library/<id>/captions.json, media under
 * Downloads via native fetch, and record `library/<id>.json` + archive.jsonl.
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

  await mkdir(entryDir(video.videoId), { recursive: true });
  await mkdir(folder, { recursive: true });

  // Mark pending while work runs
  await upsertEntry({
    videoId: video.videoId,
    url: watchUrl,
    title: video.title,
    site: "YouTube",
    state: "pending",
    captionsPath: existing?.captionsPath ?? null,
    videoPath: existing?.videoPath ?? null,
    audioPath: existing?.audioPath ?? null,
    videoUrl: video.videoUrl ?? null,
    audioUrl: video.audioUrl,
    audioMimeType: video.audioMimeType,
    durationMs: video.durationMs,
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
    const entry: LibraryEntry = {
      videoId: video.videoId,
      url: watchUrl,
      title: video.title,
      site: "YouTube",
      state: "error",
      captionsPath: null,
      videoPath: null,
      audioPath: null,
      videoUrl: video.videoUrl ?? null,
      audioUrl: video.audioUrl,
      audioMimeType: video.audioMimeType,
      durationMs: video.durationMs,
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

  const targetVideoPath = videoFile(
    video.videoId,
    videoExt(video.videoMimeType ?? null),
    folder,
  );
  if (await exists(targetVideoPath)) {
    videoPath = targetVideoPath;
  } else if (video.videoUrl) {
    const got = await fetchMediaBytes(video.videoUrl, fetchImpl);
    if ("buf" in got) {
      await writeFile(targetVideoPath, got.buf);
      videoPath = targetVideoPath;
    } else {
      audioNote = `video ${got.note}`;
    }
  }

  if (!videoPath && video.audioUrl) {
    const ext = audioExt(video.audioMimeType);
    const targetAudio = audioFile(video.videoId, ext, folder);
    if (await exists(targetAudio)) {
      audioPath = targetAudio;
    } else {
      const got = await fetchMediaBytes(video.audioUrl, fetchImpl);
      if ("buf" in got) {
        await writeFile(targetAudio, got.buf);
        audioPath = targetAudio;
      } else {
        audioNote = audioNote ? `${audioNote}; audio ${got.note}` : got.note;
      }
    }
  } else if (!videoPath && !video.audioUrl) {
    audioNote = audioNote ?? "no audio/video url in player response";
  }

  const entry: LibraryEntry = {
    videoId: video.videoId,
    url: watchUrl,
    title: video.title,
    site: "YouTube",
    state: "ready",
    captionsPath,
    videoPath,
    audioPath,
    videoUrl: video.videoUrl ?? null,
    audioUrl: video.audioUrl,
    audioMimeType: video.audioMimeType,
    durationMs: video.durationMs,
    note: audioNote,
    createdAt: existing?.createdAt ?? now,
    updatedAt: Date.now(),
  };
  await upsertEntry(entry);
  return { entry, audioNote };
}
