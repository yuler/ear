import { keymap } from "nsh";
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

test("ShortcutsModal traps Space, Enter, Delete, Backspace without affecting background state", async () => {
  const app = await open("../App.tsx");

  // Open shortcuts modal with '?'
  await app.keyboard.press("shift+/");
  await app.waitFor("快捷键指南");
  expect(app.texts().some((t) => t.includes("快捷键指南"))).toBe(true);

  // Pressing Space, Enter, Delete, Backspace while modal is open should not crash or trigger background actions
  await app.keyboard.press("space");
  await app.keyboard.press("enter");
  await app.keyboard.press("delete");
  await app.keyboard.press("backspace");
  await app.keyboard.press("o");

  // Modal remains open and stable
  expect(app.texts().some((t) => t.includes("快捷键指南"))).toBe(true);

  // Press Escape to close modal
  await app.keyboard.press("escape");
  expect(app.texts().every((t) => t !== "快捷键指南")).toBe(true);
});

test("Overlay hierarchy: guide-over-player Escape closes only modal, and player prevents background deletion", async () => {
  const app = await open("./overlayFixture.tsx");
  expect(app.texts().some((t) => t.includes("Player is Inactive"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Modal is Inactive"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Video v1"))).toBe(true);

  // 1. Focus an entry with Down arrow in Library
  await app.keyboard.press("down");

  // 2. Open player
  await app.press("Open Player");
  await app.waitFor("Player is Active");
  expect(app.texts().some((t) => t.includes("Player is Active"))).toBe(true);

  // 3. While player is open, Backspace or Delete MUST NOT trigger deleteEntry
  await app.keyboard.press("delete");
  await app.keyboard.press("backspace");
  expect(app.texts().some((t) => t.includes("Video v1"))).toBe(true);

  // 4. Open Shortcuts guide over the active player via keyboard shortcut '?'
  await app.keyboard.press("shift+/");
  await app.waitFor("快捷键指南");
  expect(app.texts().some((t) => t.includes("快捷键指南"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Player is Active"))).toBe(true);

  // 5. While modal is open over player, Delete and Enter must not affect underlying state
  await app.keyboard.press("delete");
  await app.keyboard.press("enter");
  expect(app.texts().some((t) => t.includes("Video v1"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Item Was Opened"))).toBe(false);

  // 6. Press Escape: MUST close only the modal, keeping player open!
  await app.keyboard.press("escape");
  await app.waitFor("Player is Active");
  expect(app.texts().every((t) => t !== "快捷键指南")).toBe(true);
  expect(app.texts().some((t) => t.includes("Player is Active"))).toBe(true);

  // 7. Press Escape again: closes player, returning to library
  await app.keyboard.press("escape");
  await app.waitFor("Player is Inactive");
  expect(app.texts().some((t) => t.includes("Player is Inactive"))).toBe(true);

  // 8. Now back in library with no overlay: pressing Delete deletes the focused entry
  await app.keyboard.press("delete");
  await app.waitFor("Video v2");
  expect(app.texts().some((t) => t.includes("Video v1"))).toBe(false);
});

test("Overlay hierarchy: guide-over-list suppresses Enter and Delete, and Escape closes modal", async () => {
  const app = await open("./overlayFixture.tsx");

  // Focus an entry
  await app.keyboard.press("down");

  // Open modal over list
  await app.press("Open Modal");
  await app.waitFor("Modal is Active");

  // Enter and Delete must be suppressed
  await app.keyboard.press("enter");
  await app.keyboard.press("delete");
  await app.keyboard.press("backspace");
  expect(app.texts().some((t) => t.includes("Item Was Opened"))).toBe(false);
  expect(app.texts().some((t) => t.includes("Video v1"))).toBe(true);

  // Escape closes modal
  await app.keyboard.press("escape");
  await app.waitFor("Modal is Inactive");

  // Enter now opens entry
  await app.keyboard.press("enter");
  await app.waitFor("Item Was Opened");
  expect(app.texts().some((t) => t.includes("Item Was Opened"))).toBe(true);
});

test("Cursor clamping: shrinking list clamps cursor to valid bounds and empty list resets safely", async () => {
  const app = await open("./overlayFixture.tsx");

  // Focus index 2 (third item)
  await app.keyboard.press("down");
  await app.keyboard.press("down");
  await app.keyboard.press("down");

  // Shrink entries from 3 to 1
  await app.press("Shrink Entries");

  // Enter should open the clamped index 0 item
  await app.keyboard.press("enter");
  await app.waitFor("Item Was Opened");
  expect(app.texts().some((t) => t.includes("Item Was Opened"))).toBe(true);

  // Up key must not decrement into out-of-bounds index
  await app.keyboard.press("up");
  await app.keyboard.press("enter");
  expect(app.texts().some((t) => t.includes("Item Was Opened"))).toBe(true);

  // Clear all entries to empty list
  await app.press("Clear Entries");
  await app.waitFor("暂无下载视频。在上方粘贴 YouTube 链接即可开始下载。");

  // Key operations on empty list must be safe no-ops
  await app.keyboard.press("down");
  await app.keyboard.press("up");
  await app.keyboard.press("enter");
  await app.keyboard.press("delete");
  expect(app.texts().some((t) => t.includes("暂无下载视频。在上方粘贴 YouTube 链接即可开始下载。"))).toBe(true);
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
