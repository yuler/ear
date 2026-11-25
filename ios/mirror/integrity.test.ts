import { expect, test } from "nsh/test";
import {
  createHttpMirrorClient,
  MirrorApiError,
  parseContentRangeHeader,
  type MirrorApiClient,
} from "./client";
import {
  createMirrorEngine,
  MAX_CONSECUTIVE_TRANSFER_FAILURES,
} from "./engine";
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

function makeItem(
  videoId: string,
  sizeBytes: number,
  contentSha256?: string,
  updatedAt = 1000,
): RemoteCatalogItem {
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

function createMemoryStore() {
  const chunks = new Map<string, Uint8Array>();
  const direct = new Map<string, Uint8Array>();
  const files: MirrorFileStore = {
    async writeChunk(videoId, idx, bytes) {
      const key = `${videoId}/chunk-${idx}`;
      chunks.set(key, new Uint8Array(bytes));
      return key;
    },
    async writeDirectMedia(videoId, ext, bytes) {
      const key = `${videoId}/media.${ext}`;
      direct.set(key, new Uint8Array(bytes));
      return key;
    },
    async writeCaptions(videoId) {
      return `${videoId}/captions.json`;
    },
    async removeVideoFiles(videoId) {
      for (const k of [...chunks.keys()]) {
        if (k.startsWith(`${videoId}/`)) chunks.delete(k);
      }
      for (const k of [...direct.keys()]) {
        if (k.startsWith(`${videoId}/`)) direct.delete(k);
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
  return { files, chunks, direct, assembleChunks };
}

test("failover across Macs with equal-size different-content files discards partial chunks and verifies full bytes", async () => {
  // 9 MiB total (> 8 MiB single-file cap) split into 3 chunks: 4 MiB, 4 MiB, 1 MiB.
  const chunkBytes = 4 * 1024 * 1024;
  const totalBytes = 9 * 1024 * 1024;
  const fileA = new Uint8Array(totalBytes).fill(0xaa);
  const fileB = new Uint8Array(totalBytes).fill(0xbb);

  const macA = makeMac("mac-a", "Home", "192.168.1.10");
  const macB = makeMac("mac-b", "Office", "10.0.0.10");

  const offline = new Set<string>(["mac-b"]);
  let macAChunksServed = 0;
  const store = createMemoryStore();
  let persisted: PersistedMobileData = {
    ...emptyPersistedData(),
    macs: [macA, macB],
  };

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary(mac) {
      if (offline.has(mac.id)) throw new MirrorApiError("unreachable", "offline");
      const sha = mac.id === "mac-a" ? "a".repeat(64) : "b".repeat(64);
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [makeItem("vid-same-len", totalBytes, sha, 2000)],
      };
    },
    async fetchMediaRange(mac, _videoId, start, end) {
      if (mac.id === "mac-a") {
        macAChunksServed += 1;
        if (macAChunksServed === 1) {
          return fileA.subarray(start, end + 1);
        }
        offline.add("mac-a");
        throw new MirrorApiError("unreachable", "mac-a went offline");
      }
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
  await wait(40);

  // Mac A wrote chunk 0 (0xAA) and then went offline before chunk 1.
  expect(engine.localItems()["vid-same-len"]?.state).toBe("partial");
  expect(engine.localItems()["vid-same-len"]?.completedChunks).toBe(1);
  expect(store.chunks.get("vid-same-len/chunk-0")?.[0]).toBe(0xaa);

  // Fail over to Mac B which serves an equal-length file with different content (0xBB).
  offline.delete("mac-b");
  await engine.pollAllMacs();
  await wait(60);

  expect(engine.library()[0]?.status).toBe("ready");
  const full = store.assembleChunks("vid-same-len", 3);
  expect(full.byteLength).toBe(totalBytes);
  // Verify the entire byte stream is strictly Mac B's content (no stale 0xAA prefix from Mac A).
  expect(full[0]).toBe(0xbb);
  expect(full[chunkBytes - 1]).toBe(0xbb);
  expect(full[chunkBytes]).toBe(0xbb);
  expect(full[totalBytes - 1]).toBe(0xbb);
});

test("failover across Macs with identical contentSha256 resumes cleanly from completed chunk", async () => {
  const chunkBytes = 4 * 1024 * 1024;
  const totalBytes = 9 * 1024 * 1024;
  const sharedBytes = new Uint8Array(totalBytes);
  sharedBytes.fill(0x11, 0, chunkBytes);
  sharedBytes.fill(0x22, chunkBytes, chunkBytes * 2);
  sharedBytes.fill(0x33, chunkBytes * 2, totalBytes);
  const sharedSha = "c".repeat(64);

  const macA = makeMac("mac-a", "Home", "192.168.1.10");
  const macB = makeMac("mac-b", "Office", "10.0.0.10");
  const offline = new Set<string>(["mac-b"]);
  let macAChunks = 0;
  const macBRanges: number[] = [];
  const store = createMemoryStore();
  let persisted: PersistedMobileData = { ...emptyPersistedData(), macs: [macA, macB] };

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
        items: [makeItem("vid-identical", totalBytes, sharedSha, 2000)],
      };
    },
    async fetchMediaRange(mac, _videoId, start, end) {
      if (mac.id === "mac-a") {
        macAChunks += 1;
        if (macAChunks === 1) return sharedBytes.subarray(start, end + 1);
        offline.add("mac-a");
        throw new MirrorApiError("unreachable", "offline");
      }
      macBRanges.push(start);
      return sharedBytes.subarray(start, end + 1);
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
  await wait(40);
  expect(engine.localItems()["vid-identical"]?.completedChunks).toBe(1);

  offline.delete("mac-b");
  await engine.pollAllMacs();
  await wait(60);

  // Mac B resumed at chunk 1 (offset 4 MiB) without redownloading chunk 0.
  expect(macBRanges).toEqual([chunkBytes, chunkBytes * 2]);
  expect(engine.library()[0]?.status).toBe("ready");
  const full = store.assembleChunks("vid-identical", 3);
  expect(full[0]).toBe(0x11);
  expect(full[chunkBytes]).toBe(0x22);
  expect(full[chunkBytes * 2]).toBe(0x33);
});

test("short successful range response does not advance checkpoint or mark item ready", async () => {
  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const store = createMemoryStore();
  let persisted: PersistedMobileData = { ...emptyPersistedData(), macs: [mac] };
  let attempts = 0;

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary() {
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [makeItem("vid-short", 100, "d".repeat(64), 1000)],
      };
    },
    async fetchMediaRange() {
      attempts += 1;
      // Return only 50 bytes for a 100-byte range request.
      return new Uint8Array(50);
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
    now: () => 10_000,
    scheduleRetry: () => 1 as unknown as ReturnType<typeof setTimeout>,
    cancelRetry: () => {},
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  await engine.pollAllMacs();
  await wait(20);

  expect(attempts).toBe(1);
  expect(engine.library()[0]?.status).not.toBe("ready");
  expect(engine.localItems()["vid-short"]).toBe(undefined);
  expect(store.direct.size).toBe(0);
  expect(store.chunks.size).toBe(0);
});

test("HTTP client validates 206 status, Content-Range, ETag, and exact byte length", async () => {
  expect(parseContentRangeHeader("bytes 0-99/100")).toEqual({ start: 0, end: 99, total: 100 });
  expect(parseContentRangeHeader("bytes 0-99/*")).toBe(null);

  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const sha = "e".repeat(64);
  const originalFetch = globalThis.fetch;

  const mockResponse = (status: number, headers: Record<string, string>, bodyLen: number): Response =>
    ({
      status,
      ok: status >= 200 && status < 300,
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
      arrayBuffer: async () => new Uint8Array(bodyLen).buffer,
    }) as unknown as Response;

  try {
    const httpClient = createHttpMirrorClient();

    // 1. Unexpected 200 OK instead of 206 Partial Content -> rejected
    globalThis.fetch = async () =>
      mockResponse(200, { "content-range": "bytes 0-99/100", etag: `"sha256:${sha}"` }, 100);
    let errCode = "";
    try {
      await httpClient.fetchMediaRange(mac, "vid-1", 0, 99, undefined, {
        expectedTotalBytes: 100,
        expectedContentSha256: sha,
      });
    } catch (e) {
      errCode = e instanceof MirrorApiError ? e.code : "";
    }
    expect(errCode).toBe("invalid_range_response");

    // 2. Short 206 response (clamped EOF 0-49/50 for 0-99) -> representation_changed
    globalThis.fetch = async () =>
      mockResponse(206, { "content-range": "bytes 0-49/50", etag: `"sha256:${sha}"` }, 50);
    errCode = "";
    try {
      await httpClient.fetchMediaRange(mac, "vid-1", 0, 99, undefined, {
        expectedTotalBytes: 100,
        expectedContentSha256: sha,
      });
    } catch (e) {
      errCode = e instanceof MirrorApiError ? e.code : "";
    }
    expect(errCode).toBe("representation_changed");

    // 3. Matching headers but truncated body (50 bytes for 0-99) -> invalid_range_response
    globalThis.fetch = async () =>
      mockResponse(206, { "content-range": "bytes 0-99/100", etag: `"sha256:${sha}"` }, 50);
    errCode = "";
    try {
      await httpClient.fetchMediaRange(mac, "vid-1", 0, 99, undefined, {
        expectedTotalBytes: 100,
        expectedContentSha256: sha,
      });
    } catch (e) {
      errCode = e instanceof MirrorApiError ? e.code : "";
    }
    expect(errCode).toBe("invalid_range_response");

    // 4. Exact valid 206 response -> succeeds
    globalThis.fetch = async () =>
      mockResponse(206, { "content-range": "bytes 0-99/100", etag: `"sha256:${sha}"` }, 100);
    const okBytes = await httpClient.fetchMediaRange(mac, "vid-1", 0, 99, undefined, {
      expectedTotalBytes: 100,
      expectedContentSha256: sha,
    });
    expect(okBytes.byteLength).toBe(100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("persistent transfer errors back off with bounded attempts and 404 drops stale catalog entry", async () => {
  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const store = createMemoryStore();
  let persisted: PersistedMobileData = { ...emptyPersistedData(), macs: [mac] };

  let fakeNow = 100_000;
  let nextTimerId = 1;
  const timers = new Map<number, { dueAt: number; fn: () => void }>();

  let attempts500 = 0;
  let attempts404 = 0;

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary() {
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [
          makeItem("vid-500", 500, "1".repeat(64), 2000),
          makeItem("vid-404", 500, "2".repeat(64), 1000),
        ],
      };
    },
    async fetchMediaRange(_mac, videoId) {
      if (videoId === "vid-404") {
        attempts404 += 1;
        throw new MirrorApiError("http_error", "Not Found", 404);
      }
      attempts500 += 1;
      throw new MirrorApiError("http_error", "Internal Server Error", 500);
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
    now: () => fakeNow,
    scheduleRetry: (fn, delayMs) => {
      const id = nextTimerId++;
      timers.set(id, { dueAt: fakeNow + delayMs, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancelRetry: (handle) => {
      timers.delete(handle as unknown as number);
    },
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  await engine.pollAllMacs();
  await wait(20);

  // Neither item enters a tight immediate-retry loop on the first tick.
  expect(attempts404).toBe(1);
  expect(attempts500).toBe(1);
  // Stale 404 item was dropped from the Mac's catalog immediately.
  expect((engine.catalogs()[mac.id] ?? []).some((x) => x.videoId === "vid-404")).toBe(false);
  // No 0-byte partial records were persisted for failing items.
  expect(Object.keys(engine.localItems())).toEqual([]);

  // Advance the fake clock generously through all scheduled backoff retries.
  for (let step = 0; step < 20 && timers.size > 0; step++) {
    const dueEntries = [...timers.entries()].sort((a, b) => a[1].dueAt - b[1].dueAt);
    const [id, entry] = dueEntries[0]!;
    timers.delete(id);
    fakeNow = entry.dueAt;
    entry.fn();
    await wait(10);
  }

  // Attempts remain strictly bounded at MAX_CONSECUTIVE_TRANSFER_FAILURES and then stop.
  expect(attempts500).toBe(MAX_CONSECUTIVE_TRANSFER_FAILURES);
  expect(attempts404).toBe(1);
  expect(timers.size).toBe(0);
});
