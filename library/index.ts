import { exists, mkdir, readFile, writeFile } from "fs/promises";
import type { CaptionCue, CaptionTrack, LoadedLesson, Sentence } from "../youtube/types";
import type { LibraryEntry, LibraryIndex } from "./types";
import { indexFile, libraryRoot } from "./paths";

const EMPTY: LibraryIndex = { version: 1, entries: {} };

/**
 * Drop path fields whose files are gone (missing file → clear that path).
 * Pure helper — pass a sync existence check for tests.
 */
export function pruneMissingPaths(
  entry: LibraryEntry,
  fileExists: (path: string) => boolean,
): LibraryEntry {
  const captionsPath =
    entry.captionsPath && fileExists(entry.captionsPath)
      ? entry.captionsPath
      : null;
  const audioPath =
    entry.audioPath && fileExists(entry.audioPath) ? entry.audioPath : null;
  const videoPath =
    entry.videoPath && fileExists(entry.videoPath) ? entry.videoPath : null;
  if (
    captionsPath === entry.captionsPath &&
    audioPath === entry.audioPath &&
    videoPath === (entry.videoPath ?? null)
  ) {
    return entry;
  }
  return { ...entry, captionsPath, audioPath, videoPath, updatedAt: Date.now() };
}

export async function loadIndex(): Promise<LibraryIndex> {
  const path = indexFile();
  if (!(await exists(path))) return { version: 1, entries: {} };
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as LibraryIndex;
  if (parsed.version !== 1 || typeof parsed.entries !== "object" || !parsed.entries) {
    return { ...EMPTY, entries: {} };
  }
  return parsed;
}

export async function saveIndex(index: LibraryIndex): Promise<void> {
  await mkdir(libraryRoot(), { recursive: true });
  await writeFile(indexFile(), JSON.stringify(index, null, 2));
}

/** Re-read entry and clear paths whose files disappeared. */
export async function refreshEntry(
  videoId: string,
): Promise<LibraryEntry | null> {
  const index = await loadIndex();
  const entry = index.entries[videoId];
  if (!entry) return null;

  const captionsOk = entry.captionsPath
    ? await exists(entry.captionsPath)
    : false;
  const audioOk = entry.audioPath ? await exists(entry.audioPath) : false;
  const videoOk = entry.videoPath ? await exists(entry.videoPath) : false;
  const pruned = pruneMissingPaths(entry, (p) => {
    if (p === entry.captionsPath) return captionsOk;
    if (p === entry.audioPath) return audioOk;
    if (p === entry.videoPath) return videoOk;
    return false;
  });

  if (pruned === entry) return entry;
  index.entries[videoId] = pruned;
  await saveIndex(index);
  return pruned;
}

export async function upsertEntry(entry: LibraryEntry): Promise<void> {
  const index = await loadIndex();
  index.entries[entry.videoId] = entry;
  await saveIndex(index);
}

export async function listEntries(): Promise<LibraryEntry[]> {
  const index = await loadIndex();
  const out: LibraryEntry[] = [];
  for (const id of Object.keys(index.entries)) {
    const refreshed = await refreshEntry(id);
    if (refreshed) out.push(refreshed);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listEntriesSafe(): Promise<LibraryEntry[]> {
  try {
    return await listEntries();
  } catch {
    return [];
  }
}

export async function loadLessonFromEntry(
  entry: LibraryEntry,
): Promise<LoadedLesson | null> {
  if (!entry.captionsPath) return null;
  try {
    if (!(await exists(entry.captionsPath))) return null;
    const raw = await readFile(entry.captionsPath, "utf8");
    const parsed = JSON.parse(raw) as {
      videoId: string;
      title: string;
      track: CaptionTrack | null;
      cues: CaptionCue[];
      sentences: Sentence[];
    };
    const lastEnd =
      parsed.sentences.length > 0
        ? parsed.sentences[parsed.sentences.length - 1]!.endMs
        : null;
    const localVideo =
      entry.videoPath && (await exists(entry.videoPath))
        ? `file://${entry.videoPath}`
        : null;
    const localAudio =
      entry.audioPath && (await exists(entry.audioPath))
        ? `file://${entry.audioPath}`
        : null;
    const mediaUrl =
      localVideo || localAudio || entry.videoUrl || entry.audioUrl;

    return {
      video: {
        videoId: parsed.videoId || entry.videoId,
        title: parsed.title || entry.title,
        audioUrl: mediaUrl,
        audioMimeType: localVideo
          ? "video/mp4"
          : entry.audioMimeType || "audio/mp4",
        videoUrl: localVideo || entry.videoUrl || null,
        videoMimeType: localVideo ? "video/mp4" : null,
        durationMs: lastEnd,
        captionTracks: parsed.track ? [parsed.track] : [],
        playerResponse: null,
      },
      track: parsed.track ?? null,
      cues: parsed.cues ?? [],
      sentences: parsed.sentences ?? [],
    };
  } catch {
    return null;
  }
}
