import { Clipboard, platform } from "nsh";
import type { LibraryEntry } from "../library/types";
import type { ContextMenuEntry } from "../ui/ActionContextMenu";
import { shellT, type ShellMessages } from "../ui/shellI18n";
import { showToast } from "../ui/Toast";
import type { DiscoverItem } from "./discover/types";

export async function copyUrlWithToast(url: string): Promise<void> {
  if (!url) return;
  try {
    await Clipboard.writeText(url);
    showToast(shellT().linkCopied, "info");
  } catch {
    // clipboard unavailable
  }
}

function deleteShortcutKey(): string {
  return platform.os === "macos" ? "backspace" : "delete";
}

export type LibraryContextMenuOptions = {
  entry: LibraryEntry;
  selectionMode: boolean;
  checked: boolean;
  selectedCount: number;
  allVisibleSelected: boolean;
  canDelete: boolean;
  messages?: ShellMessages;
  onPlay: () => void;
  onOpenFolder: () => void;
  onCopyLink: () => void;
  onEnterSelect: () => void;
  onToggleItemSelect: () => void;
  onToggleSelectAll: () => void;
  onDeleteItem: () => void;
  onDeleteSelected: () => void;
};

/** Builds right-click context menu items (with SVG icons) for a Home Library card. */
export function buildLibraryContextMenu(
  opts: LibraryContextMenuOptions,
): (ContextMenuEntry | null)[] {
  const t = opts.messages ?? shellT();
  const hasUrl = Boolean(opts.entry.url);

  if (opts.selectionMode) {
    const deleteBatch = opts.selectedCount > 0;
    return [
      {
        label: opts.checked ? t.deselectItem : t.selectItem,
        icon: "check-square",
        checked: opts.checked,
        onSelect: opts.onToggleItemSelect,
      },
      {
        label: opts.allVisibleSelected ? t.deselectAll : t.selectAll,
        icon: "list-checks",
        shortcut: "a",
        onSelect: opts.onToggleSelectAll,
      },
      { type: "separator" },
      { label: t.playItem, icon: "play", onSelect: opts.onPlay },
      {
        label: t.openFolder,
        icon: "folder",
        shortcut: "o",
        onSelect: opts.onOpenFolder,
      },
      hasUrl
        ? { label: t.copyLink, icon: "link", onSelect: opts.onCopyLink }
        : null,
      opts.canDelete ? { type: "separator" } : null,
      opts.canDelete
        ? {
            label: deleteBatch
              ? `${t.deleteSelected} (${opts.selectedCount})`
              : t.delete,
            icon: "trash",
            shortcut: deleteShortcutKey(),
            destructive: true,
            onSelect: deleteBatch ? opts.onDeleteSelected : opts.onDeleteItem,
          }
        : null,
    ];
  }

  return [
    {
      label: t.playItem,
      icon: "play",
      shortcut: "enter",
      onSelect: opts.onPlay,
    },
    {
      label: t.openFolder,
      icon: "folder",
      shortcut: "o",
      onSelect: opts.onOpenFolder,
    },
    hasUrl
      ? { label: t.copyLink, icon: "link", onSelect: opts.onCopyLink }
      : null,
    { type: "separator" },
    {
      label: t.multiSelect,
      icon: "list-checks",
      shortcut: "s",
      onSelect: opts.onEnterSelect,
    },
    opts.canDelete ? { type: "separator" } : null,
    opts.canDelete
      ? {
          label: t.delete,
          icon: "trash",
          shortcut: deleteShortcutKey(),
          destructive: true,
          onSelect: opts.onDeleteItem,
        }
      : null,
  ];
}

export type DiscoverContextMenuOptions = {
  item: DiscoverItem;
  downloadedEntry: LibraryEntry | null;
  messages?: ShellMessages;
  onOpen: () => void;
  onOpenFolder?: () => void;
  onCopyLink: () => void;
};

/** Builds right-click context menu items (with SVG icons) for a Home Discover card. */
export function buildDiscoverContextMenu(
  opts: DiscoverContextMenuOptions,
): (ContextMenuEntry | null)[] {
  const t = opts.messages ?? shellT();
  const isDownloaded = Boolean(opts.downloadedEntry);
  return [
    {
      label: isDownloaded ? t.playItem : t.configureDownload,
      icon: isDownloaded ? "play" : "download",
      onSelect: opts.onOpen,
    },
    isDownloaded && opts.onOpenFolder
      ? { label: t.openFolder, icon: "folder", onSelect: opts.onOpenFolder }
      : null,
    opts.item.url
      ? { label: t.copyLink, icon: "link", onSelect: opts.onCopyLink }
      : null,
  ];
}
