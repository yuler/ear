import { expect, test } from "nsh/test";
import { MirrorApiError, type MirrorApiClient } from "./client";
import { createMirrorEngine } from "./engine";
import { emptyPersistedData, type MirrorFileStore } from "./storage";
import type { PairedMac, PersistedMobileData, RemoteCatalogItem } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeMac(id: string, shortName: string, host: string): PairedMac {
  return {
    id,
    name: `${shortName} Mac`,
    shortName,
    transport: "lan",
    host,
    port: 7890,
    token: `tok-${id}`,
    deviceId: "dev-ios-1",
    pairedAt: 1,
    lastSyncedAt: null,
  };
}

function makeItem(videoId: string, sizeBytes: number, contentSha256: string, updatedAt: number): RemoteCatalogItem {
  return {
    videoId,
    title: `Lesson ${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationMs: 60_000,
    sizeBytes,
    contentSha256,
    quality: "720p",
    mediaExt: "mp4",
    mimeType: "video/mp4",
    hasCaptions: false,
    updatedAt,
  };
}

function createDelayedStore() {
  const chunks = new Map<string, Uint8Array>();
  let releaseCleanup: (() => void) | null = null;
  let cleanupStarted = false;

  const files: MirrorFileStore = {
    async writeChunk(videoId, idx, bytes) {
      const key = `${videoId}/chunk-${idx}`;
      chunks.set(key, new Uint8Array(bytes));
      return key;
    },
    async writeDirectMedia(videoId, ext, bytes) {
      const key = `${videoId}/media.${ext}`;
      chunks.set(key, new Uint8Array(bytes));
      return key;
    },
    async writeCaptions(videoId) {
      return `${videoId}/captions.json`;
    },
    async removeVideoFiles(videoId) {
      cleanupStarted = true;
      await new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      for (const k of [...chunks.keys()]) {
        if (k.startsWith(`${videoId}/`)) chunks.delete(k);
      }
    },
  };

  const assembleChunks = (videoId: string, count: number): Uint8Array => {
    const parts: Uint8Array[] = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const part = chunks.get(`${videoId}/chunk-${i}`);
      if (!part) throw new Error(`Missing chunk ${i}`);
      parts.push(part);
      total += part.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.byteLength;
    }
    return out;
  };

  return {
    files,
    assembleChunks,
    wasCleanupStarted: () => cleanupStarted,
    release: () => releaseCleanup?.(),
  };
}

test("delayed 404 stale-file cleanup completes before failover transfer writes replacement chunks", async () => {
  const chunkBytes = 4 * 1024 * 1024;
  const totalBytes = 9 * 1024 * 1024;
  const fileA = new Uint8Array(totalBytes).fill(0xaa);
  const fileB = new Uint8Array(totalBytes).fill(0xbb);

  const macA = makeMac("mac-a", "Home", "192.168.1.10");
  const macB = makeMac("mac-b", "Office", "10.0.0.10");
  const store = createDelayedStore();

  let macAChunks = 0;
  let macBRequests = 0;
  let persisted: PersistedMobileData = { ...emptyPersistedData(), macs: [macA, macB] };

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary(mac) {
      const sha = mac.id === "mac-a" ? "a".repeat(64) : "b".repeat(64);
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [makeItem("vid-race-404", totalBytes, sha, 3000)],
      };
    },
    async fetchMediaRange(mac, _videoId, start, end) {
      if (mac.id === "mac-a") {
        macAChunks += 1;
        if (macAChunks === 1) return fileA.subarray(start, end + 1);
        throw new MirrorApiError("http_error", "Not Found", 404);
      }
      macBRequests += 1;
      return fileB.subarray(start, end + 1);
    },
    async fetchCaptions() {
      return null;
    },
    async reportStatus() {},
    async unpair() {},
  };

  const engine = createMirrorEngine({
    client,
    files: store.files,
    loadState: async () => persisted,
    saveState: async (d) => {
      persisted = d;
    },
    chunkBytes,
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  await engine.pollAllMacs();
  await wait(30);

  // Mac A wrote chunk 0, then hit 404 on chunk 1; cleanup is held before resolving.
  expect(store.wasCleanupStarted()).toBe(true);
  // Replacement transfer from Mac B must NOT start while stale cleanup is in flight.
  expect(macBRequests).toBe(0);

  // Releasing cleanup allows Mac B to write all 3 chunks cleanly without later deletion.
  store.release();
  await wait(60);

  expect(engine.library()[0]?.status).toBe("ready");
  expect(macBRequests).toBe(3);
  const full = store.assembleChunks("vid-race-404", 3);
  expect(full.byteLength).toBe(totalBytes);
  expect(full[0]).toBe(0xbb);
  expect(full[chunkBytes]).toBe(0xbb);
  expect(full[totalBytes - 1]).toBe(0xbb);
});

test("delayed representation_changed cleanup blocks retry until stale partial removal completes", async () => {
  const chunkBytes = 4 * 1024 * 1024;
  const totalBytes = 9 * 1024 * 1024;
  const oldBytes = new Uint8Array(totalBytes).fill(0x11);
  const newBytes = new Uint8Array(totalBytes).fill(0x22);

  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const store = createDelayedStore();

  let callCount = 0;
  let currentSha = "1".repeat(64);
  let persisted: PersistedMobileData = { ...emptyPersistedData(), macs: [mac] };

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary() {
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [makeItem("vid-race-412", totalBytes, currentSha, 4000)],
      };
    },
    async fetchMediaRange(_mac, _videoId, start, end) {
      callCount += 1;
      if (callCount === 1) return oldBytes.subarray(start, end + 1);
      if (callCount === 2) {
        currentSha = "2".repeat(64);
        throw new MirrorApiError("representation_changed", "Precondition Failed", 412);
      }
      return newBytes.subarray(start, end + 1);
    },
    async fetchCaptions() {
      return null;
    },
    async reportStatus() {},
    async unpair() {},
  };

  const engine = createMirrorEngine({
    client,
    files: store.files,
    loadState: async () => persisted,
    saveState: async (d) => {
      persisted = d;
    },
    chunkBytes,
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  await engine.pollAllMacs();
  await wait(30);

  expect(store.wasCleanupStarted()).toBe(true);
  expect(callCount).toBe(2);

  // Even forcing prioritize() while cleanup is pending must not start writing replacement chunks.
  engine.prioritize("vid-race-412");
  await wait(20);
  expect(callCount).toBe(2);

  store.release();
  await wait(20);
  await engine.pollAllMacs();
  await wait(60);

  expect(engine.library()[0]?.status).toBe("ready");
  const full = store.assembleChunks("vid-race-412", 3);
  expect(full[0]).toBe(0x22);
  expect(full[chunkBytes]).toBe(0x22);
  expect(full[totalBytes - 1]).toBe(0x22);
});
