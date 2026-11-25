import { expect, test } from "nsh/test";
import { MirrorApiError, type MirrorApiClient } from "./client";
import { createMirrorEngine } from "./engine";
import { sha256Bytes } from "./sha256";
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
    async readChunk(videoId, idx) {
      return chunks.get(`${videoId}/chunk-${idx}`) ?? null;
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
  const shaA = sha256Bytes(fileA);
  const shaB = sha256Bytes(fileB);

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
      const sha = mac.id === "mac-a" ? shaA : shaB;
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
  const oldSha = sha256Bytes(oldBytes);
  const newSha = sha256Bytes(newBytes);

  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const store = createDelayedStore();

  let callCount = 0;
  let currentSha = oldSha;
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
        currentSha = newSha;
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

test("delayed incompatible-partial cleanup serializes across background/foreground without losing replacement chunks", async () => {
  const chunkBytes = 4 * 1024 * 1024;
  const totalBytes = 9 * 1024 * 1024;
  const oldSha = "1".repeat(64);
  const newBytes = new Uint8Array(totalBytes).fill(0xbb);
  const newSha = sha256Bytes(newBytes);

  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const chunks = new Map<string, Uint8Array>();
  chunks.set("vid-incompat/chunk-0", new Uint8Array(chunkBytes).fill(0xaa));

  const pendingRemovals: Array<() => void> = [];
  let removalCalls = 0;
  let rangeRequests = 0;

  const files: MirrorFileStore = {
    async writeChunk(videoId, idx, bytes) {
      const key = `${videoId}/chunk-${idx}`;
      chunks.set(key, new Uint8Array(bytes));
      return key;
    },
    async readChunk(videoId, idx) {
      return chunks.get(`${videoId}/chunk-${idx}`) ?? null;
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
      removalCalls += 1;
      await new Promise<void>((resolve) => {
        pendingRemovals.push(resolve);
      });
      for (const k of [...chunks.keys()]) {
        if (k.startsWith(`${videoId}/`)) chunks.delete(k);
      }
    },
  };

  let persisted: PersistedMobileData = {
    ...emptyPersistedData(),
    settings: { appearance: "system", language: "zh", backgroundSync: false },
    macs: [mac],
    localItems: {
      "vid-incompat": {
        videoId: "vid-incompat",
        state: "partial",
        title: "Lesson vid-incompat",
        thumbnailUrl: "",
        durationMs: 60_000,
        sizeBytes: totalBytes,
        contentSha256: oldSha,
        downloadedBytes: chunkBytes,
        chunkSize: chunkBytes,
        completedChunks: 1,
        totalChunks: 3,
        mediaExt: "mp4",
        mimeType: "video/mp4",
        hasCaptions: false,
        localPath: "vid-incompat/chunk-0",
        captionsPath: null,
        sourceMacId: mac.id,
        sourceShortName: mac.shortName,
        updatedAt: 1000,
      },
    },
  };

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary() {
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [makeItem("vid-incompat", totalBytes, newSha, 5000)],
      };
    },
    async fetchMediaRange(_mac, _videoId, start, end) {
      rangeRequests += 1;
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
    files,
    loadState: async () => persisted,
    saveState: async (d) => {
      persisted = d;
    },
    chunkBytes,
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  await engine.pollAllMacs();
  await wait(25);

  // First transfer entered incompatible-partial cleanup and is held before deletion resolves.
  expect(removalCalls).toBe(1);
  expect(rangeRequests).toBe(0);

  // Backgrounding (with backgroundSync=false) cancels the transfer; foregrounding tries to reschedule.
  engine.setAppLifecycle("background");
  engine.setAppLifecycle("active");
  await wait(30);

  // Must NOT overlap a second removal or start downloading replacement chunks before removal #1 settles.
  expect(removalCalls).toBe(1);
  expect(rangeRequests).toBe(0);

  // Release removal #1: cancelled transfer exits cleanly without publishing stale partial,
  // and replacement transfer downloads all 3 new chunks cleanly.
  pendingRemovals.shift()?.();
  await wait(60);

  expect(removalCalls).toBe(1);
  expect(rangeRequests).toBe(3);
  expect(engine.library()[0]?.status).toBe("ready");
  expect(engine.localItems()["vid-incompat"]?.state).toBe("ready");
  expect(engine.localItems()["vid-incompat"]?.contentSha256).toBe(newSha);
  expect(chunks.get("vid-incompat/chunk-0")?.[0]).toBe(0xbb);
  expect(chunks.get("vid-incompat/chunk-1")?.[0]).toBe(0xbb);
  expect(chunks.get("vid-incompat/chunk-2")?.[0]).toBe(0xbb);
});

test("cancelling incompatible-partial cleanup clears stale checkpoint even if original source returns", async () => {
  const chunkBytes = 4 * 1024 * 1024;
  const totalBytes = 9 * 1024 * 1024;
  const bytesA = new Uint8Array(totalBytes).fill(0xaa);
  const shaA = sha256Bytes(bytesA);
  const shaB = "b".repeat(64);

  const macA = makeMac("mac-a", "Home", "192.168.1.10");
  const macB = makeMac("mac-b", "Office", "10.0.0.10");
  const offline = new Set<string>(["mac-a"]);
  const chunks = new Map<string, Uint8Array>();
  chunks.set("vid-revert/chunk-0", new Uint8Array(chunkBytes).fill(0xaa));

  let releaseRemoval: (() => void) | null = null;
  const macARanges: number[] = [];

  const files: MirrorFileStore = {
    async writeChunk(videoId, idx, bytes) {
      const key = `${videoId}/chunk-${idx}`;
      chunks.set(key, new Uint8Array(bytes));
      return key;
    },
    async readChunk(videoId, idx) {
      return chunks.get(`${videoId}/chunk-${idx}`) ?? null;
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
      await new Promise<void>((resolve) => {
        releaseRemoval = resolve;
      });
      for (const k of [...chunks.keys()]) {
        if (k.startsWith(`${videoId}/`)) chunks.delete(k);
      }
    },
  };

  let persisted: PersistedMobileData = {
    ...emptyPersistedData(),
    settings: { appearance: "system", language: "zh", backgroundSync: false },
    macs: [macA, macB],
    localItems: {
      "vid-revert": {
        videoId: "vid-revert",
        state: "partial",
        title: "Lesson vid-revert",
        thumbnailUrl: "",
        durationMs: 60_000,
        sizeBytes: totalBytes,
        contentSha256: shaA,
        downloadedBytes: chunkBytes,
        chunkSize: chunkBytes,
        completedChunks: 1,
        totalChunks: 3,
        mediaExt: "mp4",
        mimeType: "video/mp4",
        hasCaptions: false,
        localPath: "vid-revert/chunk-0",
        captionsPath: null,
        sourceMacId: macA.id,
        sourceShortName: macA.shortName,
        updatedAt: 1000,
      },
    },
  };

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary(mac) {
      if (offline.has(mac.id)) throw new MirrorApiError("unreachable", "offline");
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [makeItem("vid-revert", totalBytes, mac.id === "mac-a" ? shaA : shaB, 2000)],
      };
    },
    async fetchMediaRange(mac, _videoId, start, end) {
      if (mac.id === "mac-a") {
        macARanges.push(start);
        return bytesA.subarray(start, end + 1);
      }
      throw new Error("mac-b should not fetch after cancellation");
    },
    async fetchCaptions() {
      return null;
    },
    async reportStatus() {},
    async unpair() {},
  };

  const engine = createMirrorEngine({
    client,
    files,
    loadState: async () => persisted,
    saveState: async (d) => {
      persisted = d;
    },
    chunkBytes,
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  await engine.pollAllMacs();
  await wait(25);
  expect(releaseRemoval).not.toBe(null);

  // Cancel during Mac B's incompatible-partial cleanup, then switch availability back to Mac A.
  engine.setAppLifecycle("background");
  offline.add("mac-b");
  offline.delete("mac-a");
  engine.setAppLifecycle("active");
  await wait(25);
  expect(macARanges).toEqual([]);

  // Release cleanup: Mac A must re-download from chunk 0 (not skip deleted chunk 0).
  releaseRemoval!();
  await wait(60);

  expect(macARanges).toEqual([0, chunkBytes, chunkBytes * 2]);
  expect(engine.library()[0]?.status).toBe("ready");
  expect(chunks.get("vid-revert/chunk-0")?.[0]).toBe(0xaa);
  expect(chunks.get("vid-revert/chunk-1")?.[0]).toBe(0xaa);
  expect(chunks.get("vid-revert/chunk-2")?.[0]).toBe(0xaa);
});

test("cancelled transfer mid-writeChunk cannot publish stale checkpoint or race replacement write", async () => {
  const chunkBytes = 4 * 1024 * 1024;
  const totalBytes = 9 * 1024 * 1024;
  const bytes1 = new Uint8Array(totalBytes).fill(0x11);
  const bytes2 = new Uint8Array(totalBytes).fill(0x22);
  const sha1 = sha256Bytes(bytes1);
  const sha2 = sha256Bytes(bytes2);

  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const chunks = new Map<string, Uint8Array>();
  let currentSha = sha1;
  let releaseFirstWrite: (() => void) | null = null;
  let writeCount = 0;

  const files: MirrorFileStore = {
    async writeChunk(videoId, idx, bytes) {
      writeCount += 1;
      if (writeCount === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      }
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
      for (const k of [...chunks.keys()]) {
        if (k.startsWith(`${videoId}/`)) chunks.delete(k);
      }
    },
  };

  let persisted: PersistedMobileData = {
    ...emptyPersistedData(),
    settings: { appearance: "system", language: "zh", backgroundSync: false },
    macs: [mac],
  };

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary() {
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [makeItem("vid-write-race", totalBytes, currentSha, 6000)],
      };
    },
    async fetchMediaRange(_mac, _videoId, start, end) {
      return (currentSha === sha1 ? bytes1 : bytes2).subarray(start, end + 1);
    },
    async fetchCaptions() {
      return null;
    },
    async reportStatus() {},
    async unpair() {},
  };

  const engine = createMirrorEngine({
    client,
    files,
    loadState: async () => persisted,
    saveState: async (d) => {
      persisted = d;
    },
    chunkBytes,
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  await engine.pollAllMacs();
  await wait(25);
  expect(releaseFirstWrite).not.toBe(null);

  // Cancel mid-write, switch digest to sha2, and resume foreground.
  engine.setAppLifecycle("background");
  currentSha = sha2;
  engine.setAppLifecycle("active");
  await wait(25);

  // Replacement transfer must wait for the in-flight write to settle before starting.
  expect(writeCount).toBe(1);

  releaseFirstWrite!();
  await wait(60);

  expect(engine.library()[0]?.status).toBe("ready");
  expect(engine.localItems()["vid-write-race"]?.contentSha256).toBe(sha2);
  expect(chunks.get("vid-write-race/chunk-0")?.[0]).toBe(0x22);
  expect(chunks.get("vid-write-race/chunk-1")?.[0]).toBe(0x22);
  expect(chunks.get("vid-write-race/chunk-2")?.[0]).toBe(0x22);
});
