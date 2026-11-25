import { expect, test } from "nsh/test";
import { createHttpMirrorClient, MirrorApiError, type MirrorApiClient } from "./client";
import { createMirrorEngine } from "./engine";
import { Sha256, sha256Bytes } from "./sha256";
import { createDiskFileStore, emptyPersistedData, safeVideoDir, type MirrorFileStore } from "./storage";
import { createLanTransport, parseHostAndPort, parsePairUrl } from "./transport";
import type { PairedMac, PersistedMobileData } from "./types";
import {
  isSafeMediaExt,
  isSafeVideoId,
  isValidLanHost,
  MAX_CAPTIONS_BYTES,
  sanitizeThumbnailUrl,
  validateCatalogResponse,
  validatePairResponse,
} from "./validation";

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

test("storage and validation reject path traversal, unsafe mediaExt, and prototype keys", async () => {
  expect(isSafeVideoId("abc123_-XYZ")).toBe(true);
  for (const bad of ["..", "../escape", "a/b", "a\\b", "", "index", "__proto__", "constructor", "toString"]) {
    expect(isSafeVideoId(bad)).toBe(false);
    expect(() => safeVideoDir("/sandbox/mirror", bad)).toThrow();
  }

  expect(isSafeMediaExt("mp4")).toBe(true);
  expect(isSafeMediaExt("m4a")).toBe(true);
  for (const badExt of ["../evil", "mp4/../../x", "sh", "exe", ""]) {
    expect(isSafeMediaExt(badExt)).toBe(false);
  }

  const disk = createDiskFileStore();
  let rejectedWrite = false;
  try {
    await disk.writeDirectMedia("..", "mp4", new Uint8Array([1, 2, 3]));
  } catch {
    rejectedWrite = true;
  }
  expect(rejectedWrite).toBe(true);

  let rejectedExt = false;
  try {
    await disk.writeDirectMedia("valid_vid", "../escape", new Uint8Array([1, 2, 3]));
  } catch {
    rejectedExt = true;
  }
  expect(rejectedExt).toBe(true);

  let rejectedRemove = false;
  try {
    await disk.removeVideoFiles("..");
  } catch {
    rejectedRemove = true;
  }
  expect(rejectedRemove).toBe(true);
});

test("LAN host and pair URL parsers block URL injection, authority smuggling, and SSRF paths", () => {
  expect(isValidLanHost("192.168.1.42")).toBe(true);
  expect(isValidLanHost("macbook.local")).toBe(true);
  expect(isValidLanHost("[::1]")).toBe(true);

  for (const bad of [
    "192.168.1.1/admin#",
    "192.168.1.1#frag",
    "192.168.1.1?foo=bar",
    "user@192.168.1.1",
    "192.168.1.999",
    "192.168.1.1:8080",
    "bad host",
    "",
  ]) {
    expect(isValidLanHost(bad)).toBe(false);
    expect(() => createLanTransport(bad, 7890)).toThrow();
  }

  // Encoded '#' or '@' in ear://pair host must be rejected.
  expect(parsePairUrl("ear://pair?host=192.168.1.1%2Fadmin%23&port=7890&code=1234")).toBe(null);
  expect(parsePairUrl("ear://pair?host=evil%40192.168.1.1&port=7890&code=1234")).toBe(null);
  expect(parsePairUrl("ear://pair?host=192.168.1.42&port=7890&code=1234")?.host).toBe("192.168.1.42");

  expect(parseHostAndPort("192.168.1.1/admin#foo")).toBe(null);
  expect(parseHostAndPort("user@192.168.1.1:7890")).toBe(null);
  expect(parseHostAndPort("[::1]:7890")).toEqual({ host: "[::1]", port: 7890 });
});

test("catalog and pair response validators sanitize thumbnails and drop unsafe entries", () => {
  expect(sanitizeThumbnailUrl("https://i.ytimg.com/vi/abc123/hqdefault.jpg")).toBe(
    "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  );
  expect(sanitizeThumbnailUrl("http://192.168.1.1/router-reboot")).toBe("");
  expect(sanitizeThumbnailUrl("https://evil.example/tracker.png")).toBe("");
  expect(sanitizeThumbnailUrl("https://user@i.ytimg.com/vi/abc/hqdefault.jpg")).toBe("");

  const catalog = validateCatalogResponse({
    serverId: "srv-1",
    serverName: "Home Mac",
    shortName: "Home",
    items: [
      { videoId: "..", title: "Escape", mediaExt: "mp4", sizeBytes: 100 },
      { videoId: "constructor", title: "Proto", mediaExt: "mp4", sizeBytes: 100 },
      { videoId: "good1", title: "Bad Ext", mediaExt: "../sh", sizeBytes: 100 },
      { videoId: "good2", title: "Negative", mediaExt: "mp4", sizeBytes: -5 },
      {
        videoId: "good3",
        title: "Valid Video",
        thumbnailUrl: "http://127.0.0.1:9000/ssrf",
        mediaExt: "mp4",
        mimeType: "video/mp4",
        sizeBytes: 512,
        updatedAt: 1000,
      },
    ],
  });
  expect(catalog?.items.length).toBe(1);
  expect(catalog?.items[0]?.videoId).toBe("good3");
  expect(catalog?.items[0]?.thumbnailUrl).toBe("");

  expect(validatePairResponse({ serverId: "", deviceId: "d", token: "short" })).toBe(null);
});

test("SHA-256 matches NIST vectors and rejects tampered downloaded media despite matching ETag", async () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  expect(sha256Bytes(new Uint8Array(0))).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  expect(sha256Bytes(enc("abc"))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  expect(new Sha256().update(enc("ab")).update(enc("c")).digestHex()).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );

  // Tampered single-file payload whose contentSha256 doesn't match actual bytes must NOT become ready.
  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const expectedBytes = new Uint8Array(256).fill(0x11);
  const tamperedBytes = new Uint8Array(256).fill(0x99);
  const expectedSha = sha256Bytes(expectedBytes);
  const written = new Map<string, Uint8Array>();

  const files: MirrorFileStore = {
    async writeChunk(v, i, b) {
      written.set(`${v}/chunk-${i}`, new Uint8Array(b));
      return `${v}/chunk-${i}`;
    },
    async writeDirectMedia(v, ext, b) {
      written.set(`${v}/media.${ext}`, new Uint8Array(b));
      return `${v}/media.${ext}`;
    },
    async writeCaptions(v) {
      return `${v}/captions.json`;
    },
    async removeVideoFiles(v) {
      for (const k of [...written.keys()]) {
        if (k.startsWith(`${v}/`)) written.delete(k);
      }
    },
  };

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
        items: [
          {
            videoId: "vid-tampered",
            title: "Tampered",
            thumbnailUrl: "",
            durationMs: 1000,
            sizeBytes: 256,
            contentSha256: expectedSha,
            quality: "720p",
            mediaExt: "mp4",
            mimeType: "video/mp4",
            hasCaptions: false,
            updatedAt: 1000,
          },
        ],
      };
    },
    async fetchMediaRange() {
      return tamperedBytes;
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
    scheduleRetry: () => 1 as unknown as ReturnType<typeof setTimeout>,
    cancelRetry: () => {},
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  await engine.pollAllMacs();
  await wait(30);

  expect(engine.library()[0]?.status).not.toBe("ready");
  expect(engine.localItems()["vid-tampered"]).toBe(undefined);
  expect(written.size).toBe(0);
});

test("HTTP client rejects mismatched Content-Length on range and oversized captions", async () => {
  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  const originalFetch = globalThis.fetch;
  const mockResponse = (status: number, headers: Record<string, string>, bodyLen: number): Response =>
    ({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      arrayBuffer: async () => new Uint8Array(bodyLen).buffer,
      text: async () => "x".repeat(bodyLen),
    }) as unknown as Response;

  try {
    const httpClient = createHttpMirrorClient();
    globalThis.fetch = async () =>
      mockResponse(206, { "content-range": "bytes 0-99/100", "content-length": "9999" }, 100);
    let errCode = "";
    try {
      await httpClient.fetchMediaRange(mac, "vid-1", 0, 99, undefined, { expectedTotalBytes: 100 });
    } catch (e) {
      errCode = e instanceof MirrorApiError ? e.code : "";
    }
    expect(errCode).toBe("invalid_range_response");

    // Oversized captions header (> MAX_CAPTIONS_BYTES) is dropped safely without reading huge body.
    globalThis.fetch = async () =>
      mockResponse(200, { "content-length": String(MAX_CAPTIONS_BYTES + 1) }, 10);
    const cap = await httpClient.fetchCaptions(mac, "vid-1");
    expect(cap).toBe(null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unpairMac concurrent with in-flight pollAllMacs does not resurrect unpaired Mac", async () => {
  const mac = makeMac("mac-a", "Home", "192.168.1.10");
  let releasePoll: (() => void) | null = null;
  let persisted: PersistedMobileData = { ...emptyPersistedData(), macs: [mac] };

  const client: MirrorApiClient = {
    async pair() {
      throw new Error("unused");
    },
    async fetchLibrary() {
      await new Promise<void>((resolve) => {
        releasePoll = resolve;
      });
      return {
        serverId: mac.id,
        serverName: mac.name,
        shortName: mac.shortName,
        items: [],
      };
    },
    async fetchMediaRange() {
      return new Uint8Array(0);
    },
    async fetchCaptions() {
      return null;
    },
    async reportStatus() {},
    async unpair() {},
  };

  const files: MirrorFileStore = {
    async writeChunk() {
      return "";
    },
    async writeDirectMedia() {
      return "";
    },
    async writeCaptions() {
      return "";
    },
    async removeVideoFiles() {},
  };

  const engine = createMirrorEngine({
    client,
    files,
    loadState: async () => persisted,
    saveState: async (d) => {
      persisted = d;
    },
    applyColorScheme: () => {},
  });

  await engine.hydrate();
  const pollPromise = engine.pollAllMacs();
  await wait(10);
  await engine.unpairMac(mac.id);
  releasePoll!();
  await pollPromise;

  expect(engine.macs().length).toBe(0);
  expect(engine.onlineMacIds()).toEqual([]);
  expect(engine.catalogs()[mac.id]).toBe(undefined);
});
