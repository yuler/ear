import { colorScheme, effect, platform } from "nsh";
import { currentWindow, isAvailable, Menu } from "nsh/desktop";
import { isDevMode } from "./env";
import { mediaRoot, openDirectory } from "./library/paths";
import { settings, updateSettings } from "./ui/settings";
import { shellT } from "./ui/shellI18n";
import type { MediaTab } from "./ui/TopBar";

/**
 * The main window's chrome. Its size (default 1200×800, at least 800×560)
 * and restoring where the user left it come from nsh.json's `"window"`.
 */
export function setupWindowChrome(): void {
  if (!isAvailable) return;
  try {
    const win = currentWindow();
    if (platform.os === "macos") {
      win.set({ titleBar: { style: "hidden", height: 44 } });
    } else {
      Menu.setMenuBar("autoHide");
    }
  } catch {
    // outside a window (tests)
  }
}

function tabTitle(tab: MediaTab): string {
  const t = shellT();
  if (tab === "discover") return t.discover;
  if (tab === "library") return t.library;
  return t.settings;
}

/** Keeps the window title and the application menu in step with the page. */
export function installAppMenu(deps: {
  activeTab: () => MediaTab;
  selectTab: (tab: MediaTab) => void;
  toggleSettings: () => void;
  focusLink: () => void;
  readClipboard: () => void;
  toggleShortcuts: () => void;
}): void {
  effect(() => {
    if (!isAvailable) return;
    const tab = deps.activeTab();
    try {
      const prefix = isDevMode() ? "Ear [DEV]" : "Ear";
      currentWindow().set({ title: `${prefix} — ${tabTitle(tab)}` });
    } catch {
      // outside a window (tests)
    }

    if (platform.os !== "macos") {
      Menu.setApplicationMenu([]);
      return;
    }
    const t = shellT();
    Menu.setApplicationMenu([
      {
        label: "File",
        submenu: [
          { label: "Focus Link Field", shortcut: "mod+l", onSelect: deps.focusLink },
          { label: "Read Link from Clipboard", onSelect: deps.readClipboard },
          {
            label: "Open Download Folder",
            onSelect: () => void openDirectory(mediaRoot(settings().downloadFolder)),
          },
          { type: "separator" },
          { label: "Settings…", shortcut: "mod+,", onSelect: deps.toggleSettings },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: t.discover,
            shortcut: "mod+1",
            checked: tab === "discover",
            onSelect: () => deps.selectTab("discover"),
          },
          {
            label: t.library,
            shortcut: "mod+2",
            checked: tab === "library",
            onSelect: () => deps.selectTab("library"),
          },
          { type: "separator" },
          {
            label: "Switch Appearance",
            onSelect: () =>
              updateSettings({ appearance: colorScheme() === "dark" ? "light" : "dark" }),
          },
        ],
      },
      {
        label: "Window",
        submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "toggleFullScreen" }],
      },
      {
        label: "Help",
        submenu: [
          { label: "Keyboard Shortcuts", shortcut: "shift+/", onSelect: deps.toggleShortcuts },
        ],
      },
    ]);
  });
}
