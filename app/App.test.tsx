import { signal } from "nsh";
import { expect, open, test } from "nsh/test";
import {
  availableQualityIds,
  createPreviewController,
  defaultQualityId,
  pickDefaultTrack,
} from "./appPreview";
import { buildVideoPreview, isLinkText } from "./clipboard";
import nshConfig from "./nsh.json";
import { partitionSubtitleTracks } from "./ui/ClipboardCard";
import { MESSAGES } from "./ui/i18n";
import type { CaptionTrack } from "./youtube/types";

const has = (texts: string[], s: string) => texts.some((t) => t.includes(s));

test("starts on Library under the search bar, with a weak Discover entry below and Discover as a subpage", async () => {
  const app = await open("./App.tsx");
  expect(app.shows("label:Settings")).toBe(true);
  // No top-bar Discover | Library tabs on the Library home page.
  expect(app.shows("label:Back to Library")).toBe(false);
  expect(app.texts().every((t) => t !== "index")).toBe(true);

  await app.waitFor("Your library is empty");
  expect(app.shows("label:Browse all")).toBe(true);

  // Open Discover page from the weak entry below Library.
  await app.press("label:Browse all");
  await app.waitFor("English");
  expect(app.shows("label:Back to Library")).toBe(true);
  expect(has(app.texts(), "Japanese")).toBe(true);
  expect(has(app.texts(), "A1")).toBe(true);
  expect(has(app.texts(), "N5")).toBe(false);
  expect(has(app.texts(), "5 分钟")).toBe(false);
  expect(has(app.texts(), "热门标签")).toBe(false);

  await app.press("label:Japanese");
  await app.waitFor("N5");
  expect(has(app.texts(), "A1")).toBe(false);

  // Back button returns to Library.
  await app.press("label:Back to Library");
  await app.waitFor("Your library is empty");
  expect(app.shows("label:Back to Library")).toBe(false);
});

test("a clipboard link pops a card with quality, subtitle options and Download, which closes it", async () => {
  const app = await open("./App.tsx", {
    clipboard: "https://www.youtube.com/watch?v=b-6XR0rflJw",
  });
  await app.waitUntil(() => app.texts().some((t) => t.toLowerCase().includes("subtitles")));
  expect(has(app.texts(), "360p")).toBe(true);
  expect(has(app.texts(), "480p")).toBe(false);
  expect(app.shows("label:Download")).toBe(true);

  await app.press("label:Download");
  await app.waitUntil(() => app.texts().every((t) => !t.toLowerCase().includes("subtitles")));
});

test("Settings opens as a modal over Library, closes when opening Shortcuts, and Escape returns to Library", async () => {
  const app = await open("./App.tsx");
  await app.waitFor("Your library is empty");

  await app.press("label:Settings");
  await app.waitFor(MESSAGES.en.settingsDownloadFolder);
  // Library remains underneath the Settings modal.
  expect(has(app.texts(), "Your library is empty")).toBe(true);

  await app.press(`label:${MESSAGES.en.settingsShortcuts}`);
  await app.waitFor("Keyboard Shortcuts");
  // Settings modal closes when navigating to Keyboard Shortcuts.
  expect(has(app.texts(), MESSAGES.en.settingsDownloadFolder)).toBe(false);

  // Escape closes Shortcuts and returns directly to Library.
  await app.keyboard.press("escape");
  expect(app.texts().every((t) => t !== "Keyboard Shortcuts")).toBe(true);
  expect(has(app.texts(), MESSAGES.en.settingsDownloadFolder)).toBe(false);
  expect(has(app.texts(), "Your library is empty")).toBe(true);
});

test("quality choices are 360p / 720p / 1080p / audio only, defaulting to 360p", () => {
  const preview = buildVideoPreview("https://youtu.be/b-6XR0rflJw", "input")!;
  expect(availableQualityIds(preview)).toEqual(["360p", "720p", "1080p", "audio"]);
  expect(defaultQualityId(["720p", "1080p"])).toBe("720p");
  expect(defaultQualityId(["360p", "720p"])).toBe("360p");
});

test("default subtitle: same-language manual track, else its auto track", () => {
  const track = (languageCode: string, isAuto: boolean): CaptionTrack => ({
    trackId: `${languageCode}:${isAuto ? "asr" : "manual"}`,
    languageCode,
    name: languageCode,
    baseUrl: "",
    isAuto,
  });
  const tracks = [track("en", true), track("ja", true), track("ja", false), track("en", false)];
  expect(pickDefaultTrack(tracks, { language: "ja" })?.trackId).toBe("ja:manual");
  expect(pickDefaultTrack([track("ja", true), track("en", false)], { language: "ja" })?.trackId).toBe("ja:asr");
  expect(pickDefaultTrack(tracks, { language: "en" })?.trackId).toBe("en:manual");
  expect(pickDefaultTrack([], { language: "en" })).toBe(null);
});

test("partitionSubtitleTracks keeps at most 3 inline tracks and moves the rest into overflow select", () => {
  const mk = (code: string): CaptionTrack => ({
    trackId: `${code}:asr`,
    languageCode: code,
    name: code.toUpperCase(),
    baseUrl: "",
    isAuto: true,
  });
  const tracks = [mk("en"), mk("ja"), mk("fr"), mk("de"), mk("es")];

  const def = partitionSubtitleTracks(tracks, "en:asr");
  expect(def.primary.map((t) => t.languageCode)).toEqual(["en", "ja", "fr"]);
  expect(def.overflow.map((t) => t.languageCode)).toEqual(["de", "es"]);

  // Choosing an overflow track promotes it into the 3 inline pills.
  const picked = partitionSubtitleTracks(tracks, "es:asr");
  expect(picked.primary.map((t) => t.languageCode)).toEqual(["en", "ja", "es"]);
  expect(picked.overflow.map((t) => t.languageCode)).toEqual(["fr", "de"]);

  // 3 or fewer tracks show all inline with no overflow.
  const few = partitionSubtitleTracks(tracks.slice(0, 3), "en:asr");
  expect(few.primary.length).toBe(3);
  expect(few.overflow.length).toBe(0);
});

test("buildVideoPreview extracts YouTube URL and ignores plain search words (including 11-letter words)", () => {
  const preview = buildVideoPreview(
    "https://www.youtube.com/watch?v=b-6XR0rflJw",
    "clipboard",
  );
  expect(preview?.videoId).toBe("b-6XR0rflJw");
  expect(preview?.source).toBe("clipboard");
  expect(preview?.thumbnailUrl).toBe(
    "https://i.ytimg.com/vi/b-6XR0rflJw/hqdefault.jpg",
  );

  expect(isLinkText("https://youtu.be/b-6XR0rflJw")).toBe(true);
  expect(isLinkText("environment")).toBe(false);
  expect(buildVideoPreview("environment", "input")).toBe(null);
  expect(buildVideoPreview("slow english", "input")).toBe(null);
});

test("selectFromDiscover populates the search bar with preview config and clears cleanly on dismiss", () => {
  const url = signal("");
  const preview = createPreviewController(url);

  preview.selectFromDiscover({
    videoId: "3mxblcBZgqM",
    url: "https://www.youtube.com/watch?v=3mxblcBZgqM",
    title: "5 min Japanese Listening",
    thumbnailUrl: "https://i.ytimg.com/vi/3mxblcBZgqM/hqdefault.jpg",
    language: "ja",
  });

  expect(url()).toBe("https://www.youtube.com/watch?v=3mxblcBZgqM");
  expect(preview.active()?.videoId).toBe("3mxblcBZgqM");
  expect(preview.active()?.title).toBe("5 min Japanese Listening");
  expect(preview.active()?.source).toBe("discover");
  expect(preview.active()?.language).toBe("ja");

  // Dismissing a Discover-seeded preview closes the card and clears the search bar.
  preview.dismiss();
  expect(preview.active()).toBe(null);
  expect(url()).toBe("");

  // Clicking the same Discover item again re-opens the preview card.
  preview.selectFromDiscover({
    videoId: "3mxblcBZgqM",
    url: "https://www.youtube.com/watch?v=3mxblcBZgqM",
    title: "5 min Japanese Listening",
    thumbnailUrl: "https://i.ytimg.com/vi/3mxblcBZgqM/hqdefault.jpg",
    language: "ja",
  });
  expect(preview.active()?.videoId).toBe("3mxblcBZgqM");

  // Typing plain search text does not trigger a preview card.
  url.set("slow english");
  expect(preview.active()).toBe(null);
});

test("app configuration: single instance, icon, and window size limits", () => {
  expect(nshConfig.singleInstance).toBe(true);
  expect(nshConfig.id).toBe("dev.yuler.ear");
  expect(nshConfig.icon).toBe("icon.png");
  expect(nshConfig.window.minSize).toEqual({ width: 800, height: 560 });
  expect(nshConfig.window.defaultSize).toEqual({ width: 1200, height: 800 });
  expect(nshConfig.window.restoreBounds).toBe(true);
});
