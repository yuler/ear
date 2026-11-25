import { expect, test } from "nsh/test";
import { normalizeSettings } from "../store";
import { MESSAGES } from "../ui/i18n";
import { settings, updateSettings } from "../ui/settings";
import { SettingsView } from "./SettingsView";

test("SettingsView exports valid component function", () => {
  expect(typeof SettingsView).toBe("function");
});

test("Settings store allows toggling preferences and updating settings values", () => {
  updateSettings({ appearance: "dark", language: "zh", defaultQuality: "720p", clipboardAuto: false });
  expect(settings().appearance).toBe("dark");
  expect(settings().language).toBe("zh");
  expect(settings().defaultQuality).toBe("720p");
  expect(settings().clipboardAuto).toBe(false);

  updateSettings({ appearance: "light", language: "en", defaultQuality: "audio", clipboardAuto: true });
  expect(settings().appearance).toBe("light");
  expect(settings().language).toBe("en");
  expect(settings().defaultQuality).toBe("audio");
  expect(settings().clipboardAuto).toBe(true);
});

test("normalizeSettings migrates 480p and unknown qualities to 360p", () => {
  expect(normalizeSettings({ defaultQuality: "480p" as any }).defaultQuality).toBe("360p");
  expect(normalizeSettings({ defaultQuality: "4k" as any }).defaultQuality).toBe("360p");
  expect(normalizeSettings({}).defaultQuality).toBe("360p");
  expect(normalizeSettings({ defaultQuality: "1080p" }).defaultQuality).toBe("1080p");
  expect(normalizeSettings({ defaultQuality: "audio" }).defaultQuality).toBe("audio");
});

test("normalizeSettings drops retired keys and keeps blocker positions", () => {
  const rect = { x: 5, y: 70, width: 90, height: 15 };
  const legacy = {
    libraryLayout: "grade",
    subtitleSize: "lg",
    showFooter: true,
    preferredRate: 1.2,
    subtitleBlockerStyle: "solid",
    subtitleBlockerOpacity: 50,
    subtitleBlockerMosaic: 20,
    subtitleBlockerBlur: 30,
    subtitleBlockerFeather: 10,
    sentenceLength: "long",
    subtitleBlockerDefault: rect,
    subtitleBlockerVideos: { abc: rect },
  } as any;
  const s = normalizeSettings(legacy) as Record<string, unknown>;
  for (const key of [
    "libraryLayout",
    "subtitleSize",
    "showFooter",
    "preferredRate",
    "subtitleBlockerStyle",
    "subtitleBlockerOpacity",
    "subtitleBlockerMosaic",
    "subtitleBlockerBlur",
    "subtitleBlockerFeather",
  ]) {
    expect(key in s).toBe(false);
  }
  expect(s.sentenceLength).toBe("long");
  expect(s.subtitleBlockerDefault).toEqual(rect);
  expect(s.subtitleBlockerVideos).toEqual({ abc: rect });
});

test("settings strings exist in both locales", () => {
  for (const locale of ["en", "zh"] as const) {
    const m = MESSAGES[locale];
    expect(m.settingsDownloadFolder.length > 0).toBe(true);
    expect(m.settingsDefaultQuality.length > 0).toBe(true);
    expect(m.settingsShortcuts.length > 0).toBe(true);
    expect(m.settingsUpdateAvailable("v1.2.3").includes("v1.2.3")).toBe(true);
  }
});
