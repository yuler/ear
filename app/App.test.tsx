import { expect, open, test } from "nsh/test";
import { normalizeSettings } from "./store";
import { buildVideoPreview } from "./clipboard";

test("shows minimal Ear shell and text mode tabs", async () => {
  const app = await open("./App.tsx");
  expect(app.texts().some((t) => t.includes("Ear"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Library"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Blind Flow"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Loop Dojo"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Sentences"))).toBe(true);
  expect(
    app.texts().some((t) => t.includes("Paste a YouTube link")),
  ).toBe(true);
});

test("auto-reads YouTube link from clipboard on launch", async () => {
  const app = await open("./App.tsx", {
    clipboard: "https://www.youtube.com/watch?v=b-6XR0rflJw",
  });
  await app.waitFor("From your clipboard");
  expect(app.texts().some((t) => t.includes("From your clipboard"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Open"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Return ↵"))).toBe(true);
  expect(app.texts().some((t) => t.includes("b-6XR0rflJw"))).toBe(true);
});

test("opens Settings modal and shows appearance, speed, and download folder", async () => {
  const app = await open("./App.tsx");
  await app.press("Settings");
  await app.waitFor("Appearance");
  expect(app.texts().some((t) => t.includes("Light"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Dark"))).toBe(true);
  expect(app.texts().some((t) => t.includes("System"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Default speed"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Subtitle size"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Shortcut bar"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Clipboard detection"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Download folder"))).toBe(true);
});

test("buildVideoPreview extracts YouTube URL", () => {
  const preview = buildVideoPreview(
    "https://www.youtube.com/watch?v=b-6XR0rflJw",
    "clipboard",
  );
  expect(preview?.videoId).toBe("b-6XR0rflJw");
  expect(preview?.source).toBe("clipboard");
  expect(preview?.title).toContain("b-6XR0rflJw");
  expect(preview?.thumbnailUrl).toBe(
    "https://i.ytimg.com/vi/b-6XR0rflJw/hqdefault.jpg",
  );
});

test("normalizeSettings fills defaults and validates fields", () => {
  const s = normalizeSettings({ appearance: "light", preferredRate: 1.2 });
  expect(s.appearance).toBe("light");
  expect(s.preferredRate).toBe(1.2);
  expect(s.subtitleSize).toBe("md");
  expect(s.showFooter).toBe(false);
  expect(s.clipboardAuto).toBe(true);
  expect(s.downloadFolder).toBe("");
});
