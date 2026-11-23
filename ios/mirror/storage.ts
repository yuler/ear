import { exists, mkdir, readdir, rmdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import process from "process";
import { Storage } from "nsh";
import type { MirrorSettings, PersistedMobileData } from "./types";

const STATE_KEY = "ear.ios.mirror.v1";

/** Stay safely under NSH `fs/promises.writeFile`'s 8 MiB per-write cap. */
export const MIRROR_CHUNK_BYTES = 4 * 1024 * 1024;
export const SINGLE_FILE_MAX_BYTES = 8 * 1024 * 1024;

export const DEFAULT_MOBILE_SETTINGS: MirrorSettings = {
  appearance: "system",
  language: "zh",
  backgroundSync: true,
};

export function emptyPersistedData(): PersistedMobileData {
  return {
    settings: { ...DEFAULT_MOBILE_SETTINGS },
    macs: [],
    localItems: {},
    catalogs: {},
  };
}

export async function loadPersistedData(): Promise<PersistedMobileData> {
  try {
    const raw = await Storage.getItem(STATE_KEY);
    if (!raw) return emptyPersistedData();
    const parsed = JSON.parse(raw) as Partial<PersistedMobileData>;
    const s = parsed.settings;
    return {
      settings: {
        appearance:
          s?.appearance === "light" || s?.appearance === "dark" || s?.appearance === "system"
            ? s.appearance
            : "system",
        language: s?.language === "en" ? "en" : "zh",
        backgroundSync: typeof s?.backgroundSync === "boolean" ? s.backgroundSync : true,
      },
      macs: Array.isArray(parsed.macs) ? parsed.macs : [],
      localItems:
        parsed.localItems && typeof parsed.localItems === "object"
          ? parsed.localItems
          : {},
      catalogs:
        parsed.catalogs && typeof parsed.catalogs === "object"
          ? parsed.catalogs
          : {},
    };
  } catch {
    return emptyPersistedData();
  }
}

export async function savePersistedData(data: PersistedMobileData): Promise<void> {
  try {
    await Storage.setItem(STATE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures in ephemeral test contexts
  }
}

export interface MirrorFileStore {
  writeChunk(videoId: string, chunkIndex: number, bytes: Uint8Array): Promise<string>;
  writeDirectMedia(videoId: string, ext: string, bytes: Uint8Array): Promise<string>;
  writeCaptions(videoId: string, captionsJson: string): Promise<string>;
  removeVideoFiles(videoId: string): Promise<void>;
}

function mirrorRootDir(): string | null {
  const dir = process.dataDir;
  if (!dir) return null;
  return join(dir, "mirror");
}

function videoDir(root: string, videoId: string): string {
  return join(root, videoId);
}

async function removeDirTree(dirPath: string): Promise<void> {
  if (!(await exists(dirPath))) return;
  const names = await readdir(dirPath);
  for (const name of names) {
    const full = join(dirPath, name);
    try {
      await unlink(full);
    } catch {
      await removeDirTree(full);
    }
  }
  await rmdir(dirPath).catch(() => {});
}

/** Real sandboxed file store backed by NSH `fs/promises` under `${dataDir}/mirror`. */
export function createDiskFileStore(): MirrorFileStore {
  return {
    async writeChunk(videoId, chunkIndex, bytes) {
      const root = mirrorRootDir();
      if (!root) {
        return `memory://mirror/${videoId}/chunks/${chunkIndex}.part`;
      }
      const chunksDir = join(videoDir(root, videoId), "chunks");
      await mkdir(chunksDir, { recursive: true });
      const filePath = join(chunksDir, `${String(chunkIndex).padStart(4, "0")}.part`);
      await writeFile(filePath, bytes);
      return filePath;
    },

    async writeDirectMedia(videoId, ext, bytes) {
      const root = mirrorRootDir();
      if (!root) {
        return `memory://mirror/${videoId}/media.${ext}`;
      }
      const dir = videoDir(root, videoId);
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, `media.${ext}`);
      await writeFile(filePath, bytes);
      return filePath;
    },

    async writeCaptions(videoId, captionsJson) {
      const root = mirrorRootDir();
      if (!root) {
        return `memory://mirror/${videoId}/captions.json`;
      }
      const dir = videoDir(root, videoId);
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, "captions.json");
      await writeFile(filePath, captionsJson);
      return filePath;
    },

    async removeVideoFiles(videoId) {
      const root = mirrorRootDir();
      if (!root) return;
      await removeDirTree(videoDir(root, videoId)).catch(() => {});
    },
  };
}
