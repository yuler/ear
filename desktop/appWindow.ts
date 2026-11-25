import { colorScheme, effect, platform } from "nsh";
import { currentWindow, isAvailable, Menu } from "nsh/desktop";
import { isDevMode } from "./env";
import { mediaRoot, openDirectory } from "./library/paths";
import { settings, updateSettings } from "./ui/settings";
import { shellT } from "./ui/shellI18n";
import type { AppPage } from "./ui/TopBar";

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

function pageTitle(page: AppPage): string {
  const t = shellT();
  return page === "discover" ? t.discover : t.library;
}

/** Keeps the window title and the application menu in step with the page. */
export function installAppMenu(deps: {
  activePage: () => AppPage;
  selectPage: (page: AppPage) => void;
  toggleSettings: () => void;
  focusLink: () => void;
  readClipboard: () => void;
  toggleShortcuts: () => void;
}): void {
  effect(() => {
    if (!isAvailable) return;
    const page = deps.activePage();
    try {
      const prefix = isDevMode() ? "Ear [DEV]" : "Ear";
      currentWindow().set({ title: `${prefix} — ${pageTitle(page)}` });
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
          { label: "Search or Paste Link", shortcut: "mod+l", onSelect: deps.focusLink },
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
            label: t.library,
            shortcut: "mod+1",
            checked: page === "library",
            onSelect: () => deps.selectPage("library"),
          },
          {
            label: t.discover,
            shortcut: "mod+2",
            checked: page === "discover",
            onSelect: () => deps.selectPage("discover"),
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
