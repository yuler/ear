import { join } from "path";
import { homedir } from "os";
import process from "process";

/** Default media folder, same idea as Downbit's `folder`. */
export function defaultDownloadFolder(): string {
  return join(homedir(), "Downloads");
}

/** Where video/audio files land (Downloads or a user-chosen folder). */
export function mediaRoot(downloadFolder?: string | null): string {
  const folder = downloadFolder?.trim();
  return folder || defaultDownloadFolder();
}

/** App-private library metadata root: `<dataDir>/library`. */
export function libraryRoot(): string {
  const dataDir = process.dataDir;
  if (!dataDir) {
    throw new Error("No app dataDir — library needs a native host");
  }
  return join(dataDir, "library");
}

/** Per-video captions directory: `library/<videoId>/`. */
export function entryDir(videoId: string): string {
  return join(libraryRoot(), videoId);
}

/** Task metadata file: `library/<videoId>.json`. */
export function entryMetaFile(videoId: string): string {
  return join(libraryRoot(), `${videoId}.json`);
}

export function captionsFile(videoId: string): string {
  return join(entryDir(videoId), "captions.json");
}

/** Local video under the media root, named by video id. */
export function videoFile(
  videoId: string,
  ext = "mp4",
  downloadFolder?: string | null,
): string {
  return join(mediaRoot(downloadFolder), `${videoId}.${ext}`);
}

/** Local audio under the media root when video is unavailable. */
export function audioFile(
  videoId: string,
  ext = "m4a",
  downloadFolder?: string | null,
): string {
  return join(mediaRoot(downloadFolder), `${videoId}.${ext}`);
}

/** Dedup index — Downbit's `archive.jsonl`. */
export function archiveFile(): string {
  return join(libraryRoot(), "archive.jsonl");
}
