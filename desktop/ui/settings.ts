import { setColorScheme, signal } from "nsh";
import {
  DEFAULT_SETTINGS,
  hydrateSettings,
  saveSettings,
  type EarLocale,
  type EarSettings,
  type SentenceLengthMode,
} from "../store";

export type { EarLocale, SentenceLengthMode };

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
