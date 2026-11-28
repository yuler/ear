import { Storage } from "nsh";

export type Appearance = "dark" | "light" | "system";
export type SentenceLengthMode = "short" | "medium" | "long";
export type EarLocale = "en" | "zh";
export type DefaultQuality = "360p" | "720p" | "1080p" | "audio";

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
  appearance: Appearance;
  /** Display language for buttons and labels. */
  language: EarLocale;
  /** Sentence segmentation length; the player remembers the last choice here. */
  sentenceLength: SentenceLengthMode;
  /** Default download quality (360p keeps downloads small and fast). */
  defaultQuality: DefaultQuality;
  /** Read the system clipboard for YouTube links on launch / focus. */
  clipboardAuto: boolean;
  /** Where video/audio files are saved. Empty string → ~/Downloads. */
  downloadFolder: string;
  /** Subtitle blocker enabled state. */
  subtitleBlockerEnabled: boolean;
  /** Global default position & size for subtitle blocker (percentages). */
  subtitleBlockerDefault: SubtitleBlockerRect;
  /** Per-video customized blocker positions. */
  subtitleBlockerVideos: Record<string, SubtitleBlockerRect>;
  /** Start the LAN mirror service again the next time the app opens. */
  mirrorEnabled: boolean;
};

const KEY = "ear.settings";

export const DEFAULT_SETTINGS: EarSettings = {
  lastUrl: "",
  appearance: "dark",
  language: "en",
  sentenceLength: "short",
  defaultQuality: "360p",
  clipboardAuto: true,
  downloadFolder: "",
  subtitleBlockerEnabled: false,
  subtitleBlockerDefault: { ...DEFAULT_BLOCKER_RECT },
  subtitleBlockerVideos: {},
  mirrorEnabled: false,
};

let cachedSettings: EarSettings = { ...DEFAULT_SETTINGS };

export function saveSettings(settings: Partial<EarSettings>): void {
  cachedSettings = { ...cachedSettings, ...settings };
  void Storage.setItem(KEY, JSON.stringify(cachedSettings)).catch(() => {});
}

/**
 * Validate untrusted stored JSON into a complete settings object.
 * Retired keys (libraryLayout, subtitleSize, showFooter, preferredRate,
 * blocker style params) are dropped; the retired "480p" quality and any
 * unknown quality migrate to "360p".
 */
export function normalizeSettings(parsed: Partial<EarSettings>): EarSettings {
  const d = DEFAULT_SETTINGS;
  return {
    lastUrl: typeof parsed.lastUrl === "string" ? parsed.lastUrl : d.lastUrl,
    appearance:
      parsed.appearance === "light" ||
      parsed.appearance === "dark" ||
      parsed.appearance === "system"
        ? parsed.appearance
        : d.appearance,
    language: parsed.language === "zh" ? "zh" : "en",
    sentenceLength:
      parsed.sentenceLength === "medium" ||
      parsed.sentenceLength === "long" ||
      parsed.sentenceLength === "short"
        ? parsed.sentenceLength
        : d.sentenceLength,
    defaultQuality:
      parsed.defaultQuality === "1080p" ||
      parsed.defaultQuality === "720p" ||
      parsed.defaultQuality === "audio"
        ? parsed.defaultQuality
        : "360p",
    clipboardAuto:
      typeof parsed.clipboardAuto === "boolean"
        ? parsed.clipboardAuto
        : d.clipboardAuto,
    downloadFolder:
      typeof parsed.downloadFolder === "string"
        ? parsed.downloadFolder
        : d.downloadFolder,
    subtitleBlockerEnabled:
      typeof parsed.subtitleBlockerEnabled === "boolean"
        ? parsed.subtitleBlockerEnabled
        : d.subtitleBlockerEnabled,
    subtitleBlockerDefault: isValidRect(parsed.subtitleBlockerDefault)
      ? { ...parsed.subtitleBlockerDefault }
      : { ...d.subtitleBlockerDefault },
    subtitleBlockerVideos:
      parsed.subtitleBlockerVideos &&
      typeof parsed.subtitleBlockerVideos === "object"
        ? normalizeBlockerVideos(parsed.subtitleBlockerVideos)
        : {},
    mirrorEnabled: parsed.mirrorEnabled === true,
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
