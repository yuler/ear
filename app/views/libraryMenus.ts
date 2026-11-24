import { Clipboard, platform } from "nsh";
import type { MenuItem } from "nsh/desktop";
import type { LibraryEntry } from "../library/types";
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

/** Builds right-click context menu items for a Home Library card. */
export function buildLibraryContextMenu(
  opts: LibraryContextMenuOptions,
): (MenuItem | null)[] {
  const t = opts.messages ?? shellT();
  const hasUrl = Boolean(opts.entry.url);

  if (opts.selectionMode) {
    const deleteBatch = opts.selectedCount > 0;
    return [
      {
        label: opts.checked ? t.deselectItem : t.selectItem,
        checked: opts.checked,
        onSelect: opts.onToggleItemSelect,
      },
      {
        label: opts.allVisibleSelected ? t.deselectAll : t.selectAll,
        shortcut: "a",
        onSelect: opts.onToggleSelectAll,
      },
      { type: "separator" },
      { label: t.playItem, onSelect: opts.onPlay },
      { label: t.openFolder, shortcut: "o", onSelect: opts.onOpenFolder },
      hasUrl ? { label: t.copyLink, onSelect: opts.onCopyLink } : null,
      opts.canDelete ? { type: "separator" } : null,
      opts.canDelete
        ? {
            label: deleteBatch
              ? `${t.deleteSelected} (${opts.selectedCount})`
              : t.delete,
            shortcut: deleteShortcutKey(),
            onSelect: deleteBatch ? opts.onDeleteSelected : opts.onDeleteItem,
          }
        : null,
    ];
  }

  return [
    { label: t.playItem, shortcut: "enter", onSelect: opts.onPlay },
    { label: t.openFolder, shortcut: "o", onSelect: opts.onOpenFolder },
    hasUrl ? { label: t.copyLink, onSelect: opts.onCopyLink } : null,
    { type: "separator" },
    { label: t.multiSelect, shortcut: "s", onSelect: opts.onEnterSelect },
    opts.canDelete ? { type: "separator" } : null,
    opts.canDelete
      ? {
          label: t.delete,
          shortcut: deleteShortcutKey(),
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

/** Builds right-click context menu items for a Home Discover card. */
export function buildDiscoverContextMenu(
  opts: DiscoverContextMenuOptions,
): (MenuItem | null)[] {
  const t = opts.messages ?? shellT();
  const isDownloaded = Boolean(opts.downloadedEntry);
  return [
    {
      label: isDownloaded ? t.playItem : t.configureDownload,
      onSelect: opts.onOpen,
    },
    isDownloaded && opts.onOpenFolder
      ? { label: t.openFolder, onSelect: opts.onOpenFolder }
      : null,
    opts.item.url ? { label: t.copyLink, onSelect: opts.onCopyLink } : null,
  ];
}
