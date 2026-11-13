import { expect, open, test } from "nsh/test";
import { buildVideoPreview } from "./clipboard";
import { normalizeSettings } from "./store";
import nshConfig from "./nsh.json";

test("shows minimal Ear shell and left sidebar with Discover / Videos / Audio", async () => {
  const app = await open("./App.tsx");
  expect(app.texts().some((t) => t.includes("Ear"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Videos") || t.includes("Video"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Audio"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Discover"))).toBe(true);
  // Ensure "index" never appears
  expect(app.texts().every((t) => t !== "index")).toBe(true);

  // Switch to Discover tab in left sidebar
  await app.press("Discover");
  await app.waitFor("Discover · 精听推荐");
  expect(app.texts().some((t) => t.includes("Discover · 精听推荐"))).toBe(true);
  expect(app.texts().some((t) => t.includes("时长划分"))).toBe(true);
  expect(app.texts().some((t) => t.includes("等级划分"))).toBe(true);
  expect(app.texts().some((t) => t.includes("5 分钟"))).toBe(true);
  expect(app.texts().some((t) => t.includes("10 分钟"))).toBe(true);
  expect(app.texts().some((t) => t.includes("20 分钟"))).toBe(true);
  expect(app.texts().some((t) => t.includes("30 分钟"))).toBe(true);
});

test("auto-reads YouTube link into omnibar dropdown with quality, Manual/CC subtitle selectors, and Download button", async () => {
  const app = await open("./App.tsx", {
    clipboard: "https://www.youtube.com/watch?v=b-6XR0rflJw",
  });
  await app.waitFor("From your clipboard");
  await app.waitFor("1080p");
  expect(app.texts().some((t) => t.includes("From your clipboard"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Download"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Return ↵ to download"))).toBe(true);
  expect(app.texts().some((t) => t.includes("b-6XR0rflJw"))).toBe(true);
  // Quality selector options
  expect(app.texts().some((t) => t.includes("360p"))).toBe(true);
  expect(app.texts().some((t) => t.includes("480p"))).toBe(true);
  expect(app.texts().some((t) => t.includes("720p"))).toBe(true);
  expect(app.texts().some((t) => t.includes("1080p"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Audio (M4A)"))).toBe(true);
  // Subtitle badges distinguishing Manual (人工) vs CC (CC 机翻)
  expect(app.texts().some((t) => t.includes("人工"))).toBe(true);
  expect(app.texts().some((t) => t.includes("CC 机翻"))).toBe(true);

  // Switch to Discover tab while preview is open
  await app.press("Discover");
  await app.waitFor("Discover · 精听推荐");

  // Pressing Download from Discover auto-switches to Videos tab
  await app.press("Download");
  await app.waitFor("Videos");
  expect(app.texts().some((t) => t.includes("Videos") || t.includes("Video"))).toBe(true);
});

test("opens Settings page as standalone view without back button and supports sidebar navigation", async () => {
  const app = await open("./App.tsx");
  await app.press("Settings");
  await app.waitFor("打开文件夹");
  expect(app.texts().some((t) => t.includes("下载目录"))).toBe(true);
  expect(app.texts().some((t) => t.includes("打开文件夹"))).toBe(true);
  expect(app.texts().some((t) => t.includes("元数据与字幕存储"))).toBe(true);
  expect(app.texts().some((t) => t.includes("打开数据目录"))).toBe(true);
  expect(app.texts().some((t) => t.includes("解析与下载引擎"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Light"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Dark"))).toBe(true);
  expect(app.texts().some((t) => t.includes("System"))).toBe(true);
  // Settings view is a top-level tab and does not have redundant back button
  expect(app.texts().some((t) => t === "返回")).toBe(false);

  // Navigate back to Videos via sidebar
  await app.press("Videos");
  await app.waitFor("Videos");
  expect(app.texts().some((t) => t.includes("Videos") || t.includes("Video"))).toBe(true);
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
  expect(normalizeSettings({ preferredRate: 1.5 }).preferredRate).toBe(1.5);
  expect(normalizeSettings({ preferredRate: 2 }).preferredRate).toBe(2);
  expect(normalizeSettings({ preferredRate: 99 as any }).preferredRate).toBe(1);
  expect(s.subtitleSize).toBe("md");
  expect(s.showFooter).toBe(false);
  expect(s.clipboardAuto).toBe(true);
  expect(s.downloadFolder).toBe("");
  expect(s.defaultQuality).toBe("360p");
});

test("app configuration enables singleInstance and sets app icon", () => {
  expect(nshConfig.singleInstance).toBe(true);
  expect(nshConfig.id).toBe("dev.yuler.ear");
  expect(nshConfig.icon).toBe("icon.png");
});
