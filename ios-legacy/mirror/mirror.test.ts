import { expect, test } from "nsh/test";
import { MirrorApiError, type MirrorApiClient } from "./client";
import { createMirrorEngine, MAX_PARALLEL_TRANSFERS } from "./engine";
import { emptyPersistedData, type MirrorFileStore } from "./storage";
import {
  buildPairUrl,
  createTransport,
  parseHostAndPort,
  parsePairUrl,
} from "./transport";
import type { PairedMac, PersistedMobileData, RemoteCatalogItem } from "./types";

function makeItem(
  videoId: string,
  title: string,
  sizeBytes = 1000,
  updatedAt = 1000,
): RemoteCatalogItem {
  return {
    videoId,
    title,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationMs: 120_000,
    sizeBytes,
    quality: "360p",
    mediaExt: "mp4",
    mimeType: "video/mp4",
    hasCaptions: true,
    updatedAt,
  };
}

function makeFakeEnv(options?: {
  catalogsByMac?: Record<string, RemoteCatalogItem[]>;
  offlineMacs?: Set<string>;
  revokedMacs?: Set<string>;
  chunkDelayMs?: number;
  failWrite?: boolean;
}) {
  const catalogsByMac = options?.catalogsByMac ?? {};
  const offlineMacs = options?.offlineMacs ?? new Set<string>();
  const revokedMacs = options?.revokedMacs ?? new Set<string>();
  let persisted: PersistedMobileData = emptyPersistedData();
  const writtenFiles = new Map<string, number>();
  const rangeCalls: Array<{ macId: string; videoId: string; start: number; end: number }> = [];
  let maxConcurrent = 0;
  let currentConcurrent = 0;
  let failWrite = options?.failWrite ?? false;

  const client: MirrorApiClient = {
    async pair(host, _port, code) {
      if (code === "9999") {
        throw new MirrorApiError("code_expired", "expired", 401);
      }
      if (code !== "1234") {
        throw new MirrorApiError("invalid_code", "wrong", 401);
      }
      const isOffice = host.startsWith("10.");
      return {
        serverId: isOffice ? "mac-office" : "mac-home",
        serverName: isOffice ? "公司 iMac" : "家里 MacBook Pro",
        shortName: isOffice ? "公司" : "家里",
        deviceId: "dev-ios-1",
        token: isOffice ? "tok-office" : "tok-home",
        transport: "lan",
      };
    },
    async fetchLibrary(mac) {
      if (revokedMacs.has(mac.id)) {
        throw new MirrorApiError("unpaired", "unpaired", 401);
      }
      if (offlineMacs.has(mac.id)) {
        throw new MirrorApiError("unreachable", "offline");
      }
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: catalogsByMac[mac.id] ?? [],
      };
    },
    async fetchMediaRange(mac, videoId, start, end, signal) {
      if (revokedMacs.has(mac.id)) {
        throw new MirrorApiError("unpaired", "unpaired", 401);
      }
      if (offlineMacs.has(mac.id)) {
        throw new MirrorApiError("unreachable", "offline");
      }
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
      rangeCalls.push({ macId: mac.id, videoId, start, end });
      try {
        if (options?.chunkDelayMs) {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, options.chunkDelayMs);
            signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(new Error("aborted"));
            });
          });
        }
        return new Uint8Array(end - start + 1);
      } finally {
        currentConcurrent--;
      }
    },
    async fetchCaptions() {
      return JSON.stringify({ cues: [] });
    },
    async reportStatus() {},
    async unpair() {},
  };

  const files: MirrorFileStore = {
    async writeChunk(videoId, idx, bytes) {
      if (failWrite) throw new Error("ENOSPC: no space left on device");
      const key = `${videoId}/chunk-${idx}`;
      writtenFiles.set(key, bytes.byteLength);
      return key;
    },
    async writeDirectMedia(videoId, ext, bytes) {
      if (failWrite) throw new Error("ENOSPC: no space left on device");
      const key = `${videoId}/media.${ext}`;
      writtenFiles.set(key, bytes.byteLength);
      return key;
    },
    async writeCaptions(videoId, json) {
      const key = `${videoId}/captions.json`;
      writtenFiles.set(key, json.length);
      return key;
    },
    async removeVideoFiles(videoId) {
      for (const k of [...writtenFiles.keys()]) {
        if (k.startsWith(`${videoId}/`)) writtenFiles.delete(k);
      }
    },
  };

  return {
    client,
    files,
    rangeCalls,
    writtenFiles,
    getMaxConcurrent: () => maxConcurrent,
    setFailWrite: (v: boolean) => {
      failWrite = v;
    },
    getPersisted: () => persisted,
    loadState: async () => persisted,
    saveState: async (d: PersistedMobileData) => {
      persisted = d;
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(pred: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) return;
    await wait(10);
  }
}

test("parsePairUrl and parseHostAndPort parse valid LAN targets and reject invalid inputs", () => {
  const url = buildPairUrl({
    transport: "lan",
    host: "192.168.1.42",
    port: 7890,
    code: "4821",
    name: "家里 MacBook Pro",
  });
  const parsed = parsePairUrl(url);
  expect(parsed?.host).toBe("192.168.1.42");
  expect(parsed?.port).toBe(7890);
  expect(parsed?.code).toBe("4821");
  expect(parsed?.name).toBe("家里 MacBook Pro");
  expect(parsePairUrl("https://example.com")).toBe(null);
  expect(parsePairUrl("ear://pair?host=192.168.1.42&code=abc")).toBe(null);

  expect(parseHostAndPort("192.168.1.42")).toEqual({ host: "192.168.1.42", port: 32783 });
  expect(parseHostAndPort("http://10.0.8.15:9000/")).toEqual({ host: "10.0.8.15", port: 9000 });
  expect(parseHostAndPort("192.168.1.42:99999")).toBe(null);

  expect(createTransport("lan", "192.168.1.42", 7890).baseUrl()).toBe("http://192.168.1.42:7890");
  expect(() => createTransport("relay", "relay.example.com", 443)).toThrow();
});

test("pairs multiple Macs, deduplicates by videoId, and caps parallel transfers at 3", async () => {
  const shared = makeItem("vid-shared", "Shared Lesson", 500, 5000);
  const env = makeFakeEnv({
    catalogsByMac: {
      "mac-home": [
        shared,
        makeItem("vid-h1", "Home 1", 500, 4000),
        makeItem("vid-h2", "Home 2", 500, 3000),
      ],
      "mac-office": [
        shared,
        makeItem("vid-o1", "Office 1", 500, 2000),
        makeItem("vid-o2", "Office 2", 500, 1000),
      ],
    },
    chunkDelayMs: 25,
  });

  const engine = createMirrorEngine({
    client: env.client,
    files: env.files,
    loadState: env.loadState,
    saveState: env.saveState,
    applyColorScheme: () => {},
  });

  await engine.pairManual("192.168.1.42:7890", "1234");
  await engine.pairManual("10.0.8.15:7890", "1234");
  await waitUntil(() => engine.stats().ready === 5 && engine.stats().complete);

  const lib = engine.library();
  expect(lib.length).toBe(5);
  const deduped = lib.find((x) => x.videoId === "vid-shared");
  expect(deduped?.sources.map((s) => s.shortName)).toEqual(["家里", "公司"]);
  expect(env.getMaxConcurrent()).toBeLessThanOrEqual(MAX_PARALLEL_TRANSFERS);
  expect(engine.stats().ready).toBe(5);
  expect(engine.stats().complete).toBe(true);
});

test("deleteLocal removes local copy with undo restore and mirrorAgain recovery", async () => {
  const env = makeFakeEnv({
    catalogsByMac: {
      "mac-home": [makeItem("vid-1", "Lesson One", 400, 2000)],
    },
  });
  const engine = createMirrorEngine({
    client: env.client,
    files: env.files,
    loadState: env.loadState,
    saveState: env.saveState,
    applyColorScheme: () => {},
  });

  await engine.pairManual("192.168.1.42", "1234");
  await wait(40);
  expect(engine.library()[0]?.status).toBe("ready");

  // Delete then undo immediately -> restored as ready
  const before = engine.deleteLocal("vid-1");
  expect(engine.library()[0]?.status).toBe("removed");
  engine.restoreLocal("vid-1", before);
  expect(engine.library()[0]?.status).toBe("ready");

  // Delete permanently, then mirrorAgain re-downloads
  engine.deleteLocal("vid-1");
  await engine.commitDeleteFiles("vid-1");
  expect(engine.library()[0]?.status).toBe("removed");

  engine.mirrorAgain("vid-1");
  await wait(40);
  expect(engine.library()[0]?.status).toBe("ready");
});

test("preserves local ready copies when computer deletes video or revokes pairing", async () => {
  const catalogsByMac: Record<string, RemoteCatalogItem[]> = {
    "mac-home": [makeItem("vid-keep", "Keep Offline", 300, 2000)],
  };
  const revokedMacs = new Set<string>();
  const env = makeFakeEnv({ catalogsByMac, revokedMacs });

  const engine = createMirrorEngine({
    client: env.client,
    files: env.files,
    loadState: env.loadState,
    saveState: env.saveState,
    applyColorScheme: () => {},
  });

  await engine.pairManual("192.168.1.42", "1234");
  await wait(40);
  expect(engine.library()[0]?.status).toBe("ready");

  // Computer deletes video from its library -> phone keeps ready copy
  catalogsByMac["mac-home"] = [];
  await engine.pollAllMacs();
  expect(engine.library().length).toBe(1);
  expect(engine.library()[0]?.status).toBe("ready");

  // Computer revokes device token -> Mac unpaired, notice raised, local ready copy still stays
  revokedMacs.add("mac-home");
  await engine.pollAllMacs();
  expect(engine.macs().length).toBe(0);
  expect(engine.lastNotice()?.kind).toBe("removedByPc");
  expect(engine.library().length).toBe(1);
  expect(engine.library()[0]?.status).toBe("ready");
});

test("pauses on storage write failure and resumes chunked Range transfer cleanly", async () => {
  // 10 MiB item triggers multi-chunk Range download (exceeds 8 MiB single-file cap).
  const tenMiB = 10 * 1024 * 1024;
  const env = makeFakeEnv({
    catalogsByMac: {
      "mac-home": [makeItem("vid-large", "Large Lesson", tenMiB, 3000)],
    },
    failWrite: true,
  });
  const engine = createMirrorEngine({
    client: env.client,
    files: env.files,
    loadState: env.loadState,
    saveState: env.saveState,
    chunkBytes: 4 * 1024 * 1024,
    applyColorScheme: () => {},
  });

  await engine.pairManual("192.168.1.42", "1234");
  await wait(40);
  expect(engine.storagePaused()).not.toBe(null);
  expect(engine.library()[0]?.status).not.toBe("ready");

  // Free disk space & resume -> completes all 3 chunks (4+4+2 MiB)
  env.setFailWrite(false);
  engine.resumeAfterStorageError();
  await wait(60);
  expect(engine.storagePaused()).toBe(null);
  expect(engine.library()[0]?.status).toBe("ready");
  expect(env.rangeCalls.some((c) => c.start === 8 * 1024 * 1024)).toBe(true);
});

test("backgroundSync=false pauses transfers when entering background", async () => {
  const mac: PairedMac = {
    id: "mac-home",
    name: "家里 MacBook Pro",
    shortName: "家里",
    transport: "lan",
    host: "192.168.1.42",
    port: 7890,
    token: "tok-home",
    deviceId: "dev-1",
    pairedAt: 1,
    lastSyncedAt: null,
  };
  const env = makeFakeEnv({
    catalogsByMac: {
      "mac-home": [makeItem("vid-bg", "BG Video", 500, 1000)],
    },
    chunkDelayMs: 60,
  });
  const engine = createMirrorEngine({
    client: env.client,
    files: env.files,
    loadState: async () => ({
      ...emptyPersistedData(),
      settings: { appearance: "system", accent: "blue", language: "zh", backgroundSync: false },
      macs: [mac],
    }),
    saveState: env.saveState,
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  engine.setAppLifecycle("background");
  await engine.pollAllMacs();
  expect(engine.activeVideoIds().length).toBe(0);
  expect(engine.isMacOnline("mac-home")).toBe(false);

  engine.setAppLifecycle("active");
  await wait(120);
  expect(engine.library()[0]?.status).toBe("ready");
});
