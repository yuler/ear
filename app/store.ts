import { Storage } from "nsh";
import type { BlindTag } from "./views/blindFlowLogic";
import type { PlaybackRate } from "./player";

export type Appearance = "dark" | "light" | "system";
export type SubtitleSize = "sm" | "md" | "lg";
export type LibraryLayoutMode = "post" | "grade" | "list";
export type SentenceLengthMode = "short" | "medium" | "long";
export type EarLocale = "en" | "zh";
export type DefaultQuality = "360p" | "480p" | "720p" | "1080p" | "audio";
export type SubtitleBlockerStyle =
  | "mosaic"
  | "blur"
  | "solid"
  | "feather"
  | "frosted";

export interface SubtitleBlockerRect {
  x: number; // 0..100
  y: number; // 0..100
  width: number; // 0..100
  height: number; // 0..100
}

export const DEFAULT_BLOCKER_RECT: SubtitleBlockerRect = {
  x: 10,
  y: 82,
  width: 80,
  height: 12,
};

export type EarSettings = {
  lastUrl: string;
  /** Initial playback rate for Blind Flow and Loop Dojo. */
  preferredRate: PlaybackRate;
  appearance: Appearance;
  /** Display language for buttons and labels ("en" English first, or "zh" Chinese). */
  language: EarLocale;
  subtitleSize: SubtitleSize;
  /** Sentence segmentation length: short for beginner training, medium, long. */
  sentenceLength: SentenceLengthMode;
  /** Default video quality preference (defaults to "360p" for fast download & mobile sync). */
  defaultQuality: DefaultQuality;
  /** Bottom keyboard-shortcut hint bar. */
  showFooter: boolean;
  /** Read the system clipboard for YouTube links on launch / focus. */
  clipboardAuto: boolean;
  /**
   * Where video/audio files are saved. Empty string → ~/Downloads
   * (Downbit-style default folder).
   */
  downloadFolder: string;
  /** Library view arrangement mode: "post" (large posters), "grade" (Windows picture tiles), "list". */
  libraryLayout: LibraryLayoutMode;
  /** Subtitle blocker enabled state. */
  subtitleBlockerEnabled: boolean;
  /** Subtitle blocker visual style: "mosaic" (enlarged pixel blocks), "blur" (frosted blur), or "solid" (solid black). */
  subtitleBlockerStyle: SubtitleBlockerStyle;
  /** Subtitle blocker background opacity percentage (0 ~ 100). */
  subtitleBlockerOpacity: number;
  /** Subtitle blocker mosaic pixel block size in points (8 ~ 40). */
  subtitleBlockerMosaic?: number;
  /** Subtitle blocker Gaussian blur radius in points (0 ~ 120). */
  subtitleBlockerBlur?: number;
  /** Subtitle blocker edge feather percentage (legacy). */
  subtitleBlockerFeather?: number;
  /** Global default position & size for subtitle blocker (percentages). */
  subtitleBlockerDefault: SubtitleBlockerRect;
  /** Per-video customized blocker positions. */
  subtitleBlockerVideos: Record<string, SubtitleBlockerRect>;
};

const KEY = "ear.settings";
const TAGS_KEY = "ear.tags";

export const DEFAULT_SETTINGS: EarSettings = {
  lastUrl: "",
  preferredRate: 1,
  appearance: "dark",
  language: "en",
  subtitleSize: "md",
  sentenceLength: "short",
  defaultQuality: "360p",
  showFooter: false,
  clipboardAuto: true,
  downloadFolder: "",
  libraryLayout: "post",
  subtitleBlockerEnabled: false,
  subtitleBlockerStyle: "mosaic",
  subtitleBlockerOpacity: 85,
  subtitleBlockerMosaic: 16,
  subtitleBlockerBlur: 28,
  subtitleBlockerFeather: 20,
  subtitleBlockerDefault: { ...DEFAULT_BLOCKER_RECT },
  subtitleBlockerVideos: {},
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
      parsed.preferredRate === 1.2 ||
      parsed.preferredRate === 1.5 ||
      parsed.preferredRate === 2
        ? parsed.preferredRate
        : d.preferredRate,
    appearance:
      parsed.appearance === "light" ||
      parsed.appearance === "dark" ||
      parsed.appearance === "system"
        ? parsed.appearance
        : d.appearance,
    language: parsed.language === "zh" ? "zh" : "en",
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
    libraryLayout:
      parsed.libraryLayout === "grade" ||
      parsed.libraryLayout === "post" ||
      parsed.libraryLayout === "list"
        ? parsed.libraryLayout
        : d.libraryLayout,
    sentenceLength:
      parsed.sentenceLength === "medium" ||
      parsed.sentenceLength === "long" ||
      parsed.sentenceLength === "short"
        ? parsed.sentenceLength
        : d.sentenceLength,
    defaultQuality:
      parsed.defaultQuality === "1080p" ||
      parsed.defaultQuality === "720p" ||
      parsed.defaultQuality === "480p" ||
      parsed.defaultQuality === "360p" ||
      parsed.defaultQuality === "audio"
        ? parsed.defaultQuality
        : d.defaultQuality,
    subtitleBlockerEnabled:
      typeof parsed.subtitleBlockerEnabled === "boolean"
        ? parsed.subtitleBlockerEnabled
        : d.subtitleBlockerEnabled,
    subtitleBlockerStyle:
      parsed.subtitleBlockerStyle === "solid"
        ? "solid"
        : parsed.subtitleBlockerStyle === "blur" ||
            parsed.subtitleBlockerStyle === "frosted"
          ? "blur"
          : "mosaic",
    subtitleBlockerOpacity:
      typeof parsed.subtitleBlockerOpacity === "number" &&
      parsed.subtitleBlockerOpacity >= 0 &&
      parsed.subtitleBlockerOpacity <= 100
        ? Math.round(parsed.subtitleBlockerOpacity)
        : d.subtitleBlockerOpacity,
    subtitleBlockerMosaic:
      typeof parsed.subtitleBlockerMosaic === "number" &&
      parsed.subtitleBlockerMosaic >= 6 &&
      parsed.subtitleBlockerMosaic <= 60
        ? Math.round(parsed.subtitleBlockerMosaic)
        : d.subtitleBlockerMosaic,
    subtitleBlockerBlur:
      typeof parsed.subtitleBlockerBlur === "number" &&
      parsed.subtitleBlockerBlur >= 0 &&
      parsed.subtitleBlockerBlur <= 120
        ? Math.round(parsed.subtitleBlockerBlur)
        : d.subtitleBlockerBlur,
    subtitleBlockerFeather:
      typeof parsed.subtitleBlockerFeather === "number" &&
      parsed.subtitleBlockerFeather >= 0 &&
      parsed.subtitleBlockerFeather <= 50
        ? Math.round(parsed.subtitleBlockerFeather)
        : d.subtitleBlockerFeather,
    subtitleBlockerDefault: isValidRect(parsed.subtitleBlockerDefault)
      ? { ...parsed.subtitleBlockerDefault }
      : { ...d.subtitleBlockerDefault },
    subtitleBlockerVideos:
      parsed.subtitleBlockerVideos &&
      typeof parsed.subtitleBlockerVideos === "object"
        ? normalizeBlockerVideos(parsed.subtitleBlockerVideos)
        : {},
  };
}

function isValidRect(r: unknown): r is SubtitleBlockerRect {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    typeof o.width === "number" &&
    typeof o.height === "number"
  );
}

function normalizeBlockerVideos(
  dict: Record<string, unknown>,
): Record<string, SubtitleBlockerRect> {
  const result: Record<string, SubtitleBlockerRect> = {};
  for (const [k, v] of Object.entries(dict)) {
    if (typeof k === "string" && isValidRect(v)) {
      result[k] = { ...v };
    }
  }
  return result;
}

export function getCachedSettings(): EarSettings {
  return { ...cachedSettings };
}

export function getBlockerRect(videoId?: string): SubtitleBlockerRect {
  if (videoId && cachedSettings.subtitleBlockerVideos[videoId]) {
    return { ...cachedSettings.subtitleBlockerVideos[videoId] };
  }
  return { ...cachedSettings.subtitleBlockerDefault };
}

export function saveBlockerRect(
  rect: SubtitleBlockerRect,
  videoId?: string,
): void {
  const clamped: SubtitleBlockerRect = {
    x: Math.max(0, Math.min(100, Math.round(rect.x * 10) / 10)),
    y: Math.max(0, Math.min(100, Math.round(rect.y * 10) / 10)),
    width: Math.max(5, Math.min(100, Math.round(rect.width * 10) / 10)),
    height: Math.max(2, Math.min(100, Math.round(rect.height * 10) / 10)),
  };
  if (videoId) {
    saveSettings({
      subtitleBlockerVideos: {
        ...cachedSettings.subtitleBlockerVideos,
        [videoId]: clamped,
      },
    });
  } else {
    saveSettings({
      subtitleBlockerDefault: clamped,
    });
  }
}

export function resetBlockerRect(videoId?: string): SubtitleBlockerRect {
  if (videoId && cachedSettings.subtitleBlockerVideos[videoId]) {
    const updated = { ...cachedSettings.subtitleBlockerVideos };
    delete updated[videoId];
    saveSettings({ subtitleBlockerVideos: updated });
  }
  return { ...cachedSettings.subtitleBlockerDefault };
}

export function setBlockerEnabled(enabled: boolean): void {
  saveSettings({ subtitleBlockerEnabled: enabled });
}

export function setBlockerStyle(style: SubtitleBlockerStyle): void {
  saveSettings({ subtitleBlockerStyle: style });
}

export function setBlockerOpacity(opacity: number): void {
  saveSettings({ subtitleBlockerOpacity: Math.max(0, Math.min(100, Math.round(opacity))) });
}

export function setBlockerMosaic(size: number): void {
  saveSettings({
    subtitleBlockerMosaic: Math.max(8, Math.min(48, Math.round(size))),
  });
}

export function setBlockerBlur(blur: number): void {
  saveSettings({
    subtitleBlockerBlur: Math.max(5, Math.min(80, Math.round(blur))),
  });
}

export function setBlockerFeather(feather: number): void {
  setBlockerMosaic(feather);
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
