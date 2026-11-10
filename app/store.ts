import { Storage } from "nsh";
import type { BlindTag } from "./views/blindFlow";
import type { PlaybackRate } from "./player";

export type Appearance = "dark" | "light" | "system";
export type SubtitleSize = "sm" | "md" | "lg";

export type EarSettings = {
  lastUrl: string;
  /** Initial playback rate for Blind Flow and Loop Dojo. */
  preferredRate: PlaybackRate;
  appearance: Appearance;
  subtitleSize: SubtitleSize;
  /** Bottom keyboard-shortcut hint bar. */
  showFooter: boolean;
  /** Read the system clipboard for YouTube links on launch / focus. */
  clipboardAuto: boolean;
  /**
   * Where video/audio files are saved. Empty string → ~/Downloads
   * (Downbit-style default folder).
   */
  downloadFolder: string;
};

const KEY = "ear.settings";
const TAGS_KEY = "ear.tags";

export const DEFAULT_SETTINGS: EarSettings = {
  lastUrl: "",
  preferredRate: 1,
  appearance: "dark",
  subtitleSize: "md",
  showFooter: false,
  clipboardAuto: true,
  downloadFolder: "",
};

let cachedSettings: EarSettings = { ...DEFAULT_SETTINGS };

let cachedTagsByVideo: Record<string, Record<number, BlindTag>> = {};

export function saveSettings(settings: Partial<EarSettings>): void {
  cachedSettings = { ...cachedSettings, ...settings };
  void Storage.setItem(KEY, JSON.stringify(cachedSettings)).catch(() => {});
}

/** Validate untrusted stored JSON into a complete settings object. */
export function normalizeSettings(parsed: Partial<EarSettings>): EarSettings {
  const d = DEFAULT_SETTINGS;
  return {
    lastUrl: typeof parsed.lastUrl === "string" ? parsed.lastUrl : d.lastUrl,
    preferredRate:
      parsed.preferredRate === 0.8 ||
      parsed.preferredRate === 1 ||
      parsed.preferredRate === 1.2
        ? parsed.preferredRate
        : d.preferredRate,
    appearance:
      parsed.appearance === "light" ||
      parsed.appearance === "dark" ||
      parsed.appearance === "system"
        ? parsed.appearance
        : d.appearance,
    subtitleSize:
      parsed.subtitleSize === "sm" ||
      parsed.subtitleSize === "md" ||
      parsed.subtitleSize === "lg"
        ? parsed.subtitleSize
        : d.subtitleSize,
    showFooter:
      typeof parsed.showFooter === "boolean" ? parsed.showFooter : d.showFooter,
    clipboardAuto:
      typeof parsed.clipboardAuto === "boolean"
        ? parsed.clipboardAuto
        : d.clipboardAuto,
    downloadFolder:
      typeof parsed.downloadFolder === "string" ? parsed.downloadFolder : d.downloadFolder,
  };
}

export async function hydrateSettings(): Promise<EarSettings> {
  try {
    const raw = await Storage.getItem(KEY);
    if (raw) {
      cachedSettings = normalizeSettings(
        JSON.parse(raw) as Partial<EarSettings>,
      );
    }
  } catch {
    // ignore corrupt storage
  }
  return { ...cachedSettings };
}

export function getVideoTags(videoId: string): Record<number, BlindTag> {
  return { ...(cachedTagsByVideo[videoId] ?? {}) };
}

export function saveVideoTags(
  videoId: string,
  tags: Record<number, BlindTag>,
): void {
  cachedTagsByVideo = { ...cachedTagsByVideo, [videoId]: { ...tags } };
  void Storage.setItem(TAGS_KEY, JSON.stringify(cachedTagsByVideo)).catch(
    () => {},
  );
}

export async function hydrateAllVideoTags(): Promise<
  Record<string, Record<number, BlindTag>>
> {
  try {
    const raw = await Storage.getItem(TAGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<
        string,
        Record<number, BlindTag>
      >;
      if (parsed && typeof parsed === "object") {
        cachedTagsByVideo = parsed;
      }
    }
  } catch {
    // ignore
  }
  return { ...cachedTagsByVideo };
}
