import { earProbe, type VideoDimensions } from "../youtube/earClient";
import { writeEntry } from "./index";
import type { LibraryEntry } from "./types";

function isAudioLike(entry: LibraryEntry): boolean {
  if (entry.quality?.toLowerCase().includes("audio")) return true;
  if (entry.quality?.toLowerCase().includes("m4a")) return true;
  if (entry.audioPath && !entry.videoPath) return true;
  return false;
}

/** True when a local video entry is ready and missing persisted pixel dimensions. */
export function needsDimensionProbe(entry: LibraryEntry): boolean {
  if (entry.state !== "ready") return false;
  if (isAudioLike(entry)) return false;
  if (!entry.videoPath) return false;
  return !(
    typeof entry.videoWidth === "number" &&
    entry.videoWidth > 0 &&
    typeof entry.videoHeight === "number" &&
    entry.videoHeight > 0
  );
}

/**
 * Batch-probe local video files missing `videoWidth`/`videoHeight`, persist the
 * discovered dimensions without altering `createdAt`/`updatedAt`, and return
 * a map of `videoId -> { width, height }`.
 */
export async function backfillVideoDimensions(
  entries: readonly LibraryEntry[],
  attemptedIds: Set<string>,
  deps: {
    probe?: (paths: readonly string[]) => Promise<Record<string, VideoDimensions>>;
    write?: (entry: LibraryEntry) => Promise<void>;
  } = {},
): Promise<Record<string, VideoDimensions>> {
  const candidates = entries.filter(
    (entry) => !attemptedIds.has(entry.videoId) && needsDimensionProbe(entry),
  );
  if (candidates.length === 0) return {};

  for (const entry of candidates) {
    attemptedIds.add(entry.videoId);
  }

  const paths = [...new Set(candidates.map((e) => e.videoPath!).filter(Boolean))];
  const probeFn = deps.probe ?? earProbe;
  const writeFn = deps.write ?? writeEntry;
  const probed = await probeFn(paths);

  const updates: Record<string, VideoDimensions> = {};
  for (const entry of candidates) {
    const dims = entry.videoPath ? probed[entry.videoPath] : undefined;
    if (!dims || dims.width <= 0 || dims.height <= 0) continue;
    updates[entry.videoId] = dims;
    try {
      await writeFn({
        ...entry,
        videoWidth: dims.width,
        videoHeight: dims.height,
      });
    } catch {
      // keep in-memory update even if disk write fails
    }
  }
  return updates;
}
