import type { Locale } from "../i18n";

export interface PlayerAndStorageCopy {
  // Storage section in Settings
  storageSection: string;
  storageLocationLabel: string;
  storageUsedLabel: string;
  storageVideoCount: (count: number) => string;
  storageCopyPath: string;
  storageCopiedPath: string;
  storageFooter: string;
  storageChunkedPending: (count: number) => string;
  storageUnavailable: string;

  // Video Info Sheet
  videoInfoTitle: string;
  fileStatusLabel: string;
  fileStatusReadySingle: string;
  fileStatusChunked: string;
  videoFilePathLabel: string;
  captionsFilePathLabel: string;
  mediaFormatLabel: string;
  durationLabel: string;
  sha256Label: string;
  copyPath: string;
  copied: string;
  notAvailable: string;

  // Player controls & study studio
  play: string;
  pause: string;
  prevSentence: string;
  nextSentence: string;
  repeatSentence: string;
  playbackSpeed: string;
  sentencePause: string;
  maskCaptions: string;
  masked: string;
  captions: string;
  subtitleBlocker: string;
  shortSentences: string;
  mediumSentences: string;
  longSentences: string;
  rawSubtitles: string;
  rawSubtitlesEmpty: string;
  loadingCaptions: string;
  noCaptionsTitle: string;
  noCaptionsDesc: string;
  preparingMedia: string;
  mediaNotPlayable: string;
  mediaLoadError: string;
  revealSentence: string;
  hideSentence: string;
  copySentence: string;
  bookmarkSentence: string;
  selectedWord: string;
  starWord: string;
  videoInfoBtn: string;
  rawCuesTab: string;
  sentencesTab: string;
}

const PLAYER_COPY: Record<Locale, PlayerAndStorageCopy> = {
  zh: {
    storageSection: "本地离线存储",
    storageLocationLabel: "存放目录",
    storageUsedLabel: "已离线文件",
    storageVideoCount: (count) => `${count} 个视频`,
    storageCopyPath: "复制路径",
    storageCopiedPath: "已复制路径",
    storageFooter:
      "视频原文件（media.mp4 等）与字幕（captions.json）完整保存在此 iPhone 应用沙盒中，断网也可随时精听。",
    storageChunkedPending: (count) => `${count} 个大文件正在自动合并为可播放格式…`,
    storageUnavailable: "沙盒目录未就绪",

    videoInfoTitle: "视频与文件信息",
    fileStatusLabel: "本地文件状态",
    fileStatusReadySingle: "完整原文件（可离线播放）",
    fileStatusChunked: "分片文件（打开时自动合并）",
    videoFilePathLabel: "视频文件位置",
    captionsFilePathLabel: "字幕文件位置",
    mediaFormatLabel: "格式与类型",
    durationLabel: "时长",
    sha256Label: "SHA-256 校验",
    copyPath: "复制",
    copied: "已复制",
    notAvailable: "无",

    play: "播放",
    pause: "暂停",
    prevSentence: "上一句",
    nextSentence: "下一句",
    repeatSentence: "复读",
    playbackSpeed: "倍速",
    sentencePause: "单句停",
    maskCaptions: "遮罩",
    masked: "已遮罩",
    captions: "字幕",
    subtitleBlocker: "遮挡条",
    shortSentences: "短句",
    mediumSentences: "中句",
    longSentences: "长句",
    rawSubtitles: "原字幕",
    rawSubtitlesEmpty: "当前视频没有同步到离线字幕。",
    loadingCaptions: "正在加载离线字幕…",
    noCaptionsTitle: "无离线字幕",
    noCaptionsDesc: "视频本体已保存在本地，可直接播放练习听力。",
    preparingMedia: "正在准备本地视频文件…",
    mediaNotPlayable: "本地视频文件不可用，请删除副本后重新镜像。",
    mediaLoadError: "视频播放失败",
    revealSentence: "显示本句",
    hideSentence: "隐藏本句",
    copySentence: "复制句子",
    bookmarkSentence: "收藏句子",
    selectedWord: "已选单词",
    starWord: "收藏单词",
    videoInfoBtn: "文件信息",
    rawCuesTab: "原始时间轴",
    sentencesTab: "当前分句",
  },
  en: {
    storageSection: "Offline Storage",
    storageLocationLabel: "Storage Folder",
    storageUsedLabel: "Offline Files",
    storageVideoCount: (count) => `${count} ${count === 1 ? "video" : "videos"}`,
    storageCopyPath: "Copy Path",
    storageCopiedPath: "Path Copied",
    storageFooter:
      "Original media files (media.mp4, etc.) and captions.json are stored directly in this iPhone's app sandbox for full offline playback.",
    storageChunkedPending: (count) => `Assembling ${count} large file(s) for playback…`,
    storageUnavailable: "Sandbox directory unavailable",

    videoInfoTitle: "Video & File Info",
    fileStatusLabel: "Local File Status",
    fileStatusReadySingle: "Complete original file (ready offline)",
    fileStatusChunked: "Chunked file (assembling automatically)",
    videoFilePathLabel: "Video File Path",
    captionsFilePathLabel: "Captions File Path",
    mediaFormatLabel: "Format & MIME",
    durationLabel: "Duration",
    sha256Label: "SHA-256 Digest",
    copyPath: "Copy",
    copied: "Copied",
    notAvailable: "None",

    play: "Play",
    pause: "Pause",
    prevSentence: "Previous",
    nextSentence: "Next",
    repeatSentence: "Repeat",
    playbackSpeed: "Speed",
    sentencePause: "Auto-Pause",
    maskCaptions: "Mask",
    masked: "Masked",
    captions: "Shown",
    subtitleBlocker: "Blocker",
    shortSentences: "Short",
    mediumSentences: "Medium",
    longSentences: "Long",
    rawSubtitles: "Raw Subtitles",
    rawSubtitlesEmpty: "No offline captions were mirrored for this video.",
    loadingCaptions: "Loading offline captions…",
    noCaptionsTitle: "No Offline Captions",
    noCaptionsDesc: "The local video file is ready for offline listening.",
    preparingMedia: "Preparing local video file…",
    mediaNotPlayable: "Local media file is unavailable. Remove and mirror again.",
    mediaLoadError: "Playback failed",
    revealSentence: "Reveal",
    hideSentence: "Hide",
    copySentence: "Copy",
    bookmarkSentence: "Bookmark",
    selectedWord: "Selected word",
    starWord: "Star word",
    videoInfoBtn: "File Info",
    rawCuesTab: "Raw Cues",
    sentencesTab: "Sentences",
  },
};

export function playerCopyFor(locale: Locale): PlayerAndStorageCopy {
  return PLAYER_COPY[locale] ?? PLAYER_COPY.zh;
}
