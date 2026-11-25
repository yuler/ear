import { platform } from "nsh";
import type { EarLocale } from "../store";

export type ShortcutCategoryKey = "global" | "list" | "player";

export interface ShortcutItem {
  id: string;
  keystroke: string;
  label: string;
  keys: string[];
}

export interface ShortcutCategory {
  key: ShortcutCategoryKey;
  title: string;
  shortcuts: ShortcutItem[];
}

export interface ShortcutsCopy {
  title: string;
  close: string;
}

const MAC_TOKENS: Record<string, string> = {
  mod: "⌘",
  cmd: "⌘",
  meta: "⌘",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  ctrl: "⌃",
  control: "⌃",
  enter: "↵",
  return: "↵",
  backspace: "⌫",
  delete: "⌦",
  escape: "Esc",
  esc: "Esc",
  space: "Space",
};

const PC_TOKENS: Record<string, string> = {
  mod: "Ctrl",
  cmd: "Ctrl",
  meta: "Ctrl",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  enter: "Enter",
  return: "Enter",
  backspace: "Backspace",
  delete: "Del",
  escape: "Esc",
  esc: "Esc",
  space: "Space",
};

/**
 * Format a keystroke expression into platform-native labels.
 * Automatically distinguishes macOS (⌘, ⌥, ⌫) vs Linux / Windows (Ctrl, Alt, Del).
 */
export function formatKeystroke(
  keystroke: string,
  os: string = platform.os,
): string {
  const isMac = os === "macos";
  const table = isMac ? MAC_TOKENS : PC_TOKENS;
  const trimmed = keystroke.trim();
  if (!trimmed) return "";

  // Preserve standalone symbol keys like "+" or "?"
  if (trimmed.length === 1) return trimmed.toUpperCase() === trimmed ? trimmed : trimmed.toUpperCase();

  const lower = trimmed.toLowerCase();
  if (lower === "shift+/") return "?";

  if (!trimmed.includes("+")) {
    return table[lower] ?? trimmed;
  }

  const parts = trimmed.split("+").map((raw) => {
    const k = raw.trim().toLowerCase();
    if (table[k]) return table[k];
    return raw.trim().length === 1 ? raw.trim().toUpperCase() : raw.trim();
  });

  return isMac ? parts.join("") : parts.join("+");
}

export const SHORTCUTS_COPY: Record<EarLocale, ShortcutsCopy> = {
  en: {
    title: "Keyboard Shortcuts",
    close: "Close",
  },
  zh: {
    title: "快捷键",
    close: "关闭",
  },
};

const CATEGORIES_BY_LOCALE: Record<EarLocale, ShortcutCategory[]> = {
  en: [
    {
      key: "global",
      title: "Navigation",
      shortcuts: [
        { id: "nav-library", keystroke: "mod+1", label: "Library", keys: ["mod+1"] },
        { id: "nav-discover", keystroke: "mod+2", label: "Discover", keys: ["mod+2"] },
        {
          id: "focus-omnibar",
          keystroke: "mod+l",
          label: "Search / Paste link",
          keys: ["mod+l", "mod+k"],
        },
        { id: "nav-settings", keystroke: "mod+,", label: "Settings", keys: ["mod+,"] },
        {
          id: "open-shortcuts",
          keystroke: "shift+/",
          label: "Keyboard shortcuts",
          keys: ["?", "F1"],
        },
        { id: "global-escape", keystroke: "escape", label: "Back / Close", keys: ["Esc"] },
      ],
    },
    {
      key: "player",
      title: "Player & Listening",
      shortcuts: [
        { id: "play-toggle", keystroke: "space", label: "Play / Pause", keys: ["Space"] },
        {
          id: "sentence-prev-next",
          keystroke: "left / right",
          label: "Previous / Next sentence",
          keys: ["←", "→"],
        },
        { id: "sentence-replay", keystroke: "r", label: "Repeat sentence", keys: ["R"] },
        { id: "rate-adjust", keystroke: "[ / ]", label: "Playback speed", keys: ["[", "]"] },
        { id: "rate-reset", keystroke: "0", label: "Reset 1.0x speed", keys: ["0"] },
        { id: "volume-adjust", keystroke: "up / down", label: "Volume", keys: ["↑", "↓"] },
        { id: "mask-toggle", keystroke: "m", label: "Toggle subtitle mask", keys: ["M"] },
        { id: "blocker-toggle", keystroke: "b", label: "Toggle subtitle blocker", keys: ["B"] },
        {
          id: "length-switch",
          keystroke: "alt+1 / 2 / 3",
          label: "Sentence length",
          keys: ["alt+1", "alt+2", "alt+3"],
        },
      ],
    },
    {
      key: "list",
      title: "Library & Cards",
      shortcuts: [
        { id: "list-arrows", keystroke: "arrows", label: "Move focus", keys: ["↑", "↓", "←", "→"] },
        { id: "list-enter", keystroke: "enter", label: "Open item", keys: ["Enter"] },
        { id: "list-select-mode", keystroke: "x", label: "Select focused item", keys: ["X", "Space"] },
        { id: "list-select-all", keystroke: "a", label: "Select / Deselect all", keys: ["A", "mod+a"] },
        { id: "list-open-folder", keystroke: "o", label: "Open folder", keys: ["O"] },
        {
          id: "list-delete",
          keystroke: "delete",
          label: "Delete item",
          keys: ["Delete", "Backspace"],
        },
      ],
    },
  ],
  zh: [
    {
      key: "global",
      title: "全局导航",
      shortcuts: [
        { id: "nav-library", keystroke: "mod+1", label: "媒体库", keys: ["mod+1"] },
        { id: "nav-discover", keystroke: "mod+2", label: "发现素材", keys: ["mod+2"] },
        {
          id: "focus-omnibar",
          keystroke: "mod+l",
          label: "搜索 / 粘贴链接",
          keys: ["mod+l", "mod+k"],
        },
        { id: "nav-settings", keystroke: "mod+,", label: "偏好设置", keys: ["mod+,"] },
        {
          id: "open-shortcuts",
          keystroke: "shift+/",
          label: "快捷键",
          keys: ["?", "F1"],
        },
        { id: "global-escape", keystroke: "escape", label: "返回 / 关闭", keys: ["Esc"] },
      ],
    },
    {
      key: "player",
      title: "播放与精听",
      shortcuts: [
        { id: "play-toggle", keystroke: "space", label: "播放 / 暂停", keys: ["Space"] },
        {
          id: "sentence-prev-next",
          keystroke: "left / right",
          label: "上 / 下一句",
          keys: ["←", "→"],
        },
        { id: "sentence-replay", keystroke: "r", label: "单句重播", keys: ["R"] },
        { id: "rate-adjust", keystroke: "[ / ]", label: "倍速调节", keys: ["[", "]"] },
        { id: "rate-reset", keystroke: "0", label: "重置 1.0x", keys: ["0"] },
        { id: "volume-adjust", keystroke: "up / down", label: "音量调节", keys: ["↑", "↓"] },
        { id: "mask-toggle", keystroke: "m", label: "字幕打码", keys: ["M"] },
        { id: "blocker-toggle", keystroke: "b", label: "实体遮挡条", keys: ["B"] },
        {
          id: "length-switch",
          keystroke: "alt+1 / 2 / 3",
          label: "分句长度",
          keys: ["alt+1", "alt+2", "alt+3"],
        },
      ],
    },
    {
      key: "list",
      title: "列表与卡片",
      shortcuts: [
        { id: "list-arrows", keystroke: "arrows", label: "移动焦点", keys: ["↑", "↓", "←", "→"] },
        { id: "list-enter", keystroke: "enter", label: "打开播放", keys: ["Enter"] },
        { id: "list-select-mode", keystroke: "x", label: "勾选当前项", keys: ["X", "Space"] },
        { id: "list-select-all", keystroke: "a", label: "全选 / 取消全选", keys: ["A", "mod+a"] },
        { id: "list-open-folder", keystroke: "o", label: "打开所在目录", keys: ["O"] },
        {
          id: "list-delete",
          keystroke: "delete",
          label: "删除条目",
          keys: ["Delete", "Backspace"],
        },
      ],
    },
  ],
};

export function getShortcutCategories(locale: EarLocale): ShortcutCategory[] {
  return CATEGORIES_BY_LOCALE[locale] ?? CATEGORIES_BY_LOCALE.en;
}

export function getShortcutsCopy(locale: EarLocale): ShortcutsCopy {
  return SHORTCUTS_COPY[locale] ?? SHORTCUTS_COPY.en;
}

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = CATEGORIES_BY_LOCALE.en;
