import type { EarLocale } from "../store";

export type { EarLocale };

export interface I18nMessages {
  // VideoDetailHeader
  back: string;
  backToLibrary: string;
  heroBadge: string;
  shortSentences: string;
  shortSentencesDesc: string;
  mediumSentences: string;
  mediumSentencesDesc: string;
  longSentences: string;
  longSentencesDesc: string;
  maskedCaptions: string;
  showCaptions: string;
  languageLabel: string;
  english: string;
  chinese: string;

  // Workflow & Controls
  sentencePause: string;
  sentencePauseOn: string;
  sentencePauseOff: string;
  sentencePauseToggle: string;
  autoNext: string;
  autoNextOn: string;
  autoNextOff: string;
  autoNextToggle: string;
  loopOn: string;
  loopOff: string;
  tipsPrefix: string;
  listeningTips: string;

  // VideoPlayerControls
  playVideo: string;
  play: string;
  pause: string;
  prevSentence: string;
  repeatSentence: string;
  nextSentence: string;
  looping: string;
  loopSingle: string;
  loopSentenceToggle: string;
  playbackSpeed: string;
  mute: string;
  unmute: string;
  masked: string;
  captions: string;
  toggleSubtitlesMask: string;
  seekProgress: string;

  // SentenceControlsBar
  previousSentenceFull: string;
  repeatSentenceFull: string;
  nextSentenceFull: string;
  sentenceCounter: (cur: number, total: number) => string;
  loopingFull: string;
  loopSentenceFull: string;

  // SentenceRow
  listen: string;
  playing: string;
  maskedBadge: string;
  revealSentence: string;
  maskSentence: string;

  // SentenceList
  captionsTitle: (mode: string) => string;
  modeShort: string;
  modeMedium: string;
  modeLong: string;
  shortcutsHint: string;
  loadingCaptions: string;
  noCaptions: string;
  noCaptionsDesc: string;

  // VideoDetailView
  sentencesMeta: (count: number) => string;
  parsingCaptions: string;
  noCaptionsMeta: string;
  playerError: string;
}

export const MESSAGES: Record<EarLocale, I18nMessages> = {
  en: {
    back: "Back",
    backToLibrary: "Back to library",
    heroBadge: "View Transition · Hero Zoom & Listening Dojo",
    shortSentences: "Short",
    shortSentencesDesc: "Short sentences (Beginner friendly)",
    mediumSentences: "Medium",
    mediumSentencesDesc: "Medium sentences",
    longSentences: "Long",
    longSentencesDesc: "Long sentences",
    maskedCaptions: "Masked (Listen)",
    showCaptions: "Show Captions",
    languageLabel: "Language",
    english: "English",
    chinese: "中文",

    sentencePause: "Sentence Pause",
    sentencePauseOn: "Sentence Pause: On",
    sentencePauseOff: "Sentence Pause: Off",
    sentencePauseToggle: "Toggle sentence pause for intensive listening",
    autoNext: "Auto-Next",
    autoNextOn: "Auto-Next: On",
    autoNextOff: "Auto-Next: Off",
    autoNextToggle: "Toggle auto advance to next sentence",
    loopOn: "Loop: On",
    loopOff: "Loop: Off",
    tipsPrefix: "Tip",
    listeningTips: "Press R to repeat · Space to play/next (enable 'Sentence Pause' to pause after each sentence)",

    playVideo: "Play video",
    play: "Play",
    pause: "Pause",
    prevSentence: "Prev",
    repeatSentence: "Repeat",
    nextSentence: "Next",
    looping: "Looping",
    loopSingle: "Loop",
    loopSentenceToggle: "Toggle sentence loop",
    playbackSpeed: "Playback speed",
    mute: "Mute",
    unmute: "Unmute",
    masked: "Masked",
    captions: "Captions",
    toggleSubtitlesMask: "Toggle subtitles mask",
    seekProgress: "Seek video progress",

    previousSentenceFull: "Previous",
    repeatSentenceFull: "Repeat",
    nextSentenceFull: "Next",
    sentenceCounter: (cur, total) => (total > 0 ? `Sentence ${cur} / ${total}` : "0 / 0"),
    loopingFull: "Looping",
    loopSentenceFull: "Loop",

    listen: "Listen",
    playing: "Playing",
    maskedBadge: "Masked",
    revealSentence: "Reveal sentence",
    maskSentence: "Mask sentence",

    captionsTitle: (mode) => `Captions & Sentences (Intensive Listening · ${mode})`,
    modeShort: "Short",
    modeMedium: "Medium",
    modeLong: "Long",
    shortcutsHint: "Shortcuts: ←/→ Prev/Next · Space/R Repeat · M Toggle Mask",
    loadingCaptions: "Loading captions and aligning timestamps…",
    noCaptions: "No embedded captions detected for this video",
    noCaptionsDesc: "Play directly with the player above, or download a version with captions",

    sentencesMeta: (count) => `${count} captions`,
    parsingCaptions: "Parsing captions…",
    noCaptionsMeta: "No captions",
    playerError: "Player failed to load",
  },
  zh: {
    back: "返回列表",
    backToLibrary: "返回列表",
    heroBadge: "View Transition · 局部放大动画与字幕精听",
    shortSentences: "短句",
    shortSentencesDesc: "短句分句 (适合入门训练)",
    mediumSentences: "适中",
    mediumSentencesDesc: "适中分句",
    longSentences: "长句",
    longSentencesDesc: "长句分句",
    maskedCaptions: "字幕已打码 (去听)",
    showCaptions: "显示原文字幕",
    languageLabel: "语言",
    english: "English",
    chinese: "中文",

    sentencePause: "逐句暂停",
    sentencePauseOn: "逐句暂停: 开",
    sentencePauseOff: "逐句暂停: 关",
    sentencePauseToggle: "切换逐句暂停精听模式",
    autoNext: "自动下一句",
    autoNextOn: "自动下一句: 开",
    autoNextOff: "自动下一句: 关",
    autoNextToggle: "切换自动播放下一句",
    loopOn: "单句循环: 开",
    loopOff: "单句循环: 关",
    tipsPrefix: "提示",
    listeningTips: "按 R 重听 · 按 空格 播放/下一句 (开启「逐句暂停」可逐句精听)",

    playVideo: "播放视频",
    play: "播放",
    pause: "暂停",
    prevSentence: "上一句",
    repeatSentence: "重复",
    nextSentence: "下一句",
    looping: "循环中",
    loopSingle: "单句循环",
    loopSentenceToggle: "单句循环切换",
    playbackSpeed: "播放倍速",
    mute: "静音",
    unmute: "取消静音",
    masked: "打码中",
    captions: "显示字幕",
    toggleSubtitlesMask: "字幕打码切换",
    seekProgress: "拖动调整进度",

    previousSentenceFull: "上一句",
    repeatSentenceFull: "重复听",
    nextSentenceFull: "下一句",
    sentenceCounter: (cur, total) => (total > 0 ? `第 ${cur} / ${total} 句` : "0 / 0"),
    loopingFull: "单句循环中",
    loopSentenceFull: "单句循环",

    listen: "去听",
    playing: "播放中",
    maskedBadge: "已打码",
    revealSentence: "显示字幕",
    maskSentence: "遮罩打码",

    captionsTitle: (mode) => `视频字幕句单 (逐句精听 · ${mode})`,
    modeShort: "短句分句",
    modeMedium: "适中分句",
    modeLong: "长句分句",
    shortcutsHint: "快捷键: ←/→ 切句 · 空格/R 重复听 · M 打码切换",
    loadingCaptions: "正在加载字幕句子与时间对齐…",
    noCaptions: "未检测到当前视频的内嵌字幕",
    noCaptionsDesc: "可通过上方播放器直接播放，或重新解析下载包含字幕的版本",

    sentencesMeta: (count) => `共 ${count} 句字幕`,
    parsingCaptions: "正在解析字幕…",
    noCaptionsMeta: "暂无字幕",
    playerError: "播放器加载失败",
  },
};

export function t(locale: EarLocale): I18nMessages {
  return MESSAGES[locale] ?? MESSAGES.en;
}
