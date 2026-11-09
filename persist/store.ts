/** Placeholder — module 4: local progress / settings. */
export type EarSettings = {
  lastUrl: string;
  preferredRate: number;
};

const KEY = "ear.settings";

export function loadSettings(): EarSettings {
  // Storage wire-up in module 4
  void KEY;
  return { lastUrl: "", preferredRate: 1 };
}

export function saveSettings(_settings: EarSettings): void {
  void _settings;
}
