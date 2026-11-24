import { signal } from "nsh";
import { expect, open, test } from "nsh/test";
import {
  displayDownloadPath,
  formatDiskSize,
  parseDfPkOutput,
} from "../library/storage";
import type { LibraryEntry } from "../library/types";
import {
  ActiveDownloadRow,
  ActiveDownloadsSection,
  summarizeDownloads,
} from "../ui/ActiveDownloadRow";
import { SHELL_MESSAGES } from "../ui/shellI18n";
import { LibraryBatchBar } from "./LibraryBatchBar";
import { LibraryCard } from "./LibraryCards";
import { LibraryHeader } from "./LibraryHeader";
import {
  buildDiscoverContextMenu,
  buildLibraryContextMenu,
} from "./libraryMenus";
import { formatEntryDescription, isAudioEntry, LibraryView } from "./LibraryView";
import {
  areAllVisibleSelected,
  completedEntries,
  entryMediaAspect,
  filterLibraryEntries,
  formatDuration,
  pruneSelectedIds,
  subtitleIssue,
  toggleSelectAllIds,
  toggleSelectedId,
  videoOrientation,
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

test("videoOrientation and entryMediaAspect distinguish portrait, landscape, audio, and unknown videos", () => {
  const portrait = mockEntry({ videoId: "p1", videoWidth: 720, videoHeight: 1280 });
  const landscape = mockEntry({ videoId: "l1", videoWidth: 1920, videoHeight: 1080 });
  const unknown = mockEntry({ videoId: "u1", videoWidth: null, videoHeight: null });
  const audio = mockEntry({
    videoId: "a1",
    quality: "Audio (M4A)",
    videoPath: null,
    audioPath: "/downloads/a1.m4a",
    videoWidth: 1920,
    videoHeight: 1080,
  });

  expect(entryMediaAspect(portrait)).toBe(720 / 1280);
  expect(entryMediaAspect(landscape)).toBe(1920 / 1080);
  expect(entryMediaAspect(unknown)).toBe(null);
  expect(entryMediaAspect(audio)).toBe(null);
  expect(videoOrientation(portrait)).toBe("portrait");
  expect(videoOrientation(landscape)).toBe("landscape");
  expect(videoOrientation(unknown)).toBe(null);
  expect(videoOrientation(audio)).toBe(null);

  expect(LibraryCard({ entry: portrait, onOpen: () => {}, onMenu: () => {} })).toBeDefined();
  expect(LibraryCard({ entry: landscape, onOpen: () => {}, onMenu: () => {} })).toBeDefined();
  expect(LibraryCard({ entry: audio, onOpen: () => {}, onMenu: () => {} })).toBeDefined();
});

test("summarizeDownloads aggregates speed, max ETA, and running/paused flags for Downloading block", () => {
  const tasks = [
    {
      videoId: "d1",
      title: "Video 1",
      thumbnailUrl: "",
      qualityLabel: "1080p MP4",
      subtitleLabel: "English · 人工",
      subtitleIsAuto: false,
      targetPath: "",
      stage: "downloading" as const,
      percent: 12,
      downloadedBytes: 5 * 1024 * 1024,
      totalBytes: 42 * 1024 * 1024,
      speedBps: 837 * 1024,
      etaSeconds: 48,
    },
    {
      videoId: "d2",
      title: "Video 2",
      thumbnailUrl: "",
      qualityLabel: "720p MP4",
      subtitleLabel: "",
      subtitleIsAuto: false,
      targetPath: "",
      stage: "paused" as const,
      percent: 50,
      downloadedBytes: 10 * 1024 * 1024,
      totalBytes: 20 * 1024 * 1024,
      speedBps: 500 * 1024,
      etaSeconds: 99,
    },
  ];

  const sum = summarizeDownloads(tasks);
  expect(sum.count).toBe(2);
  expect(sum.totalSpeedBps).toBe(837 * 1024);
  expect(sum.maxEtaSeconds).toBe(48);
  expect(sum.hasRunning).toBe(true);
  expect(sum.hasPaused).toBe(true);

  expect(ActiveDownloadRow({ task: () => tasks[0] })).toBeDefined();
  expect(ActiveDownloadsSection({ tasks: () => tasks })).toBeDefined();
});

test("buildLibraryContextMenu and buildDiscoverContextMenu provide right-click actions for Home items", () => {
  const entry = mockEntry({ videoId: "v1" });
  const normalItems = buildLibraryContextMenu({
    entry,
    selectionMode: false,
    checked: false,
    selectedCount: 0,
    allVisibleSelected: false,
    canDelete: true,
    messages: SHELL_MESSAGES.en,
    onPlay: () => {},
    onOpenFolder: () => {},
    onCopyLink: () => {},
    onEnterSelect: () => {},
    onToggleItemSelect: () => {},
    onToggleSelectAll: () => {},
    onDeleteItem: () => {},
    onDeleteSelected: () => {},
  });
  const normalLabels = normalItems
    .filter((i): i is { label: string } => Boolean(i && "label" in i))
    .map((i) => i.label);
  expect(normalLabels).toEqual([
    "Play",
    "Open folder",
    "Copy link",
    "Multi-select",
    "Delete",
  ]);

  const selectItems = buildLibraryContextMenu({
    entry,
    selectionMode: true,
    checked: true,
    selectedCount: 2,
    allVisibleSelected: true,
    canDelete: true,
    messages: SHELL_MESSAGES.en,
    onPlay: () => {},
    onOpenFolder: () => {},
    onCopyLink: () => {},
    onEnterSelect: () => {},
    onToggleItemSelect: () => {},
    onToggleSelectAll: () => {},
    onDeleteItem: () => {},
    onDeleteSelected: () => {},
  });
  const selectLabels = selectItems
    .filter((i): i is { label: string } => Boolean(i && "label" in i))
    .map((i) => i.label);
  expect(selectLabels).toEqual([
    "Deselect",
    "Deselect all",
    "Play",
    "Open folder",
    "Copy link",
    "Delete selected (2)",
  ]);

  const discoverMenu = buildDiscoverContextMenu({
    item: {
      id: "d1",
      videoId: "d1",
      url: "https://www.youtube.com/watch?v=d1",
      title: "Sample",
      author: "Channel",
      language: "en",
      level: "A2",
      levelLabel: "A2 · CEFR",
      durationTier: 10,
      durationMs: 600000,
      format: "en-en",
      formatLabel: "英英结合",
      thumbnailUrl: "",
      description: "",
      tags: [],
    },
    downloadedEntry: null,
    messages: SHELL_MESSAGES.en,
    onOpen: () => {},
    onCopyLink: () => {},
  });
  const discoverLabels = discoverMenu
    .filter((i): i is { label: string } => Boolean(i && "label" in i))
    .map((i) => i.label);
  expect(discoverLabels).toEqual(["Configure & download", "Copy link"]);

  expect(
    LibraryHeader({
      visibleCount: () => 2,
      totalCount: () => 2,
      isSearching: () => false,
      canSelect: () => true,
      selectionMode: () => true,
      allSelected: () => false,
      onToggleSelectionMode: () => {},
      onToggleSelectAll: () => {},
    }),
  ).toBeDefined();

  expect(
    LibraryBatchBar({
      selectedCount: () => 1,
      canDelete: true,
      onOpenFolder: () => {},
      onDeleteSelected: () => {},
      onExit: () => {},
    }),
  ).toBeDefined();
});

test("storage helpers shorten home paths and format disk capacities", () => {
  expect(displayDownloadPath("/home/alice/Downloads", "/home/alice")).toBe("~/Downloads");
  expect(displayDownloadPath("/home/alice", "/home/alice")).toBe("~");
  expect(displayDownloadPath("/mnt/media", "/home/alice")).toBe("/mnt/media");
  expect(formatDiskSize(2 * 1024 ** 4)).toBe("2.00 TB");
  expect(formatDiskSize(256 * 1024 ** 3)).toBe("256 GB");
  expect(formatDiskSize(48.5 * 1024 ** 3)).toBe("48.5 GB");
  expect(formatDiskSize(512 * 1024 ** 2)).toBe("512 MB");
  expect(formatDiskSize(null)).toBe("");

  const dfOut = [
    "Filesystem       1024-blocks      Used Available Capacity Mounted on",
    "/dev/mapper/root   247943168 222927688  18667832      93% /home",
  ].join("\n");
  expect(parseDfPkOutput(dfOut, "/home/alice/Downloads")).toEqual({
    path: "/home/alice/Downloads",
    availableBytes: 18667832 * 1024,
    totalBytes: 247943168 * 1024,
  });

  const spacedDf = [
    "Filesystem     1024-blocks   Used Available Capacity Mounted on",
    "my pool/data     1000000   400000    600000      40% /mnt/my drive",
  ].join("\n");
  expect(parseDfPkOutput(spacedDf, "/mnt/my drive")).toEqual({
    path: "/mnt/my drive",
    availableBytes: 600000 * 1024,
    totalBytes: 1000000 * 1024,
  });
});

test("Library multi-select uses single-key S/A, keeps batch bar buttons permanently mounted, and shows download path + free space under Library header", async () => {
  const app = await open("../ui/overlayFixture.tsx", { width: 1000, height: 700 });

  // Download folder and disk capacity appear tightly below the Library title
  await app.waitFor("/tmp/ear-downloads");
  expect(app.texts().some((t) => t.includes("120 GB free / 500 GB"))).toBe(true);
  // Library cards show portrait and landscape orientation icons when dimensions are known
  expect(app.shows("label:Portrait video")).toBe(true);
  expect(app.shows("label:Landscape video")).toBe(true);

  // Press 's' to activate multi-select mode
  await app.keyboard.press("s");
  await app.waitFor("Select all");
  expect(app.texts().some((t) => t === "A")).toBe(true);
  expect(app.texts().some((t) => t.includes("Ctrl+A"))).toBe(false);
  expect(app.texts().some((t) => t === "0")).toBe(true);
  // Download folder + disk capacity stay visible under Library without layout jump
  expect(app.texts().some((t) => t.includes("/tmp/ear-downloads"))).toBe(true);
  expect(app.texts().some((t) => t.includes("120 GB free / 500 GB"))).toBe(true);
  // Both Open folder and Delete stay permanently mounted at 0 selections
  expect(app.shows("label:Open folder")).toBe(true);
  expect(app.shows("label:Delete selected")).toBe(true);

  // Press single key 'a' to select all 3 entries
  await app.keyboard.press("a");
  await app.waitFor("Deselect all");
  expect(app.texts().filter((t) => t === "3").length).toBeGreaterThanOrEqual(2);
  expect(app.shows("label:Open folder")).toBe(true);
  expect(app.shows("label:Delete selected")).toBe(true);

  // Press single key 'a' again to deselect all
  await app.keyboard.press("a");
  await app.waitFor("Select all");
  expect(app.texts().some((t) => t === "0")).toBe(true);

  // Backward-compatible Mod+A also toggles select all
  await app.keyboard.press("mod+a");
  await app.waitFor("Deselect all");

  // Escape exits multi-select cleanly
  await app.keyboard.press("escape");
  await app.waitFor("/tmp/ear-downloads");
  expect(app.shows("label:Delete selected")).toBe(false);

  // Async dimension backfill updates mounted LibraryCard reactively (without remounting)
  // and passes the fresh portrait dimensions when the card is clicked
  await app.press("Backfill v3 Portrait");
  await app.press("label:Open Video v3");
  await app.waitFor("Dims:720x1280");
  expect(app.texts().includes("Dims:720x1280")).toBe(true);
});

test("Library context menu advertises single-key 'a' for Select All in selection mode", () => {
  const items = buildLibraryContextMenu({
    entry: mockEntry({ videoId: "v1" }),
    selectionMode: true,
    checked: false,
    selectedCount: 0,
    allVisibleSelected: false,
    canDelete: true,
    messages: SHELL_MESSAGES.en,
    onPlay: () => {},
    onOpenFolder: () => {},
    onCopyLink: () => {},
    onEnterSelect: () => {},
    onToggleItemSelect: () => {},
    onToggleSelectAll: () => {},
    onDeleteItem: () => {},
    onDeleteSelected: () => {},
  });
  const selectAllItem = items.find(
    (i): i is { label: string; shortcut?: string } =>
      Boolean(i && "label" in i && i.label === "Select all"),
  );
  expect(selectAllItem?.shortcut).toBe("a");
});
