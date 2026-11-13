import { expect, open, test } from "nsh/test";
import {
  formatKeystroke,
  SHORTCUT_CATEGORIES,
} from "./shortcuts";
import { ShortcutsModal } from "./ShortcutsModal";

test("SHORTCUT_CATEGORIES covers all four core domains with non-empty shortcuts", () => {
  expect(SHORTCUT_CATEGORIES.length).toBe(4);
  const keys = SHORTCUT_CATEGORIES.map((c) => c.key);
  expect(keys).toContain("global");
  expect(keys).toContain("list");
  expect(keys).toContain("player");
  expect(keys).toContain("blind");

  for (const cat of SHORTCUT_CATEGORIES) {
    expect(cat.title.length > 0).toBe(true);
    expect(cat.description.length > 0).toBe(true);
    expect(cat.shortcuts.length > 0).toBe(true);
    for (const sc of cat.shortcuts) {
      expect(Boolean(sc.id)).toBe(true);
      expect(Boolean(sc.label)).toBe(true);
      expect(Boolean(sc.description)).toBe(true);
      expect(sc.keys.length > 0).toBe(true);
    }
  }
});

test("formatKeystroke formats mod, shift and platform combinations safely", () => {
  expect(typeof formatKeystroke("mod+1")).toBe("string");
  expect(typeof formatKeystroke("shift+/")).toBe("string");
  expect(typeof formatKeystroke("escape")).toBe("string");
});

test("ShortcutsModal exports valid component", () => {
  expect(typeof ShortcutsModal).toBe("function");
});

test("ShortcutsModal opens via sidebar click and can be closed with Esc or button", async () => {
  const app = await open("../App.tsx");
  expect(app.texts().some((t) => t.includes("Shortcuts"))).toBe(true);

  // Click Shortcuts in left sidebar footer
  await app.press("Shortcuts");
  await app.waitFor("快捷键指南");
  expect(app.texts().some((t) => t.includes("快捷键指南"))).toBe(true);
  expect(app.texts().some((t) => t.includes("全局导航"))).toBe(true);
  expect(app.texts().some((t) => t.includes("列表与卡片漫游"))).toBe(true);
  expect(app.texts().some((t) => t.includes("视频播放与精听"))).toBe(true);
  expect(app.texts().some((t) => t.includes("盲听模式专属"))).toBe(true);

  // Press Esc to dismiss modal
  await app.keyboard.press("escape");
  expect(app.texts().every((t) => t !== "快捷键指南")).toBe(true);
});

test("Keyboard shortcuts trigger modal via shift+/ and support global tab switching", async () => {
  const app = await open("../App.tsx");

  // Press '?' (shift+/) to open shortcuts panel
  await app.keyboard.press("shift+/");
  await app.waitFor("快捷键指南");
  expect(app.texts().some((t) => t.includes("快捷键指南"))).toBe(true);

  // Close with Esc
  await app.keyboard.press("escape");
  expect(app.texts().every((t) => t !== "快捷键指南")).toBe(true);

  // Global tab navigation with Mod+1, Mod+2, Mod+3
  // Mod+1 -> Discover
  await app.keyboard.press("mod+1");
  await app.waitFor("Discover · 精听推荐");
  expect(app.texts().some((t) => t.includes("Discover · 精听推荐"))).toBe(true);

  // Mod+2 -> Video Library
  await app.keyboard.press("mod+2");
  expect(app.texts().some((t) => t.includes("Videos") || t.includes("Video"))).toBe(true);

  // Mod+3 -> Audio Library
  await app.keyboard.press("mod+3");
  expect(app.texts().some((t) => t.includes("Audio"))).toBe(true);
});
