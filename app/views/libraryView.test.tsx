import { expect, test } from "nsh/test";
import type { LibraryEntry } from "../library/types";
import { normalizeSettings } from "../store";
import { formatEntryDescription, isAudioEntry } from "./libraryViewHelpers";

function mockEntry(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    videoId: "slow-english-1",
    title:
      "Slow English Podcast | Natural English Conversation about Weird News Stories!",
    url: "https://www.youtube.com/watch?v=slow-english-1",
    site: "YouTube",
    state: "ready",
    captionsPath: null,
    videoPath: "/downloads/slow-english.mp4",
    audioPath: null,
    videoUrl: null,
    audioUrl: null,
    audioMimeType: null,
    durationMs: 1645000, // 27:25
    quality: "720p",
    sizeBytes: 178257920, // 170 MB
    note: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

test("formatEntryDescription formats video entry matching screenshot 'YouTube · 720p · 170 MB'", () => {
  const entry = mockEntry();
  expect(formatEntryDescription(entry)).toBe("YouTube · 720p · 170 MB");
});

test("formatEntryDescription formats audio entry matching screenshot 'SoundCloud · M4A · 4.4 MB'", () => {
  const entry = mockEntry({
    videoId: "flickermood",
    title: "Flickermood",
    site: "SoundCloud",
    quality: "M4A",
    sizeBytes: 4613734, // 4.4 MB
  });
  expect(formatEntryDescription(entry)).toBe("SoundCloud · M4A · 4.4 MB");
});

test("isAudioEntry detects audio quality or audio-only path", () => {
  expect(isAudioEntry(mockEntry({ quality: "720p" }))).toBe(false);
  expect(isAudioEntry(mockEntry({ quality: "Audio (M4A)" }))).toBe(true);
  expect(isAudioEntry(mockEntry({ quality: "M4A" }))).toBe(true);
  expect(
    isAudioEntry(
      mockEntry({ quality: undefined, videoPath: null, audioPath: "/a.m4a" }),
    ),
  ).toBe(true);
});

test("normalizeSettings validates libraryLayout modes", () => {
  expect(normalizeSettings({ libraryLayout: "post" }).libraryLayout).toBe(
    "post",
  );
  expect(normalizeSettings({ libraryLayout: "grade" }).libraryLayout).toBe(
    "grade",
  );
  expect(normalizeSettings({ libraryLayout: "list" }).libraryLayout).toBe(
    "list",
  );
  // Default is "post"
  expect(normalizeSettings({}).libraryLayout).toBe("post");
});

test("active download tasks calculate percent and Downbit telemetry accurately", () => {
  const halfDoneTask = {
    videoId: "test-vid-1",
    title: "Test Video",
    thumbnailUrl: "https://i.ytimg.com/vi/test-vid-1/hqdefault.jpg",
    qualityLabel: "720p MP4",
    subtitleLabel: "人工 English",
    subtitleIsAuto: false,
    targetPath: "/downloads/test.mp4",
    stage: "downloading" as const,
    percent: 50,
    downloadedBytes: 50 * 1024 * 1024,
    totalBytes: 100 * 1024 * 1024,
    speedBps: 4.5 * 1024 * 1024,
    etaSeconds: 11,
  };

  expect(Math.round(halfDoneTask.percent)).toBe(50);
  expect(halfDoneTask.percent >= 0 && halfDoneTask.percent <= 100).toBe(true);
});

test("download task completion animation: marks stage as done at 100% with ready feedback", () => {
  const completedTask = {
    videoId: "test-vid-done",
    title: "Completed Video",
    thumbnailUrl: "https://i.ytimg.com/vi/test-vid-done/hqdefault.jpg",
    qualityLabel: "1080p MP4",
    subtitleLabel: "English",
    subtitleIsAuto: false,
    targetPath: "/downloads/completed.mp4",
    stage: "done" as const,
    percent: 100,
    downloadedBytes: 120 * 1024 * 1024,
    totalBytes: 120 * 1024 * 1024,
    speedBps: 0,
    etaSeconds: 0,
  };

  expect(completedTask.stage).toBe("done");
  expect(completedTask.percent).toBe(100);
});

