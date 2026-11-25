import { exists } from "fs/promises";
import { resolveDataDirOrNull } from "./env";
import { normalizeEntry } from "./library/index";
import {
  mediaRoot,
  openDirectory,
  openFileParentFolder,
} from "./library/paths";
import type { LibraryEntry } from "./library/types";
import { localMediaCandidates, localMediaFileUrl } from "./player";
import { settings } from "./ui/settings";
import type { DiscoverItem } from "./views/discover/types";

async function firstExisting(paths: readonly string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      if (await exists(path)) return path;
    } catch {
      // try the next one
    }
  }
  return null;
}

function candidatesFor(entry: Pick<LibraryEntry, "videoId" | "videoPath" | "audioPath">) {
  return localMediaCandidates({
    videoId: entry.videoId,
    videoPath: entry.videoPath,
    audioPath: entry.audioPath,
    dataDir: resolveDataDirOrNull(),
  });
}

/** The local media file to play for an entry, or null. */
export async function resolvePlayableSrc(entry: LibraryEntry): Promise<string | null> {
  return (await firstExisting(candidatesFor(entry))) ?? localMediaFileUrl(entry);
}

/** Reveals an entry's file in the file manager (the media folder without one). */
export async function revealEntry(entry: LibraryEntry): Promise<void> {
  const target =
    entry.videoPath ||
    entry.audioPath ||
    (await firstExisting(candidatesFor(entry))) ||
    entry.captionsPath ||
    null;
  if (target) await openFileParentFolder(target);
  else await openDirectory(mediaRoot(settings().downloadFolder));
}

/**
 * A Discover item already on disk without a Library record (downloaded by
 * the CLI, say), as an entry the player opens; null when it is not.
 */
export async function localDiscoverEntry(item: DiscoverItem): Promise<LibraryEntry | null> {
  const path = await firstExisting(
    candidatesFor({ videoId: item.videoId, videoPath: null, audioPath: null }),
  );
  if (!path) return null;
  return normalizeEntry({
    videoId: item.videoId,
    url: item.url,
    title: item.title,
    thumbnailUrl: item.thumbnailUrl,
    videoPath: path,
  });
}
