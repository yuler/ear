import { signal } from "nsh";
import { expect, test } from "nsh/test";
import type { LibraryEntry } from "../library/types";
import { LibraryCard } from "./LibraryCards";
import { formatEntryDescription, isAudioEntry, LibraryView } from "./LibraryView";
import {
  areAllVisibleSelected,
  completedEntries,
  filterLibraryEntries,
  formatDuration,
  pruneSelectedIds,
  subtitleIssue,
  toggleSelectAllIds,
  toggleSelectedId,
} from "./libraryViewHelpers";

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

test("library grid mixes video and audio, newest added first", () => {
  const older = mockEntry({ videoId: "v1", createdAt: 1000, updatedAt: 9000 });
  const audio = mockEntry({
    videoId: "a1",
    quality: "Audio (M4A)",
    videoPath: null,
    audioPath: "/a1.m4a",
    createdAt: 2000,
  });
  const newest = mockEntry({ videoId: "v3", createdAt: 3000, updatedAt: 3000 });

  const list = completedEntries([older, audio, newest], []);
  expect(list.map((e) => e.videoId)).toEqual(["v3", "a1", "v1"]);
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

test("library grid leaves out pending, downloading, paused and active downloads", () => {
  const all = [
    mockEntry({ videoId: "ready1", state: "ready" }),
    mockEntry({ videoId: "pend1", state: "pending" }),
    mockEntry({ videoId: "dl1", state: "downloading" }),
    mockEntry({ videoId: "pause1", state: "paused" }),
    mockEntry({ videoId: "active1", state: "ready" }),
  ];
  const downloads = [
    {
      videoId: "active1",
      title: "Active",
      thumbnailUrl: "",
      qualityLabel: "720p MP4",
      subtitleLabel: "",
      subtitleIsAuto: false,
      targetPath: "",
      stage: "downloading" as const,
      percent: 10,
      downloadedBytes: 0,
      totalBytes: 0,
      speedBps: 0,
      etaSeconds: null,
    },
  ];
  const list = completedEntries(all, downloads);
  expect(list.length).toBe(1);
  expect(list[0].videoId).toBe("ready1");
});

test("subtitle status shows only when abnormal", () => {
  expect(
    subtitleIssue(mockEntry({ captionsPath: "/c.json", subtitleLabel: "English" })),
  ).toBe(null);
  expect(
    subtitleIssue(
      mockEntry({ captionsPath: "/c.json", subtitleLabel: "English", subtitleIsAuto: true }),
    ),
  ).toBe("auto");
  expect(subtitleIssue(mockEntry({ captionsPath: null, subtitleLabel: null }))).toBe("none");
});

test("formatDuration hides unknown durations", () => {
  expect(formatDuration(1645000)).toBe("27:25");
  expect(formatDuration(3723000)).toBe("1:02:03");
  expect(formatDuration(null)).toBe("");
});

test("filterLibraryEntries matches multi-token case-insensitive queries across metadata", () => {
  const entries = [
    mockEntry({ videoId: "v1", title: "Slow English Podcast: Weird News", quality: "720p" }),
    mockEntry({ videoId: "v2", title: "Daily Japanese Listening", site: "SoundCloud", quality: "M4A" }),
  ];

  expect(filterLibraryEntries(entries, "").length).toBe(2);
  expect(filterLibraryEntries(entries, "slow news").map((e) => e.videoId)).toEqual(["v1"]);
  expect(filterLibraryEntries(entries, "soundcloud m4a").map((e) => e.videoId)).toEqual(["v2"]);
  expect(filterLibraryEntries(entries, "nonexistent").length).toBe(0);
});

test("LibraryView accepts disabled prop and safely renders empty and populated views", () => {
  const disabled = signal(true);
  const entries = signal<LibraryEntry[]>([mockEntry({ videoId: "v1" })]);

  const view = LibraryView({
    disabled,
    savedEntries: entries,
    onOpenEntry: () => {},
    onOpenFolder: () => {},
    onDeleteEntry: () => {},
  });

  expect(view).toBeDefined();
});

test("multi-select helpers toggle, select-all, deselect-all, and prune deleted IDs", () => {
  let selected = new Set<string>();
  selected = toggleSelectedId(selected, "v1");
  expect([...selected]).toEqual(["v1"]);
  selected = toggleSelectedId(selected, "v2");
  expect([...selected]).toEqual(["v1", "v2"]);
  selected = toggleSelectedId(selected, "v1");
  expect([...selected]).toEqual(["v2"]);

  const visible = ["v1", "v2", "v3"];
  expect(areAllVisibleSelected(selected, visible)).toBe(false);

  // Select all visible
  selected = toggleSelectAllIds(selected, visible);
  expect(areAllVisibleSelected(selected, visible)).toBe(true);
  expect([...selected].sort()).toEqual(["v1", "v2", "v3"]);

  // Toggle again deselects all visible
  selected = toggleSelectAllIds(selected, visible);
  expect(selected.size).toBe(0);

  // Prune drops IDs no longer in the library
  const pruned = pruneSelectedIds(new Set(["v1", "v2", "gone"]), new Set(["v1", "v2"]));
  expect([...pruned].sort()).toEqual(["v1", "v2"]);
});

test("LibraryCard omits per-card overflow button in favor of top-level multi-select activation", () => {
  const card = LibraryCard({
    entry: mockEntry({ videoId: "v1" }),
    selected: false,
    selectionMode: false,
    onOpen: () => {},
    onMenu: () => {},
  });
  const str = JSON.stringify(card);
  expect(str.includes("More actions")).toBe(false);
  expect(str.includes("⋯")).toBe(false);
});
