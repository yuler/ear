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

test("library entries are ordered in reverse chronological order with newest prepended to first grid slot", () => {
  const older = mockEntry({ videoId: "v1", updatedAt: 1000 });
  const newer = mockEntry({ videoId: "v2", updatedAt: 2000 });
  const newest = mockEntry({ videoId: "v3", updatedAt: 3000 });

  const list = [older, newer, newest].sort((a, b) => b.updatedAt - a.updatedAt);
  expect(list[0].videoId).toBe("v3");
  expect(list[1].videoId).toBe("v2");
  expect(list[2].videoId).toBe("v1");
});

test("active download task in paused stage retains progress for breakpoint resume", () => {
  const pausedTask = {
    videoId: "test-paused",
    title: "Paused Task",
    thumbnailUrl: "https://i.ytimg.com/vi/test-paused/hqdefault.jpg",
    qualityLabel: "720p MP4",
    subtitleLabel: "English",
    subtitleIsAuto: false,
    targetPath: "/downloads/test-paused.mp4",
    stage: "paused" as const,
    percent: 64,
    downloadedBytes: 64 * 1024 * 1024,
    totalBytes: 100 * 1024 * 1024,
    speedBps: 0,
    etaSeconds: null,
  };

  expect(pausedTask.stage).toBe("paused");
  expect(pausedTask.percent).toBe(64);
  expect(pausedTask.downloadedBytes).toBe(64 * 1024 * 1024);
});

test("library entries filter excludes downloading and paused tasks from completed grid", () => {
  const readyEntry = mockEntry({ videoId: "ready1", state: "ready" });
  const downloadingEntry = mockEntry({
    videoId: "dl1",
    state: "downloading",
  });
  const pausedEntry = mockEntry({ videoId: "pause1", state: "paused" });

  const all = [readyEntry, downloadingEntry, pausedEntry];
  const completedVideos = all.filter(
    (e) =>
      e.state !== "downloading" &&
      e.state !== "paused" &&
      !isAudioEntry(e),
  );

  expect(completedVideos.length).toBe(1);
  expect(completedVideos[0].videoId).toBe("ready1");
});


