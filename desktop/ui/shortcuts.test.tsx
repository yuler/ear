import { expect, open, test } from "nsh/test";
import {
  formatKeystroke,
  getShortcutCategories,
  getShortcutsCopy,
  SHORTCUT_CATEGORIES,
} from "./shortcuts";
import { ShortcutsModal } from "./ShortcutsModal";

test("SHORTCUT_CATEGORIES covers the global, player and list domains in both locales", () => {
  expect(SHORTCUT_CATEGORIES.map((c) => c.key)).toEqual(["global", "player", "list"]);
  const global = SHORTCUT_CATEGORIES[0].shortcuts.map((s) => s.keystroke);
  expect(global).toContain("mod+1");
  expect(global).toContain("mod+2");
  expect(global).not.toContain("mod+3");

  for (const locale of ["en", "zh"] as const) {
    const categories = getShortcutCategories(locale);
    expect(categories.map((c) => c.key)).toEqual(["global", "player", "list"]);
    expect(getShortcutsCopy(locale).title.length > 0).toBe(true);
    for (const cat of categories) {
      expect(cat.title.length > 0).toBe(true);
      expect(cat.shortcuts.length > 0).toBe(true);
      for (const sc of cat.shortcuts) {
        expect(Boolean(sc.id)).toBe(true);
        expect(Boolean(sc.label)).toBe(true);
        expect(sc.keys.length > 0).toBe(true);
      }
    }
  }
});

test("formatKeystroke adapts to macOS vs Linux / Windows automatically", () => {
  expect(formatKeystroke("mod+1", "macos")).toBe("⌘1");
  expect(formatKeystroke("mod+l", "macos")).toBe("⌘L");
  expect(formatKeystroke("mod+,", "macos")).toBe("⌘,");
  expect(formatKeystroke("alt+1", "macos")).toBe("⌥1");
  expect(formatKeystroke("Backspace", "macos")).toBe("⌫");
  expect(formatKeystroke("Delete", "macos")).toBe("⌦");

  expect(formatKeystroke("mod+1", "linux")).toBe("Ctrl+1");
  expect(formatKeystroke("mod+l", "linux")).toBe("Ctrl+L");
  expect(formatKeystroke("mod+,", "linux")).toBe("Ctrl+,");
  expect(formatKeystroke("alt+1", "linux")).toBe("Alt+1");
  expect(formatKeystroke("Backspace", "linux")).toBe("Backspace");
  expect(formatKeystroke("Delete", "linux")).toBe("Del");
  expect(formatKeystroke("shift+/", "linux")).toBe("?");
  expect(formatKeystroke("escape", "linux")).toBe("Esc");
});

test("ShortcutsModal traps Space, Enter, Delete, Backspace without affecting background state", async () => {
  const app = await open("../App.tsx");

  // Open shortcuts modal with '?'
  await app.keyboard.press("shift+/");
  await app.waitFor("Keyboard Shortcuts");
  expect(app.texts().some((t) => t.includes("Keyboard Shortcuts"))).toBe(true);

  // Pressing Space, Enter, Delete, Backspace while modal is open should not crash or trigger background actions
  await app.keyboard.press("space");
  await app.keyboard.press("enter");
  await app.keyboard.press("delete");
  await app.keyboard.press("backspace");
  await app.keyboard.press("o");

  // Modal remains open and stable
  expect(app.texts().some((t) => t.includes("Keyboard Shortcuts"))).toBe(true);

  // Press Escape to close modal
  await app.keyboard.press("escape");
  expect(app.texts().every((t) => t !== "Keyboard Shortcuts")).toBe(true);
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
  await app.waitFor("Keyboard Shortcuts");
  expect(app.texts().some((t) => t.includes("Keyboard Shortcuts"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Player is Active"))).toBe(true);

  // 5. While modal is open over player, Delete and Enter must not affect underlying state
  await app.keyboard.press("delete");
  await app.keyboard.press("enter");
  expect(app.texts().some((t) => t.includes("Video v1"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Item Was Opened"))).toBe(false);

  // 6. Press Escape: MUST close only the modal, keeping player open!
  await app.keyboard.press("escape");
  await app.waitFor("Player is Active");
  expect(app.texts().every((t) => t !== "Keyboard Shortcuts")).toBe(true);
  expect(app.texts().some((t) => t.includes("Player is Active"))).toBe(true);

  // 7. Press Escape again: closes player, returning to library
  await app.keyboard.press("escape");
  await app.waitFor("Player is Inactive");
  expect(app.texts().some((t) => t.includes("Player is Inactive"))).toBe(true);

  // 8. Now back in library with no overlay: Delete asks, then deletes the focused entry
  app.onDialog(() => "Delete");
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
  await app.waitFor("Your library is empty");

  // Key operations on empty list must be safe no-ops
  await app.keyboard.press("down");
  await app.keyboard.press("up");
  await app.keyboard.press("enter");
  await app.keyboard.press("delete");
  expect(app.texts().some((t) => t.includes("Your library is empty"))).toBe(true);
});

test("ShortcutsModal exports valid component", () => {
  expect(typeof ShortcutsModal).toBe("function");
});

test("Keyboard shortcuts trigger modal via shift+/ and switch Library / Discover", async () => {
  const app = await open("../App.tsx");

  await app.keyboard.press("shift+/");
  await app.waitFor("Keyboard Shortcuts");
  expect(app.texts().some((t) => t.includes("Navigation"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Library & Cards"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Player & Listening"))).toBe(true);

  await app.keyboard.press("escape");
  expect(app.texts().every((t) => t !== "Keyboard Shortcuts")).toBe(true);

  // Starts on Library; mod+2 opens Discover page.
  await app.waitFor("Your library is empty");
  await app.keyboard.press("mod+2");
  await app.waitFor("label:Japanese");
  expect(app.texts().some((t) => t.includes("Your library is empty"))).toBe(false);

  // mod+1 returns to Library.
  await app.keyboard.press("mod+1");
  await app.waitFor("Your library is empty");
});
