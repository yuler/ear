import { expect, test } from "nsh/test";
import { pruneMissingPaths } from "./index";
import type { LibraryEntry } from "./types";
import { MAX_AUDIO_WRITE_BYTES } from "./download";

function sample(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    videoId: "dQw4w9WgXcQ",
    title: "demo",
    captionsPath: "/tmp/ear/library/dQw4w9WgXcQ/captions.json",
    audioPath: "/tmp/ear/library/dQw4w9WgXcQ/audio.m4a",
    audioUrl: "https://example.com/a.m4a",
    audioMimeType: "audio/mp4",
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
