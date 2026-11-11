import { expect, test } from "nsh/test";
import { settings, updateSettings } from "../ui/settings";
import { SettingsView } from "./SettingsView";

test("SettingsView exports valid component function", () => {
  expect(typeof SettingsView).toBe("function");
});

test("Settings store allows toggling preferences and updating settings values", () => {
  updateSettings({ appearance: "dark", language: "zh", sentenceLength: "long", clipboardAuto: false });
  expect(settings().appearance).toBe("dark");
  expect(settings().language).toBe("zh");
  expect(settings().sentenceLength).toBe("long");
  expect(settings().clipboardAuto).toBe(false);

  updateSettings({ appearance: "light", language: "en", sentenceLength: "short", clipboardAuto: true });
  expect(settings().appearance).toBe("light");
  expect(settings().language).toBe("en");
  expect(settings().sentenceLength).toBe("short");
  expect(settings().clipboardAuto).toBe(true);
});
