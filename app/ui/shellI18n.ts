import type { EarLocale } from "../store";
import { settings } from "./settings";

/**
 * Copy for the app shell: top bar, link card, Library, Discover and toasts.
 * Kept apart from `i18n.ts` (the player's strings) so each file stays small.
 */
export interface ShellMessages {
  discover: string;
  library: string;
  settings: string;
  close: string;
  backToLibrary: string;
  linkPlaceholder: string;
  clearLink: string;
  readClipboard: string;
  focusLink: string;
  activeDownloads: (n: number) => string;

  // Link card
  parsing: string;
  quality: string;
  audioOnly: string;
  subtitles: string;
  subtitlesLabel: (name: string) => string;
  manual: string;
  auto: string;
  noSubtitles: string;
  moreSubtitles: (n: number) => string;
  fewerSubtitles: string;
  download: string;
  dismiss: string;

  // Library
  libraryEmpty: string;
  libraryEmptyHint: string;
  librarySearchEmpty: (query: string) => string;
  libraryFilterEmpty: (label: string) => string;
  clearSearch: string;
  showAll: string;
  filterAll: string;
  filterVideo: string;
  filterAudio: string;
  moreActions: string;
  openFolder: string;
  delete: string;
  deleteTitle: string;
  deleteDescription: (title: string) => string;
  deleteBatchTitle: (n: number) => string;
  deleteBatchDescription: (n: number) => string;
  cancel: string;
  select: string;
  done: string;
  selectAll: string;
  deselectAll: string;
  selectedCount: (n: number) => string;
  batchToolbar: string;
  deleteSelected: string;
  exitSelectMode: string;
  autoSubtitles: string;
  noSubtitlesBadge: string;
  audio: string;
  pause: string;
  resume: string;
  retry: string;
  cancelDownload: string;
  stageStarting: string;
  stageMerging: string;
  stagePaused: string;
  stageError: string;

  // Discover
  discoverSectionHint: string;
  browseDiscover: string;
  allLanguages: string;
  english: string;
  japanese: string;
  allLevels: string;
  refresh: string;
  discoverLoading: string;
  discoverFailed: string;
  retryLoad: string;
  discoverEmpty: string;
  resetFilters: string;
  downloaded: string;

  // Toasts
  downloadFailed: string;
  noLocalFile: (title: string) => string;
}

const EN: ShellMessages = {
  discover: "Discover",
  library: "Library",
  settings: "Settings",
  close: "Close",
  backToLibrary: "Back to Library",
  linkPlaceholder: "Search library or paste a YouTube link",
  clearLink: "Clear search",
  readClipboard: "Read clipboard",
  focusLink: "Search or paste link",
  activeDownloads: (n) => `${n} downloading`,

  parsing: "Reading video…",
  quality: "Quality",
  audioOnly: "Audio only",
  subtitles: "Subtitles",
  subtitlesLabel: (name) => `Subtitles: ${name}`,
  manual: "manual",
  auto: "auto",
  noSubtitles: "None",
  moreSubtitles: (n) => `+${n} more`,
  fewerSubtitles: "Less",
  download: "Download",
  dismiss: "Dismiss",

  libraryEmpty: "Your library is empty",
  libraryEmptyHint: "Paste a YouTube link above, or pick a curated video below.",
  librarySearchEmpty: (query) => `No items matching “${query}”`,
  libraryFilterEmpty: (label) => `No ${label.toLowerCase()} items in your library`,
  clearSearch: "Clear search",
  showAll: "Show all",
  filterAll: "All",
  filterVideo: "Video",
  filterAudio: "Audio",
  moreActions: "More actions",
  openFolder: "Open folder",
  delete: "Delete",
  deleteTitle: "Delete this item?",
  deleteDescription: (title) => `“${title}” and its local files will be removed.`,
  deleteBatchTitle: (n) => `Delete ${n} items?`,
  deleteBatchDescription: (n) => `${n} selected items and their local files will be removed.`,
  cancel: "Cancel",
  select: "Select",
  done: "Done",
  selectAll: "Select all",
  deselectAll: "Deselect all",
  selectedCount: () => "selected",
  batchToolbar: "Batch actions",
  deleteSelected: "Delete selected",
  exitSelectMode: "Exit selection mode",
  autoSubtitles: "Auto subtitles",
  noSubtitlesBadge: "No subtitles",
  audio: "Audio",
  pause: "Pause",
  resume: "Resume",
  retry: "Retry",
  cancelDownload: "Cancel download",
  stageStarting: "Starting…",
  stageMerging: "Merging…",
  stagePaused: "Paused",
  stageError: "Failed",

  discoverSectionHint: "Curated picks — click to configure & download",
  browseDiscover: "Browse all",
  allLanguages: "All",
  english: "English",
  japanese: "Japanese",
  allLevels: "All levels",
  refresh: "Refresh",
  discoverLoading: "Loading recommendations…",
  discoverFailed: "Couldn't load recommendations",
  retryLoad: "Try again",
  discoverEmpty: "No videos match these filters",
  resetFilters: "Reset filters",
  downloaded: "Downloaded",

  downloadFailed: "Download failed",
  noLocalFile: (title) => `No local file to play: ${title}`,
};

const ZH: ShellMessages = {
  discover: "发现",
  library: "媒体库",
  settings: "设置",
  close: "关闭",
  backToLibrary: "返回媒体库",
  linkPlaceholder: "搜索媒体库，或粘贴 YouTube 链接",
  clearLink: "清空输入",
  readClipboard: "读取剪贴板",
  focusLink: "搜索或粘贴链接",
  activeDownloads: (n) => `${n} 个下载中`,

  parsing: "正在解析视频…",
  quality: "清晰度",
  audioOnly: "仅音频",
  subtitles: "字幕",
  subtitlesLabel: (name) => `字幕：${name}`,
  manual: "人工",
  auto: "自动",
  noSubtitles: "无",
  moreSubtitles: (n) => `+${n} 更多`,
  fewerSubtitles: "收起",
  download: "下载",
  dismiss: "关闭",

  libraryEmpty: "媒体库还是空的",
  libraryEmptyHint: "在上方粘贴 YouTube 链接，或从下方精选素材中挑选。",
  librarySearchEmpty: (query) => `没有找到匹配「${query}」的内容`,
  libraryFilterEmpty: (label) => `媒体库中还没有${label}内容`,
  clearSearch: "清空搜索",
  showAll: "查看全部",
  filterAll: "全部",
  filterVideo: "视频",
  filterAudio: "音频",
  moreActions: "更多操作",
  openFolder: "打开文件夹",
  delete: "删除",
  deleteTitle: "删除这个条目？",
  deleteDescription: (title) => `将移除「${title}」及其本地文件。`,
  deleteBatchTitle: (n) => `删除这 ${n} 个条目？`,
  deleteBatchDescription: (n) => `将移除已选的 ${n} 个条目及其本地文件。`,
  cancel: "取消",
  select: "多选",
  done: "完成",
  selectAll: "全选",
  deselectAll: "取消全选",
  selectedCount: () => "项已选",
  batchToolbar: "批量操作",
  deleteSelected: "删除所选",
  exitSelectMode: "退出多选",
  autoSubtitles: "自动字幕",
  noSubtitlesBadge: "无字幕",
  audio: "音频",
  pause: "暂停",
  resume: "继续",
  retry: "重试",
  cancelDownload: "取消下载",
  stageStarting: "准备中…",
  stageMerging: "合并中…",
  stagePaused: "已暂停",
  stageError: "下载失败",

  discoverSectionHint: "精选素材，点击预览配置后下载",
  browseDiscover: "查看全部",
  allLanguages: "全部",
  english: "英语",
  japanese: "日语",
  allLevels: "全部等级",
  refresh: "刷新",
  discoverLoading: "正在加载推荐…",
  discoverFailed: "推荐加载失败",
  retryLoad: "重试",
  discoverEmpty: "没有符合筛选条件的视频",
  resetFilters: "重置筛选",
  downloaded: "已下载",

  downloadFailed: "下载失败",
  noLocalFile: (title) => `没有可播放的本地文件：${title}`,
};

export const SHELL_MESSAGES: Record<EarLocale, ShellMessages> = { en: EN, zh: ZH };

/** Shell copy in the current interface language (reactive). */
export function shellT(): ShellMessages {
  return SHELL_MESSAGES[settings().language] ?? EN;
}
