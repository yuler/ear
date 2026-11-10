import type { LibraryEntry } from "../library/types";
import { formatBytes } from "../youtube/parse";

export function isAudioEntry(entry: LibraryEntry): boolean {
  if (entry.quality?.toLowerCase().includes("audio")) return true;
  if (entry.quality?.toLowerCase().includes("m4a")) return true;
  if (entry.audioPath && !entry.videoPath) return true;
  return false;
}

/**
 * Formats metadata line matching the user's screenshot:
 * "YouTube · 720p · 170 MB" or "SoundCloud · M4A · 4.4 MB"
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
