import { expect, open, test } from "nsh/test";
import { availableQualityIds, defaultQualityId, pickDefaultTrack } from "./appPreview";
import { buildVideoPreview } from "./clipboard";
import nshConfig from "./nsh.json";
import { MESSAGES } from "./ui/i18n";
import type { CaptionTrack } from "./youtube/types";

const has = (texts: string[], s: string) => texts.some((t) => t.includes(s));

test("top bar shows Discover | Library and Settings; an empty library starts on Discover", async () => {
  const app = await open("./App.tsx");
  expect(app.shows("label:Discover")).toBe(true);
  expect(app.shows("label:Library")).toBe(true);
  expect(app.shows("label:Settings")).toBe(true);
  expect(app.texts().every((t) => t !== "index")).toBe(true);

  // Discover filters: a language and one level scale, no duration tiers or tags.
  await app.waitFor("English");
  expect(has(app.texts(), "Japanese")).toBe(true);
  expect(has(app.texts(), "A1")).toBe(true);
  expect(has(app.texts(), "N5")).toBe(false);
  expect(has(app.texts(), "5 分钟")).toBe(false);
  expect(has(app.texts(), "热门标签")).toBe(false);

  await app.press("label:Japanese");
  await app.waitFor("N5");
  expect(has(app.texts(), "A1")).toBe(false);

  await app.press("label:Library");
  await app.waitFor("Your library is empty");
});

test("a clipboard link pops a card with quality, one subtitle line and Download, which closes it", async () => {
  const app = await open("./App.tsx", {
    clipboard: "https://www.youtube.com/watch?v=b-6XR0rflJw",
  });
  await app.waitUntil(() => has(app.texts(), "Subtitles:"));
  expect(has(app.texts(), "360p")).toBe(true);
  expect(has(app.texts(), "480p")).toBe(false);
  expect(app.shows("label:Download")).toBe(true);

  await app.press("label:Download");
  await app.waitUntil(() => !has(app.texts(), "Subtitles:"));
  // No tab switch on download start.
  expect(app.shows("text:Your library is empty")).toBe(false);
});

test("Settings keeps the top bar, opens shortcuts from its entry, and Library returns", async () => {
  const app = await open("./App.tsx");
  await app.press("label:Settings");
  await app.waitFor(MESSAGES.en.settingsDownloadFolder);
  expect(app.shows("label:Discover")).toBe(true);

  await app.press(`label:${MESSAGES.en.settingsShortcuts}`);
  await app.waitFor("快捷键指南");
  await app.keyboard.press("escape");
  expect(app.texts().every((t) => t !== "快捷键指南")).toBe(true);

  await app.press("label:Library");
  await app.waitFor("Your library is empty");
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

test("buildVideoPreview extracts YouTube URL", () => {
  const preview = buildVideoPreview(
    "https://www.youtube.com/watch?v=b-6XR0rflJw",
    "clipboard",
  );
  expect(preview?.videoId).toBe("b-6XR0rflJw");
  expect(preview?.source).toBe("clipboard");
  expect(preview?.thumbnailUrl).toBe(
    "https://i.ytimg.com/vi/b-6XR0rflJw/hqdefault.jpg",
  );
});

test("app configuration: single instance, icon, and window size limits", () => {
  expect(nshConfig.singleInstance).toBe(true);
  expect(nshConfig.id).toBe("dev.yuler.ear");
  expect(nshConfig.icon).toBe("icon.png");
  expect(nshConfig.window.minSize).toEqual({ width: 800, height: 560 });
  expect(nshConfig.window.defaultSize).toEqual({ width: 1200, height: 800 });
  expect(nshConfig.window.restoreBounds).toBe(true);
});
