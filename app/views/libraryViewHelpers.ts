import type { DownloadTaskProgress, LibraryEntry } from "../library/types";
import { formatBytes } from "../youtube/parse";

export function isAudioEntry(entry: LibraryEntry): boolean {
  if (entry.quality?.toLowerCase().includes("audio")) return true;
  if (entry.quality?.toLowerCase().includes("m4a")) return true;
  if (entry.audioPath && !entry.videoPath) return true;
  return false;
}

/**
 * One meta line for a library card: "YouTube · 720p · 170 MB" or
 * "SoundCloud · M4A · 4.4 MB".
 */
export function formatEntryDescription(entry: LibraryEntry): string {
  const parts: string[] = [];
  parts.push(entry.site || "YouTube");
  if (entry.quality) {
    parts.push(entry.quality);
  } else if (entry.videoPath) {
    parts.push("video");
  } else if (entry.audioPath) {
    parts.push("audio");
  }
  if (entry.sizeBytes) {
    parts.push(formatBytes(entry.sizeBytes));
  }
  return parts.join(" · ");
}

/** "m:ss" / "h:mm:ss", or "" when the duration is unknown. */
export function formatDuration(durationMs: number | null | undefined): string {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return "";
  const total = Math.round(durationMs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Subtitle status worth showing on a card: only the abnormal cases. */
export type SubtitleIssue = "auto" | "none" | null;

export function subtitleIssue(entry: LibraryEntry): SubtitleIssue {
  if (!entry.captionsPath && !entry.subtitleLabel) return "none";
  if (entry.subtitleIsAuto) return "auto";
  return null;
}

/**
 * Finished entries for the grid: video and audio mixed, newest added first,
 * without the ones still downloading (they show as download cards).
 */
export function completedEntries(
  entries: readonly LibraryEntry[],
  downloads: readonly DownloadTaskProgress[],
): LibraryEntry[] {
  const activeIds = new Set(downloads.map((d) => d.videoId));
  return entries
    .filter(
      (e) =>
        !activeIds.has(e.videoId) &&
        e.state !== "pending" &&
        e.state !== "downloading" &&
        e.state !== "paused",
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Case-insensitive multi-token search across local library entries. */
export function filterLibraryEntries(
  entries: readonly LibraryEntry[],
  query: string,
): LibraryEntry[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [...entries];
  return entries.filter((entry) => {
    const haystack = [
      entry.title,
      entry.site,
      entry.quality,
      entry.subtitleLabel,
      entry.note,
      entry.videoId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

/** Filter active downloads by the same search tokens. */
export function filterActiveDownloads(
  downloads: readonly DownloadTaskProgress[],
  query: string,
): DownloadTaskProgress[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [...downloads];
  return downloads.filter((task) => {
    const haystack = [task.title, task.qualityLabel, task.subtitleLabel, task.videoId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

/** Toggle a single videoId in a multi-select set, returning a new Set. */
export function toggleSelectedId(
  selected: ReadonlySet<string>,
  videoId: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(videoId)) next.delete(videoId);
  else next.add(videoId);
  return next;
}

/** Drop selected IDs that are no longer present in the library. */
export function pruneSelectedIds(
  selected: ReadonlySet<string>,
  validIds: ReadonlySet<string>,
): Set<string> {
  let changed = false;
  for (const id of selected) {
    if (!validIds.has(id)) {
      changed = true;
      break;
    }
  }
  if (!changed) return new Set(selected);
  const next = new Set<string>();
  for (const id of selected) {
    if (validIds.has(id)) next.add(id);
  }
  return next;
}

/** True when there is at least one visible item and every visible item is selected. */
export function areAllVisibleSelected(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}

/** Select all visible items, or deselect them all if every visible item is already selected. */
export function toggleSelectAllIds(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const next = new Set(selected);
  if (areAllVisibleSelected(selected, visibleIds)) {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return next;
}
