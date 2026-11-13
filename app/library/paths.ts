import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";
import process from "process";
import { resolveDataDir } from "../env";
import { isNativeHost } from "../youtube/host";

/** Default media folder, same idea as Downbit's `folder`. */
export function defaultDownloadFolder(): string {
  return join(homedir(), "Downloads");
}

/** Where video/audio files land (Downloads or a user-chosen folder). */
export function mediaRoot(downloadFolder?: string | null): string {
  const folder = downloadFolder?.trim();
  return folder || defaultDownloadFolder();
}

/** App-private library metadata root: `<resolvedDataDir>/library`. */
export function libraryRoot(): string {
  return join(resolveDataDir(), "library");
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

/**
 * Opens a file or directory with the OS default handler across all systems.
 *
 * Uses `ear open` first (which handles native file manager reveal, Finder, Explorer,
 * and FreeDesktop D-Bus on Linux). Falls back to native platform tools.
 */
export async function openSystemPath(targetPath: string): Promise<boolean> {
  if (!targetPath) return false;
  if (!isNativeHost() || typeof process.run !== "function") return false;

  try {
    const res = await process.run("ear", ["open", targetPath]);
    if (res.code === 0) return true;
  } catch {
    // fallback below
  }

  if (process.platform === "macos") {
    try {
      const res = await process.run("open", [targetPath]);
      return res.code === 0;
    } catch {
      return false;
    }
  }

  if (process.platform === "windows") {
    try {
      const winPath = targetPath.replace(/\//g, "\\");
      const res = await process.run("explorer", [winPath]);
      return res.code === 0;
    } catch {
      return false;
    }
  }

  // Linux: gio open returns immediately; xdg-open often waits on the player.
  try {
    const res = await process.run("gio", ["open", targetPath]);
    if (res.code === 0) return true;
  } catch {
    // fallback
  }

  // Last resort: fire-and-forget so the UI does not freeze on xdg-open.
  if (typeof process.spawn === "function") {
    try {
      process.spawn("xdg-open", [targetPath], { timeoutMs: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Reveal a file in the desktop's native file manager (Finder / File Explorer / GNOME Files / Dolphin).
 * Leverages `ear files` / `ear open`, with multi-OS native fallbacks.
 */
export async function revealInFileManager(filePath: string): Promise<boolean> {
  if (!filePath) return false;
  if (!isNativeHost() || typeof process.run !== "function") return false;

  // 1. Try ear CLI (handles macOS open -R, Windows explorer /select, Linux D-Bus ShowItems)
  try {
    const res = await process.run("ear", ["files", filePath]);
    if (res.code === 0) return true;
  } catch {
    // try direct fallbacks
  }

  // 2. macOS: Finder reveal
  if (process.platform === "macos") {
    try {
      const res = await process.run("open", ["-R", filePath]);
      if (res.code === 0) return true;
    } catch {
      // fallback
    }
  }

  // 3. Windows: File Explorer reveal
  if (process.platform === "windows") {
    try {
      const winPath = filePath.replace(/\//g, "\\");
      const res = await process.run("explorer", [`/select,${winPath}`]);
      if (res.code === 0) return true;
    } catch {
      // fallback
    }
  }

  // 4. Linux: FreeDesktop D-Bus ShowItems (Nautilus/Files, Dolphin, etc.)
  if (process.platform === "linux") {
    const fileUri = filePath.startsWith("/")
      ? `file://${encodeURI(filePath)}`
      : filePath;
    try {
      const res = await process.run("gdbus", [
        "call",
        "--session",
        "--dest",
        "org.freedesktop.FileManager1",
        "--object-path",
        "/org/freedesktop/FileManager1",
        "--method",
        "org.freedesktop.FileManager1.ShowItems",
        `['${fileUri}']`,
        "",
      ]);
      if (res.code === 0) return true;
    } catch {
      // try dbus-send
    }

    try {
      const res = await process.run("dbus-send", [
        "--session",
        "--dest=org.freedesktop.FileManager1",
        "--type=method_call",
        "/org/freedesktop/FileManager1",
        "org.freedesktop.FileManager1.ShowItems",
        `array:string:${fileUri}`,
        "string:",
      ]);
      if (res.code === 0) return true;
    } catch {
      // try direct binaries
    }

    try {
      const res = await process.run("nautilus", ["--select", filePath]);
      if (res.code === 0) return true;
    } catch {
      // try dolphin
    }

    try {
      const res = await process.run("dolphin", ["--select", filePath]);
      if (res.code === 0) return true;
    } catch {
      // fallback
    }
  }

  // 5. Fallback: open parent folder
  const parent = dirname(filePath);
  return openDirectory(parent);
}

/** Ensure directory exists and open it in the system file manager. */
export async function openDirectory(dirPath: string): Promise<boolean> {
  if (!dirPath) return false;
  try {
    await mkdir(dirPath, { recursive: true });
  } catch {
    // ignore
  }
  return openSystemPath(dirPath);
}

/** Open the containing folder of a file in the system file manager (selecting the file if possible). */
export async function openFileParentFolder(filePath: string): Promise<boolean> {
  if (!filePath) return false;
  const revealed = await revealInFileManager(filePath);
  if (revealed) return true;
  const parent = dirname(filePath);
  return openDirectory(parent);
}

