import { exists, mkdir, readdir, readFile, rmdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import process from "process";
import { Storage } from "nsh";
import type {
  AccentColor,
  LocalItemRecord,
  MirrorSettings,
  PersistedMobileData,
  RemoteCatalogItem,
} from "./types";
import { isSafeMediaExt, isSafeVideoId } from "./validation";

const STATE_KEY = "ear.ios.mirror.v1";

/** Stay safely under NSH `fs/promises.writeFile`'s 8 MiB per-write cap. */
export const MIRROR_CHUNK_BYTES = 4 * 1024 * 1024;
export const SINGLE_FILE_MAX_BYTES = 8 * 1024 * 1024;

export const DEFAULT_MOBILE_SETTINGS: MirrorSettings = {
  appearance: "system",
  accent: "blue",
  language: "zh",
  backgroundSync: true,
};

function sanitizeAccent(value: unknown): AccentColor {
  return value === "green" || value === "orange" || value === "purple" || value === "red"
    ? value
    : "blue";
}

export function emptyPersistedData(): PersistedMobileData {
  return {
    settings: { ...DEFAULT_MOBILE_SETTINGS },
    macs: [],
    localItems: {},
    catalogs: {},
  };
}

function sanitizeLocalItems(raw: unknown): Record<string, LocalItemRecord> {
  const out: Record<string, LocalItemRecord> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, LocalItemRecord>)) {
    if (isSafeVideoId(k) && v && typeof v === "object") {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeCatalogs(raw: unknown): Record<string, RemoteCatalogItem[]> {
  const out: Record<string, RemoteCatalogItem[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [macId, list] of Object.entries(raw as Record<string, RemoteCatalogItem[]>)) {
    if (Array.isArray(list)) {
      out[macId] = list.filter((it) => it && isSafeVideoId(it.videoId) && isSafeMediaExt(it.mediaExt));
    }
  }
  return out;
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
        accent: sanitizeAccent(s?.accent),
        language: s?.language === "en" ? "en" : "zh",
        backgroundSync: typeof s?.backgroundSync === "boolean" ? s.backgroundSync : true,
      },
      macs: Array.isArray(parsed.macs) ? parsed.macs : [],
      localItems: sanitizeLocalItems(parsed.localItems),
      catalogs: sanitizeCatalogs(parsed.catalogs),
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
  readChunk?(videoId: string, chunkIndex: number): Promise<Uint8Array | null>;
  writeDirectMedia(videoId: string, ext: string, bytes: Uint8Array): Promise<string>;
  writeCaptions(videoId: string, captionsJson: string): Promise<string>;
  removeVideoFiles(videoId: string): Promise<void>;
}

function mirrorRootDir(): string | null {
  const dir = process.dataDir;
  if (!dir) return null;
  return join(dir, "mirror");
}

function assertSafeVideoId(videoId: string): void {
  if (!isSafeVideoId(videoId)) {
    throw new Error(`Unsafe videoId rejected: ${String(videoId).slice(0, 64)}`);
  }
}

function assertSafeMediaExt(ext: string): string {
  const clean = ext.trim().toLowerCase();
  if (!isSafeMediaExt(clean)) {
    throw new Error(`Unsafe mediaExt rejected: ${String(ext).slice(0, 32)}`);
  }
  return clean;
}

/** Resolve a strict child directory under `root`, rejecting traversal or root-self paths. */
export function safeVideoDir(root: string, videoId: string): string {
  assertSafeVideoId(videoId);
  const normalizedRoot = root.replace(/\/+$/, "");
  const target = join(normalizedRoot, videoId);
  if (
    target === normalizedRoot ||
    !target.startsWith(`${normalizedRoot}/`) ||
    target.includes("..")
  ) {
    throw new Error(`Path containment violation for videoId: ${videoId}`);
  }
  return target;
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
      assertSafeVideoId(videoId);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
        throw new Error(`Invalid chunkIndex: ${chunkIndex}`);
      }
      const root = mirrorRootDir();
      if (!root) {
        return `memory://mirror/${videoId}/chunks/${chunkIndex}.part`;
      }
      const chunksDir = join(safeVideoDir(root, videoId), "chunks");
      await mkdir(chunksDir, { recursive: true });
      const filePath = join(chunksDir, `${String(chunkIndex).padStart(4, "0")}.part`);
      await writeFile(filePath, bytes);
      return filePath;
    },

    async readChunk(videoId, chunkIndex) {
      assertSafeVideoId(videoId);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return null;
      const root = mirrorRootDir();
      if (!root) return null;
      const filePath = join(
        safeVideoDir(root, videoId),
        "chunks",
        `${String(chunkIndex).padStart(4, "0")}.part`,
      );
      try {
        const data = await readFile(filePath);
        return data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBufferLike);
      } catch {
        return null;
      }
    },

    async writeDirectMedia(videoId, ext, bytes) {
      assertSafeVideoId(videoId);
      const safeExt = assertSafeMediaExt(ext);
      const root = mirrorRootDir();
      if (!root) {
        return `memory://mirror/${videoId}/media.${safeExt}`;
      }
      const dir = safeVideoDir(root, videoId);
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, `media.${safeExt}`);
      await writeFile(filePath, bytes);
      return filePath;
    },

    async writeCaptions(videoId, captionsJson) {
      assertSafeVideoId(videoId);
      const root = mirrorRootDir();
      if (!root) {
        return `memory://mirror/${videoId}/captions.json`;
      }
      const dir = safeVideoDir(root, videoId);
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, "captions.json");
      await writeFile(filePath, captionsJson);
      return filePath;
    },

    async removeVideoFiles(videoId) {
      assertSafeVideoId(videoId);
      const root = mirrorRootDir();
      if (!root) return;
      await removeDirTree(safeVideoDir(root, videoId)).catch(() => {});
    },
  };
}
