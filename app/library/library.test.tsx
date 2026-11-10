import { expect, test } from "nsh/test";
import { normalizeEntry, pruneMissingPaths } from "./index";
import type { LibraryEntry } from "./types";
import { MAX_AUDIO_WRITE_BYTES } from "./download";
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
