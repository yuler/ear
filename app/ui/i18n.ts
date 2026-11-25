import type { EarLocale } from "../store";

export type { EarLocale };

export interface I18nMessages {
  // VideoDetailHeader
  back: string;
  backToLibrary: string;
  shortSentences: string;
  shortSentencesDesc: string;
  mediumSentences: string;
  mediumSentencesDesc: string;
  longSentences: string;
  longSentencesDesc: string;
  maskedCaptions: string;
  showCaptions: string;
  english: string;
  chinese: string;

  // Workflow & Controls
  sentencePause: string;
  sentencePauseOn: string;
  sentencePauseOff: string;
  sentencePauseToggle: string;
  autoNext: string;
  listeningTips: string;

  // VideoPlayerControls
  play: string;
  pause: string;
  prevSentence: string;
  repeatSentence: string;
  nextSentence: string;
  looping: string;
  loopSingle: string;
  playbackSpeed: string;
  mute: string;
  unmute: string;
  masked: string;
  captions: string;
  toggleSubtitlesMask: string;
  seekProgress: string;
  subtitleBlocker: string;
  toggleSubtitleBlocker: string;
  switchToSideLayout: string;
  switchToStackedLayout: string;
  resetBlocker: string;
  blockerIntensity: string;
  dragToMove: string;
  holdToDrag: string;
  moving: string;

  // SentenceControlsBar
  previousSentenceFull: string;
  repeatSentenceFull: string;
  nextSentenceFull: string;
  sentenceCounter: (cur: number, total: number) => string;
  loopingFull: string;

  // SentenceRow
  listen: string;
  playing: string;
  maskedBadge: string;

  // SentenceList
  loadingCaptions: string;
  noCaptions: string;
  noCaptionsDesc: string;

  // SubtitleStudio (Dual-Zone Inspector)
  copySentence: string;
  bookmarkSentence: string;
  unbookmarkSentence: string;
  starWord: string;
  selectedWord: string;
  revealSentence: string;
  hideSentence: string;
  blindPeekHint: string;
  notePlaceholder: string;
  rawSubtitles: string;
  rawCuesTab: string;
  rawJsonTab: string;
  copyRawJson: string;
  noRawCues: string;

  // VideoDetailView
  playerError: string;

  // Media / GStreamer Error Notice
  gstreamerMissingTitle: string;
  gstreamerMissingDesc: string;
  copyInstallCommand: string;
  copied: string;
  playInExternalPlayer: string;
  revealFile: string;
  showOtherDistros: string;
  hideOtherDistros: string;

  // SettingsView
  settingsDownloadFolder: string;
  settingsOpenFolder: string;
  settingsOpenFolderLabel: string;
  settingsAppearance: string;
  settingsAppearanceDark: string;
  settingsAppearanceLight: string;
  settingsAppearanceSystem: string;
  settingsLanguage: string;
  settingsDefaultQuality: string;
  settingsQualityAudio: string;
  settingsClipboard: string;
  settingsClipboardDesc: string;
  settingsVersion: string;
  settingsCheckUpdates: string;
  settingsCheckingUpdates: string;
  settingsUpdateAvailable: (version: string) => string;
  settingsViewUpdate: string;
  settingsUpdateFailed: (error: string) => string;
  settingsUpToDate: string;
  settingsShortcuts: string;
}

export const MESSAGES: Record<EarLocale, I18nMessages> = {
  en: {
    back: "Back",
    backToLibrary: "Back to library",
    shortSentences: "Short",
    shortSentencesDesc: "Short sentences (Beginner friendly)",
    mediumSentences: "Medium",
    mediumSentencesDesc: "Medium sentences",
    longSentences: "Long",
    longSentencesDesc: "Long sentences",
    maskedCaptions: "Masked (Listen)",
    showCaptions: "Show Captions",
    english: "English",
    chinese: "中文",

    sentencePause: "Sentence Pause",
    sentencePauseOn: "Sentence Pause: On",
    sentencePauseOff: "Sentence Pause: Off",
    sentencePauseToggle: "Toggle sentence pause for intensive listening",
    autoNext: "Auto-Next",
    listeningTips: "Press R to repeat · Space to play/next (enable 'Sentence Pause' to pause after each sentence)",

    play: "Play",
    pause: "Pause",
    prevSentence: "Prev",
    repeatSentence: "Repeat",
    nextSentence: "Next",
    looping: "Looping",
    loopSingle: "Loop",
    playbackSpeed: "Playback speed",
    mute: "Mute",
    unmute: "Unmute",
    masked: "Masked",
    captions: "Captions",
    toggleSubtitlesMask: "Toggle subtitles mask",
    seekProgress: "Seek video progress",
    subtitleBlocker: "Blocker",
    toggleSubtitleBlocker: "Toggle subtitle blocker (B)",
    switchToSideLayout: "Switch to side-by-side layout",
    switchToStackedLayout: "Switch to top-bottom layout",
    resetBlocker: "Reset position",
    blockerIntensity: "Mask",
    dragToMove: "Drag to move",
    holdToDrag: "Hold to drag",
    moving: "Moving...",

    previousSentenceFull: "Previous",
    repeatSentenceFull: "Repeat",
    nextSentenceFull: "Next",
    sentenceCounter: (cur, total) => (total > 0 ? `Sentence ${cur} / ${total}` : "0 / 0"),
    loopingFull: "Looping",

    listen: "Listen",
    playing: "Playing",
    maskedBadge: "Masked",

    loadingCaptions: "Loading captions and aligning timestamps…",
    noCaptions: "No embedded captions detected for this video",
    noCaptionsDesc: "Play directly with the player above, or download a version with captions",

    copySentence: "Copy sentence",
    bookmarkSentence: "Bookmark sentence",
    unbookmarkSentence: "Remove bookmark",
    starWord: "Star word",
    selectedWord: "Selected word",
    revealSentence: "Reveal sentence",
    hideSentence: "Mask sentence",
    blindPeekHint: "Tap masked words to peek, or press M to reveal all",
    notePlaceholder: "Jot down a quick note for this sentence…",
    rawSubtitles: "Raw subtitles",
    rawCuesTab: "Raw Cues",
    rawJsonTab: "Raw JSON",
    copyRawJson: "Copy JSON",
    noRawCues: "No raw caption cues available for this video.",

    playerError: "Player failed to load",

    gstreamerMissingTitle: "Missing GStreamer Codec Plugins",
    gstreamerMissingDesc:
      "Playing MP4/H.264/AAC media requires GStreamer demuxer and codec packages (e.g. gst-plugins-good & gst-libav).",
    copyInstallCommand: "Copy Install Command",
    copied: "Copied!",
    playInExternalPlayer: "Play in System Player",
    revealFile: "Reveal File",
    showOtherDistros: "Commands for other distros",
    hideOtherDistros: "Hide other distros",

    settingsDownloadFolder: "Download folder",
    settingsOpenFolder: "Open",
    settingsOpenFolderLabel: "Open download folder",
    settingsAppearance: "Appearance",
    settingsAppearanceDark: "Dark",
    settingsAppearanceLight: "Light",
    settingsAppearanceSystem: "System",
    settingsLanguage: "Language",
    settingsDefaultQuality: "Default quality",
    settingsQualityAudio: "Audio only",
    settingsClipboard: "Detect links in clipboard",
    settingsClipboardDesc: "Check for YouTube links when the window is focused",
    settingsVersion: "Version",
    settingsCheckUpdates: "Check for updates",
    settingsCheckingUpdates: "Checking…",
    settingsUpdateAvailable: (version) => `Version ${version} is available`,
    settingsViewUpdate: "View update",
    settingsUpdateFailed: (error) => `Update check failed: ${error}`,
    settingsUpToDate: "You're up to date",
    settingsShortcuts: "Keyboard shortcuts",
  },
  zh: {
    back: "返回列表",
    backToLibrary: "返回列表",
    shortSentences: "短句",
    shortSentencesDesc: "短句分句 (适合入门训练)",
    mediumSentences: "适中",
    mediumSentencesDesc: "适中分句",
    longSentences: "长句",
    longSentencesDesc: "长句分句",
    maskedCaptions: "字幕已打码 (去听)",
    showCaptions: "显示原文字幕",
    english: "English",
    chinese: "中文",

    sentencePause: "逐句暂停",
    sentencePauseOn: "逐句暂停: 开",
    sentencePauseOff: "逐句暂停: 关",
    sentencePauseToggle: "切换逐句暂停精听模式",
    autoNext: "自动下一句",
    listeningTips: "按 R 重听 · 按 空格 播放/下一句 (开启「逐句暂停」可逐句精听)",

    play: "播放",
    pause: "暂停",
    prevSentence: "上一句",
    repeatSentence: "重复",
    nextSentence: "下一句",
    looping: "循环中",
    loopSingle: "单句循环",
    playbackSpeed: "播放倍速",
    mute: "静音",
    unmute: "取消静音",
    masked: "打码中",
    captions: "显示字幕",
    toggleSubtitlesMask: "字幕打码切换",
    seekProgress: "拖动调整进度",
    subtitleBlocker: "拦截字幕条",
    toggleSubtitleBlocker: "切换拦截字幕条 (B)",
    switchToSideLayout: "切换左右布局",
    switchToStackedLayout: "切换上下布局",
    resetBlocker: "重置位置",
    blockerIntensity: "遮挡强度",
    dragToMove: "拖动调整位置",
    holdToDrag: "Hold to drag",
    moving: "拖动中…",

    previousSentenceFull: "上一句",
    repeatSentenceFull: "重复听",
    nextSentenceFull: "下一句",
    sentenceCounter: (cur, total) => (total > 0 ? `第 ${cur} / ${total} 句` : "0 / 0"),
    loopingFull: "单句循环中",

    listen: "去听",
    playing: "播放中",
    maskedBadge: "已打码",

    loadingCaptions: "正在加载字幕句子与时间对齐…",
    noCaptions: "未检测到当前视频的内嵌字幕",
    noCaptionsDesc: "可通过上方播放器直接播放，或重新解析下载包含字幕的版本",

    copySentence: "复制当前句",
    bookmarkSentence: "收藏当前句",
    unbookmarkSentence: "取消收藏",
    starWord: "标记生词",
    selectedWord: "已选单词",
    revealSentence: "显示当前句",
    hideSentence: "重新打码",
    blindPeekHint: "点击词块逐词揭晓，或按 M 显示整句",
    notePlaceholder: "给这一句记条简短笔记…",
    rawSubtitles: "原始字幕数据",
    rawCuesTab: "原始 Cues",
    rawJsonTab: "原始 JSON",
    copyRawJson: "复制 JSON",
    noRawCues: "当前视频没有可用的原始字幕 cues。",

    playerError: "播放器加载失败",

    gstreamerMissingTitle: "缺少 GStreamer 多媒体解码插件",
    gstreamerMissingDesc:
      "播放 MP4/H.264/AAC 媒体需要安装 GStreamer 解封装与解码插件（如 gst-plugins-good 与 gst-libav）。",
    copyInstallCommand: "复制安装命令",
    copied: "已复制!",
    playInExternalPlayer: "使用系统播放器打开",
    revealFile: "打开文件位置",
    showOtherDistros: "查看其他发行版命令",
    hideOtherDistros: "收起其他发行版",

    settingsDownloadFolder: "下载目录",
    settingsOpenFolder: "打开",
    settingsOpenFolderLabel: "打开下载目录",
    settingsAppearance: "外观",
    settingsAppearanceDark: "深色",
    settingsAppearanceLight: "浅色",
    settingsAppearanceSystem: "跟随系统",
    settingsLanguage: "界面语言",
    settingsDefaultQuality: "默认清晰度",
    settingsQualityAudio: "仅音频",
    settingsClipboard: "剪贴板自动识别",
    settingsClipboardDesc: "窗口激活时自动识别 YouTube 链接",
    settingsVersion: "版本",
    settingsCheckUpdates: "检查更新",
    settingsCheckingUpdates: "检查中…",
    settingsUpdateAvailable: (version) => `发现新版本 ${version}`,
    settingsViewUpdate: "查看更新",
    settingsUpdateFailed: (error) => `检查更新失败：${error}`,
    settingsUpToDate: "已是最新版本",
    settingsShortcuts: "快捷键",
  },
};

export function t(locale: EarLocale): I18nMessages {
  return MESSAGES[locale] ?? MESSAGES.en;
}
