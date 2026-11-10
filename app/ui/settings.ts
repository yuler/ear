import { setColorScheme, signal } from "nsh";
import {
  DEFAULT_SETTINGS,
  hydrateSettings,
  saveSettings,
  type EarSettings,
  type SubtitleSize,
} from "../store";

/** App-wide reactive settings; read anywhere, write through `updateSettings`. */
export const settings = signal<EarSettings>({ ...DEFAULT_SETTINGS });

export function updateSettings(patch: Partial<EarSettings>): void {
  const next = { ...settings(), ...patch };
  settings.set(next);
  saveSettings(patch);
  if (patch.appearance) setColorScheme(patch.appearance);
}

/** Load persisted settings once on startup and apply the appearance. */
export async function initSettings(): Promise<EarSettings> {
  const loaded = await hydrateSettings();
  settings.set(loaded);
  setColorScheme(loaded.appearance);
  return loaded;
}

/** Caption text classes for the current-sentence focal text. */
export function subtitleClass(size: SubtitleSize): string {
  if (size === "sm") return "text-lg leading-relaxed";
  if (size === "lg") return "text-3xl leading-snug";
  return "text-2xl leading-relaxed";
}
