import { Storage } from "nsh";
import type { BlindTag } from "../modes/blindFlow";

export type EarSettings = {
  lastUrl: string;
  preferredRate: number;
  appearance?: "dark" | "light";
  sidebarOpen?: boolean;
};

const KEY = "ear.settings";
const TAGS_KEY = "ear.tags";

let cachedSettings: EarSettings = {
  lastUrl: "",
  preferredRate: 1,
  appearance: "dark",
  sidebarOpen: true,
};

let cachedTagsByVideo: Record<string, Record<number, BlindTag>> = {};

export function loadSettings(): EarSettings {
  return { ...cachedSettings };
}

export function saveSettings(settings: EarSettings): void {
  cachedSettings = { ...cachedSettings, ...settings };
  void Storage.setItem(KEY, JSON.stringify(cachedSettings)).catch(() => {});
}

export async function hydrateSettings(): Promise<EarSettings> {
  try {
    const raw = await Storage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EarSettings>;
      cachedSettings = {
        lastUrl: typeof parsed.lastUrl === "string" ? parsed.lastUrl : "",
        preferredRate:
          typeof parsed.preferredRate === "number" ? parsed.preferredRate : 1,
        appearance:
          parsed.appearance === "light" || parsed.appearance === "dark"
            ? parsed.appearance
            : "dark",
        sidebarOpen:
          typeof parsed.sidebarOpen === "boolean" ? parsed.sidebarOpen : true,
      };
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
