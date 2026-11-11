import { exists, mkdir, readFile, readdir, rmdir, unlink, writeFile } from "fs/promises";
import { mergeSentences } from "../youtube/captions";
import type {
  CaptionCue,
  CaptionTrack,
  LoadedLesson,
  Sentence,
} from "../youtube/types";
import type { ArchiveRecord, LibraryEntry } from "./types";
import {
  archiveFile,
  audioFile,
  captionsFile,
  entryDir,
  entryMetaFile,
  libraryRoot,
  videoFile,
} from "./paths";

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
    videoPath === entry.videoPath
  ) {
    return entry;
  }
  return { ...entry, captionsPath, audioPath, videoPath, updatedAt: Date.now() };
}

export function normalizeEntry(raw: Partial<LibraryEntry> & { videoId: string }): LibraryEntry {
  const now = Date.now();
  const captionsPath =
    typeof raw.captionsPath === "string" ? raw.captionsPath : null;
  const state =
    raw.state === "pending" || raw.state === "ready" || raw.state === "error"
      ? raw.state
      : captionsPath
        ? "ready"
        : "pending";
  return {
    videoId: raw.videoId,
    url:
      typeof raw.url === "string" && raw.url
        ? raw.url
        : `https://www.youtube.com/watch?v=${raw.videoId}`,
    title: typeof raw.title === "string" && raw.title ? raw.title : raw.videoId,
    thumbnailUrl:
      typeof raw.thumbnailUrl === "string" && raw.thumbnailUrl
        ? raw.thumbnailUrl
        : `https://i.ytimg.com/vi/${raw.videoId}/hqdefault.jpg`,
    site: "YouTube",
    state,
    captionsPath,
    videoPath: typeof raw.videoPath === "string" ? raw.videoPath : null,
    audioPath: typeof raw.audioPath === "string" ? raw.audioPath : null,
    videoUrl: typeof raw.videoUrl === "string" ? raw.videoUrl : null,
    audioUrl: typeof raw.audioUrl === "string" ? raw.audioUrl : null,
    audioMimeType:
      typeof raw.audioMimeType === "string" ? raw.audioMimeType : null,
    durationMs: typeof raw.durationMs === "number" ? raw.durationMs : null,
    quality: typeof raw.quality === "string" ? raw.quality : null,
    subtitleLabel:
      typeof raw.subtitleLabel === "string" ? raw.subtitleLabel : null,
    subtitleIsAuto:
      typeof raw.subtitleIsAuto === "boolean" ? raw.subtitleIsAuto : null,
    sizeBytes: typeof raw.sizeBytes === "number" ? raw.sizeBytes : null,
    note: typeof raw.note === "string" ? raw.note : null,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
  };
}

function mediaPathForArchive(entry: LibraryEntry): string | null {
  return entry.videoPath || entry.audioPath || null;
}

function archiveLine(entry: LibraryEntry): string {
  const record: ArchiveRecord = {
    k: ["youtube", entry.videoId],
    p: mediaPathForArchive(entry),
    captions: entry.captionsPath,
  };
  return JSON.stringify(record);
}

async function rewriteArchive(entries: LibraryEntry[]): Promise<void> {
  await mkdir(libraryRoot(), { recursive: true });
  const body =
    entries.length === 0
      ? ""
      : `${entries.map(archiveLine).join("\n")}\n`;
  await writeFile(archiveFile(), body);
}

export async function readEntry(videoId: string): Promise<LibraryEntry | null> {
  if (!videoId || videoId === "index") return null;
  const path = entryMetaFile(videoId);
  if (await exists(path)) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as Partial<LibraryEntry>;
      if (!parsed || typeof parsed !== "object" || parsed.videoId === "index") {
        return null;
      }
      return normalizeEntry({ ...parsed, videoId: parsed?.videoId || videoId });
    } catch {
      // fallback to directory scan below
    }
  }

  // Fallback for directory-based entries (library/<videoId>/captions.json)
  try {
    const capPath = captionsFile(videoId);
    if (await exists(capPath)) {
      const dir = entryDir(videoId);
      const vCandidate = (await exists(videoFile(videoId)))
        ? videoFile(videoId)
        : (await exists(`${dir}/video.mp4`))
          ? `${dir}/video.mp4`
          : null;
      const aCandidate = (await exists(audioFile(videoId)))
        ? audioFile(videoId)
        : (await exists(`${dir}/audio.m4a`))
          ? `${dir}/audio.m4a`
          : null;
      // If neither video nor audio exists, do not resurrect an unplayable zombie entry
      if (!vCandidate && !aCandidate) {
        return null;
      }
      return normalizeEntry({
        videoId,
        captionsPath: capPath,
        videoPath: vCandidate,
        audioPath: aCandidate,
        state: "ready",
      });
    }
  } catch {
    // ignore
  }

  return null;
}

export async function writeEntry(entry: LibraryEntry): Promise<void> {
  if (!entry.videoId || entry.videoId === "index") return;
  await mkdir(libraryRoot(), { recursive: true });
  const normalized = normalizeEntry(entry);
  await writeFile(entryMetaFile(normalized.videoId), JSON.stringify(normalized, null, 2));
}

async function listEntryIds(): Promise<string[]> {
  const root = libraryRoot();
  if (!(await exists(root))) return [];
  const names = await readdir(root);
  const ids = new Set<string>();
  for (const name of names) {
    if (name.endsWith(".json")) {
      if (name === "index.json" || name === "archive.jsonl") continue;
      const id = name.slice(0, -".json".length);
      if (id && id !== "index") ids.add(id);
    } else if (!name.includes(".")) {
      ids.add(name);
    }
  }
  return [...ids];
}

export async function removeDirRecursive(dirPath: string): Promise<void> {
  if (!(await exists(dirPath))) return;
  try {
    const names = await readdir(dirPath);
    for (const name of names) {
      const full = `${dirPath}/${name}`;
      try {
        await unlink(full);
      } catch {
        await removeDirRecursive(full);
      }
    }
    await rmdir(dirPath);
  } catch {
    // ignore
  }
}

export async function deleteEntry(
  videoId: string,
  options?: { deleteMediaFile?: boolean },
): Promise<void> {
  if (!videoId || videoId === "index") return;
  try {
    const entry = await readEntry(videoId);
    if (options?.deleteMediaFile && entry) {
      if (entry.videoPath && (await exists(entry.videoPath))) {
        await unlink(entry.videoPath).catch(() => {});
      }
      if (entry.audioPath && (await exists(entry.audioPath))) {
        await unlink(entry.audioPath).catch(() => {});
      }
    }
  } catch {
    // ignore
  }
  try {
    const metaPath = entryMetaFile(videoId);
    if (await exists(metaPath)) {
      await unlink(metaPath);
    }
  } catch {
    // ignore
  }
  try {
    await removeDirRecursive(entryDir(videoId));
  } catch {
    // ignore
  }
  const all = await listEntriesRaw();
  const filtered = all.filter((e) => e.videoId !== videoId);
  await rewriteArchive(filtered);
}

async function listEntriesRaw(): Promise<LibraryEntry[]> {
  const ids = await listEntryIds();
  const out: LibraryEntry[] = [];
  for (const id of ids) {
    const entry = await readEntry(id);
    if (entry) out.push(entry);
  }
  return out;
}

/** Re-read entry and clear paths whose files disappeared. */
export async function refreshEntry(
  videoId: string,
): Promise<LibraryEntry | null> {
  const entry = await readEntry(videoId);
  if (!entry) {
    // Clean up residual directory and archive if metadata or media is completely gone
    try {
      await removeDirRecursive(entryDir(videoId));
    } catch {
      // ignore
    }
    return null;
  }

  const captionsOk = entry.captionsPath
    ? await exists(entry.captionsPath)
    : false;
  const audioOk = entry.audioPath ? await exists(entry.audioPath) : false;
  const videoOk = entry.videoPath ? await exists(entry.videoPath) : false;

  // Stale/orphaned entry cleanup:
  // If the entry had local media (or was ready) but has no media file on disk
  // and no remote streaming url, clean it up completely.
  const hasLocalMedia = audioOk || videoOk;
  const hasRemoteMedia = Boolean(entry.audioUrl || entry.videoUrl);
  if (!hasLocalMedia && !hasRemoteMedia) {
    await deleteEntry(videoId);
    return null;
  }

  const pruned = pruneMissingPaths(entry, (p) => {
    if (p === entry.captionsPath) return captionsOk;
    if (p === entry.audioPath) return audioOk;
    if (p === entry.videoPath) return videoOk;
    return false;
  });

  if (pruned === entry) return entry;
  await writeEntry(pruned);
  const all = await listEntriesRaw();
  await rewriteArchive(all);
  return pruned;
}

export async function upsertEntry(entry: LibraryEntry): Promise<void> {
  const existing = await readEntry(entry.videoId);
  const now = Date.now();
  const merged = normalizeEntry({
    ...entry,
    createdAt: existing?.createdAt ?? entry.createdAt ?? now,
    updatedAt: now,
  });
  await writeEntry(merged);
  const all = await listEntriesRaw();
  // Ensure this entry is present even if list raced
  const byId = new Map(all.map((e) => [e.videoId, e]));
  byId.set(merged.videoId, merged);
  await rewriteArchive([...byId.values()]);
}

export async function listEntries(): Promise<LibraryEntry[]> {
  const ids = await listEntryIds();
  const out: LibraryEntry[] = [];
  for (const id of ids) {
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
    const cues = parsed.cues ?? [];
    const sentences =
      cues.length > 0 ? mergeSentences(cues) : parsed.sentences ?? [];
    const lastEnd =
      sentences.length > 0
        ? sentences[sentences.length - 1]!.endMs
        : null;
    const localVideo =
      entry.videoPath && (await exists(entry.videoPath))
        ? entry.videoPath
        : null;
    const localAudio =
      entry.audioPath && (await exists(entry.audioPath))
        ? entry.audioPath
        : null;
    const mediaUrl =
      localVideo || localAudio || entry.videoUrl || entry.audioUrl;

    return {
      video: {
        videoId: parsed.videoId || entry.videoId,
        title: parsed.title || entry.title,
        thumbnailUrl:
          entry.thumbnailUrl ||
          `https://i.ytimg.com/vi/${parsed.videoId || entry.videoId}/hqdefault.jpg`,
        audioUrl: mediaUrl,
        audioMimeType: localVideo
          ? "video/mp4"
          : entry.audioMimeType || "audio/mp4",
        videoUrl: localVideo || entry.videoUrl || null,
        videoMimeType: localVideo ? "video/mp4" : null,
        durationMs: lastEnd ?? entry.durationMs,
        captionTracks: parsed.track ? [parsed.track] : [],
        playerResponse: null,
      },
      track: parsed.track ?? null,
      cues: cues,
      sentences: sentences,
    };
  } catch {
    return null;
  }
}
