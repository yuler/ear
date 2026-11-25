import { expect, test } from "nsh/test";
import { normalizeEntry, pruneMissingPaths } from "./index";
import { backfillVideoDimensions, needsDimensionProbe } from "./probe";
import type { LibraryEntry } from "./types";
import {
  formatEta,
  formatSizeProgress,
  formatSpeed,
  MAX_AUDIO_WRITE_BYTES,
} from "./download";
import {
  archiveFile,
  defaultDownloadFolder,
  entryMetaFile,
  mediaRoot,
} from "./paths";

function sample(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    videoId: "dQw4w9WgXcQ",
    title: "demo",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    site: "YouTube",
    state: "ready",
    captionsPath: "/tmp/ear/library/dQw4w9WgXcQ/captions.json",
    audioPath: "/tmp/ear/library/dQw4w9WgXcQ/audio.m4a",
    videoPath: null,
    audioUrl: "https://example.com/a.m4a",
    videoUrl: null,
    audioMimeType: "audio/mp4",
    durationMs: 1000,
    note: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

test("pruneMissingPaths clears gone files, keeps present ones", () => {
  const present = new Set([
    "/tmp/ear/library/dQw4w9WgXcQ/captions.json",
  ]);
  const next = pruneMissingPaths(sample(), (p) => present.has(p));
  expect(next.captionsPath).toBe(
    "/tmp/ear/library/dQw4w9WgXcQ/captions.json",
  );
  expect(next.audioPath).toBe(null);
  expect(next.audioUrl).toBe("https://example.com/a.m4a");
  expect(next.updatedAt).not.toBe(1);
});

test("pruneMissingPaths is identity when all paths exist", () => {
  const entry = sample();
  const next = pruneMissingPaths(entry, () => true);
  expect(next).toBe(entry);
});

test("MAX_AUDIO_WRITE_BYTES matches nsh writeFile cap", () => {
  expect(MAX_AUDIO_WRITE_BYTES).toBe(8 * 1024 * 1024);
});

test("mediaRoot defaults to ~/Downloads and accepts override", () => {
  expect(mediaRoot(null)).toBe(defaultDownloadFolder());
  expect(mediaRoot("")).toBe(defaultDownloadFolder());
  expect(mediaRoot("  ")).toBe(defaultDownloadFolder());
  expect(mediaRoot("/tmp/ear-media")).toBe("/tmp/ear-media");
});

test("normalizeEntry fills defaults and marks ready when captions exist", () => {
  const entry = normalizeEntry({
    videoId: "abcdefghijk",
    title: "Hello",
    captionsPath: "/tmp/c.json",
  });
  expect(entry.site).toBe("YouTube");
  expect(entry.state).toBe("ready");
  expect(entry.url).toContain("abcdefghijk");
  expect(entry.thumbnailUrl).toBe(
    "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  );
  expect(entry.videoPath).toBe(null);
  expect(entry.note).toBe(null);
});

test("path helpers use per-entry json and archive.jsonl", () => {
  try {
    expect(entryMetaFile("abc").endsWith("abc.json")).toBe(true);
    expect(archiveFile().endsWith("archive.jsonl")).toBe(true);
  } catch (e) {
    expect(e instanceof Error && e.message.includes("dataDir")).toBe(true);
  }
});

test("Downbit download telemetry formatters format speed, ETA, and byte progress", () => {
  expect(formatSpeed(14.2 * 1024 * 1024)).toBe("14.2 MB/s");
  expect(formatSpeed(512 * 1024)).toBe("512 KB/s");
  expect(formatEta(7)).toBe("0:07 left");
  expect(formatEta(85)).toBe("1:25 left");
  expect(formatSizeProgress(10 * 1024 * 1024, 50 * 1024 * 1024)).toBe(
    "10.0 MB of 50.0 MB",
  );
});

test("openSystemPath and revealInFileManager guard empty and invalid targets", async () => {
  const { openFileParentFolder, openSystemPath, revealInFileManager } =
    await import("./paths");
  expect(await openSystemPath("")).toBe(false);
  expect(await revealInFileManager("")).toBe(false);
  expect(await openFileParentFolder("")).toBe(false);
});

test("normalizeEntry preserves positive videoWidth/videoHeight and drops invalid values", () => {
  const portrait = normalizeEntry({
    videoId: "portrait001",
    videoWidth: 720,
    videoHeight: 1280,
  });
  expect(portrait.videoWidth).toBe(720);
  expect(portrait.videoHeight).toBe(1280);

  const invalid = normalizeEntry({
    videoId: "invalid0001",
    videoWidth: 0,
    videoHeight: -10,
  });
  expect(invalid.videoWidth).toBe(null);
  expect(invalid.videoHeight).toBe(null);
});

test("backfillVideoDimensions probes only legacy local videos missing dimensions and persists once", async () => {
  const legacyPortrait = sample({
    videoId: "legacy-p",
    videoPath: "/downloads/legacy-p.mp4",
    audioPath: null,
    quality: "720p",
    videoWidth: null,
    videoHeight: null,
  });
  const alreadyKnown = sample({
    videoId: "known-l",
    videoPath: "/downloads/known-l.mp4",
    audioPath: null,
    quality: "1080p",
    videoWidth: 1920,
    videoHeight: 1080,
  });
  const audioOnly = sample({
    videoId: "audio-1",
    videoPath: null,
    audioPath: "/downloads/audio-1.m4a",
    quality: "Audio (M4A)",
  });

  expect(needsDimensionProbe(legacyPortrait)).toBe(true);
  expect(needsDimensionProbe(alreadyKnown)).toBe(false);
  expect(needsDimensionProbe(audioOnly)).toBe(false);

  const attempted = new Set<string>();
  const probedPaths: string[][] = [];
  const written: LibraryEntry[] = [];

  const updates = await backfillVideoDimensions(
    [legacyPortrait, alreadyKnown, audioOnly],
    attempted,
    {
      probe: async (paths) => {
        probedPaths.push([...paths]);
        return { "/downloads/legacy-p.mp4": { width: 720, height: 1280 } };
      },
      write: async (entry) => {
        written.push(entry);
      },
    },
  );

  expect(probedPaths).toEqual([["/downloads/legacy-p.mp4"]]);
  expect(updates).toEqual({ "legacy-p": { width: 720, height: 1280 } });
  expect(written.length).toBe(1);
  expect(written[0]?.videoWidth).toBe(720);
  expect(written[0]?.videoHeight).toBe(1280);
  expect(written[0]?.createdAt).toBe(legacyPortrait.createdAt);

  // Second pass skips already attempted videoIds
  const second = await backfillVideoDimensions(
    [legacyPortrait],
    attempted,
    {
      probe: async () => {
        throw new Error("should not probe twice");
      },
    },
  );
  expect(second).toEqual({});
});
