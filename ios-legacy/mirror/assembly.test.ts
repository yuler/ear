import { expect, test } from "nsh/test";
import { MirrorApiError, type MirrorApiClient } from "./client";
import { createMirrorEngine } from "./engine";
import { computeOfflineStorageSummary, isChunkedLocalPath } from "./selectors";
import { sha256Bytes } from "./sha256";
import { emptyPersistedData, type MirrorFileStore } from "./storage";
import { diagnosePairUrl } from "./transport";
import type { PairedMac, PersistedMobileData, RemoteCatalogItem } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeMac(): PairedMac {
  return {
    id: "mac-1",
    name: "Studio Mac",
    shortName: "Studio",
    transport: "lan",
    host: "192.168.1.42",
    port: 32783,
    token: "tok-1234567890abcdef",
    deviceId: "iphone-1",
    pairedAt: 1,
    lastSyncedAt: null,
  };
}

test("chunked (> 8 MiB) transfers assemble into a single playable media file", async () => {
  const chunkBytes = 4 * 1024 * 1024;
  const totalBytes = 9 * 1024 * 1024;
  const fullBytes = new Uint8Array(totalBytes).fill(0x5a);
  const sha = sha256Bytes(fullBytes);

  const chunks = new Map<string, Uint8Array>();
  const assembled = new Map<string, Uint8Array>();
  let assembleCalls = 0;

  const files: MirrorFileStore = {
    async writeChunk(videoId, idx, bytes) {
      const path = `/sandbox/mirror/${videoId}/chunks/${String(idx).padStart(4, "0")}.part`;
      chunks.set(`${videoId}:${idx}`, new Uint8Array(bytes));
      return path;
    },
    async readChunk(videoId, idx) {
      return chunks.get(`${videoId}:${idx}`) ?? null;
    },
    async assembleChunks(videoId, ext, count) {
      assembleCalls += 1;
      const out = new Uint8Array(totalBytes);
      let offset = 0;
      for (let i = 0; i < count; i++) {
        const part = chunks.get(`${videoId}:${i}`);
        if (!part) throw new Error(`Missing chunk ${i}`);
        out.set(part, offset);
        offset += part.byteLength;
      }
      const outPath = `/sandbox/mirror/${videoId}/media.${ext}`;
      assembled.set(outPath, out);
      return outPath;
    },
    async writeDirectMedia(videoId, ext, bytes) {
      const outPath = `/sandbox/mirror/${videoId}/media.${ext}`;
      assembled.set(outPath, new Uint8Array(bytes));
      return outPath;
    },
    async writeCaptions(videoId) {
      return `/sandbox/mirror/${videoId}/captions.json`;
    },
    async removeVideoFiles() {},
  };

  const mac = makeMac();
  const item: RemoteCatalogItem = {
    videoId: "vid-large",
    title: "Large Offline Video",
    thumbnailUrl: "https://i.ytimg.com/vi/vid-large/hqdefault.jpg",
    durationMs: 120_000,
    sizeBytes: totalBytes,
    contentSha256: sha,
    quality: "720p",
    mediaExt: "mp4",
    mimeType: "video/mp4",
    hasCaptions: true,
    updatedAt: 2000,
  };

  let persisted: PersistedMobileData = { ...emptyPersistedData(), macs: [mac] };
  const client: MirrorApiClient = {
    async pair() {
      throw new MirrorApiError("unreachable", "unused");
    },
    async fetchLibrary() {
      return { serverId: mac.id, serverName: mac.name, shortName: mac.shortName, items: [item] };
    },
    async fetchMediaRange(_m, _v, start, end) {
      return fullBytes.subarray(start, end + 1);
    },
    async fetchCaptions() {
      return JSON.stringify({ cues: [{ startMs: 0, endMs: 1500, text: "Hello." }] });
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
  await wait(80);

  expect(assembleCalls).toBe(1);
  const view = engine.library()[0]!;
  expect(view.status).toBe("ready");
  expect(view.localPath).toBe("/sandbox/mirror/vid-large/media.mp4");
  expect(view.isChunkedUnmerged).toBe(false);
  expect(assembled.get("/sandbox/mirror/vid-large/media.mp4")?.byteLength).toBe(totalBytes);
});

test("hydrate & ensurePlayablePath auto-migrate legacy chunked ready records", async () => {
  let assembleArgs: { videoId: string; ext: string; count: number } | null = null;
  const files: MirrorFileStore = {
    async writeChunk() {
      return "";
    },
    async assembleChunks(videoId, ext, count) {
      assembleArgs = { videoId, ext, count };
      return `/sandbox/mirror/${videoId}/media.${ext}`;
    },
    async writeDirectMedia() {
      return "";
    },
    async writeCaptions() {
      return "";
    },
    async removeVideoFiles() {},
  };

  let persisted: PersistedMobileData = {
    ...emptyPersistedData(),
    localItems: {
      "vid-legacy": {
        videoId: "vid-legacy",
        state: "ready",
        title: "Legacy 17MB Video",
        thumbnailUrl: "",
        durationMs: 117_000,
        sizeBytes: 17 * 1024 * 1024,
        downloadedBytes: 17 * 1024 * 1024,
        chunkSize: 4 * 1024 * 1024,
        completedChunks: 5,
        totalChunks: 5,
        mediaExt: "mp4",
        mimeType: "video/mp4",
        hasCaptions: true,
        localPath: "/sandbox/mirror/vid-legacy/chunks/0004.part",
        captionsPath: "/sandbox/mirror/vid-legacy/captions.json",
        sourceMacId: "mac-1",
        sourceShortName: "yule-omarchy",
        updatedAt: 1000,
      },
    },
  };

  expect(isChunkedLocalPath(persisted.localItems["vid-legacy"]!.localPath)).toBe(true);
  expect(computeOfflineStorageSummary(persisted.localItems)).toEqual({
    readyCount: 1,
    totalBytes: 17 * 1024 * 1024,
    chunkedCount: 1,
  });

  const engine = createMirrorEngine({
    client: {
      async pair() {
        throw new Error("unused");
      },
      async fetchLibrary() {
        throw new Error("unused");
      },
      async fetchMediaRange() {
        throw new Error("unused");
      },
      async fetchCaptions() {
        return null;
      },
      async reportStatus() {},
      async unpair() {},
    },
    files,
    loadState: async () => persisted,
    saveState: async (d) => {
      persisted = d;
    },
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  const playable = await engine.ensurePlayablePath("vid-legacy");
  expect(playable).toBe("/sandbox/mirror/vid-legacy/media.mp4");
  expect(assembleArgs).toEqual({ videoId: "vid-legacy", ext: "mp4", count: 5 });
  expect(engine.localItems()["vid-legacy"]?.localPath).toBe(
    "/sandbox/mirror/vid-legacy/media.mp4",
  );
  expect(computeOfflineStorageSummary(engine.localItems()).chunkedCount).toBe(0);
});

test("diagnosePairUrl distinguishes non-Ear QR codes from malformed Ear pairing URLs", () => {
  expect(diagnosePairUrl("https://example.com/hello")).toEqual({
    ok: false,
    reason: "not_ear_url",
  });
  expect(diagnosePairUrl("ear://pair?transport=lan&port=32783&code=1234")).toEqual({
    ok: false,
    reason: "missing_host",
  });
  expect(diagnosePairUrl("ear://pair?transport=lan&host=192.168.1.2&port=32783&code=12")).toEqual({
    ok: false,
    reason: "invalid_code",
  });
  expect(
    diagnosePairUrl("ear://pair?transport=lan&host=192.168.1.2&port=32783&code=1234").ok,
  ).toBe(true);
});
