import { join } from "path";
import process from "process";

/** App-private library root: `<dataDir>/library`. */
export function libraryRoot(): string {
  const dataDir = process.dataDir;
  if (!dataDir) {
    throw new Error("No app dataDir — library needs a native host");
  }
  return join(dataDir, "library");
}

export function entryDir(videoId: string): string {
  return join(libraryRoot(), videoId);
}

export function captionsFile(videoId: string): string {
  return join(entryDir(videoId), "captions.json");
}

export function audioFile(videoId: string, ext = "m4a"): string {
  return join(entryDir(videoId), `audio.${ext}`);
}

export function videoFile(videoId: string, ext = "mp4"): string {
  return join(entryDir(videoId), `video.${ext}`);
}

export function indexFile(): string {
  return join(libraryRoot(), "index.json");
}
