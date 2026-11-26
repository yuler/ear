export type Locale = "zh" | "en";

export interface MobileCopy {
  appTitle: string;
  settings: string;
  done: string;
  cancel: string;
  close: string;
  retry: string;
  undo: string;
  delete: string;

  // Empty & onboarding
  quickTitle: string;
  quickDesc: string;
  quickBtn: string;
  quickQrTip: string;
  emptyPairedTitle: string;
  emptyPairedDesc: string;

  // Sync status banner
  offlineTitle: string;
  offlineDesc: string;
  syncingTitle: (ready: number, reachableTotal: number, active: number) => string;
  syncingFrom: (names: string) => string;
  syncedTitle: (names: string) => string;
  syncedReadyCount: (ready: number) => string;
  awaySummary: (count: number) => string;
  storagePausedTitle: string;
  storagePausedDesc: string;
  resumeSync: string;
  refreshNow: string;

  // Item badges & meta
  badgeReady: string;
  badgeSyncing: (pct: number) => string;
  badgeQueued: string;
  badgePriority: string;
  badgeAway: (shortName: string) => string;
  mirrorAgain: string;
  onlyOnPcSection: string;
  fromGonePc: string;
  swipeHint: string;

  // Toasts
  toastDeleted: (title: string) => string;
  toastPrioritized: (title: string) => string;
  toastSyncingTap: (pct: number) => string;
  toastAwayTap: (title: string, shortName: string) => string;
  toastRemovedByPc: (name: string) => string;
  toastPaired: (name: string) => string;

  // Settings sheet
  appearanceSection: string;
  appearanceLabel: string;
  appearanceSystem: string;
  appearanceLight: string;
  appearanceDark: string;
  accentLabel: string;
  accentBlue: string;
  accentGreen: string;
  accentOrange: string;
  accentPurple: string;
  accentRed: string;
  versionLabel: string;
  languageLabel: string;
  syncSection: string;
  backgroundSyncLabel: string;
  backgroundSyncFooter: string;
  pairedComputersSection: string;
  noPairedComputers: string;
  connectedBadge: string;
  offlineBadge: string;
  syncedCount: (done: number, total: number) => string;
  disconnect: string;
  disconnectConfirmTitle: (name: string) => string;
  disconnectConfirmMsg: string;
  pairNewComputer: string;
  multiMacFooter: string;

  // Pairing modal
  pairTitle: string;
  pairModeLink: string;
  pairModeManual: string;
  pairScanGuideTitle: string;
  pairScanGuideDesc: string;
  pasteFromClipboard: string;
  pairUrlPlaceholder: string;
  pairConfirmTitle: string;
  pairConfirmDesc: (target: string) => string;
  connectNow: string;
  hostLabel: string;
  hostPlaceholder: string;
  codeLabel: string;
  codeHint: string;
  pairingProgress: string;
  pairSuccessTitle: (name: string) => string;
  pairAlreadyPairedTitle: (name: string) => string;
  pairSuccessSub: string;
  errInvalidUrl: string;
  errInvalidHost: string;
  errWrongCode: string;
  errExpiredCode: string;
  errPairLocked: string;
  errUnreachable: (host: string) => string;
  errClipboardEmpty: string;

  // Ready preview sheet
  offlinePreviewTitle: string;
  offlinePreviewBody: string;
  localFileSize: string;
  captionsStatus: string;
  captionsIncluded: string;
  captionsUnavailable: string;
  sourceComputers: string;
}

export const COPY: Record<Locale, MobileCopy> = {
  zh: {
    appTitle: "Ear",
    settings: "设置",
    done: "完成",
    cancel: "取消",
    close: "关闭",
    retry: "重试",
    undo: "撤销",
    delete: "删除",

    quickTitle: "连接电脑",
    quickDesc: "将电脑上已下载的视频和字幕自动镜像到这台 iPhone，离线随时精听。",
    quickBtn: "配对电脑",
    quickQrTip: "用 iPhone 自带相机扫描电脑「设置 → 手机镜像」里的二维码，系统会打开 Ear 并停在确认页。",
    emptyPairedTitle: "等待电脑上的视频",
    emptyPairedDesc: "在已配对的电脑上下载视频后，同一 Wi-Fi 下会自动镜像到这里。",

    offlineTitle: "未连接到已配对的电脑",
    offlineDesc: "请确保手机与电脑处于同一 Wi-Fi，且电脑端已开启「手机镜像」。",
    syncingTitle: (ready, total, active) => `镜像中 ${ready}/${total} · 同时 ${active} 个`,
    syncingFrom: (names) => `正在从 ${names} 拉取`,
    syncedTitle: (names) => `已与 ${names} 同步`,
    syncedReadyCount: (ready) => `共 ${ready} 个视频可离线播放`,
    awaySummary: (count) => `另有 ${count} 个视频在未连接的电脑上`,
    storagePausedTitle: "镜像已暂停：存储写入失败",
    storagePausedDesc: "请检查手机可用存储空间后点击继续同步。",
    resumeSync: "继续同步",
    refreshNow: "立即检查",

    badgeReady: "已离线",
    badgeSyncing: (pct) => `镜像中 ${pct}%`,
    badgeQueued: "等待镜像",
    badgePriority: "优先镜像",
    badgeAway: (shortName) => `在${shortName} · 待连接`,
    mirrorAgain: "重新镜像",
    onlyOnPcSection: "仅在电脑上",
    fromGonePc: "本地副本",
    swipeHint: "点按「删除」仅移除手机副本，不影响电脑上的原文件。",

    toastDeleted: (title) => `已移除本地副本「${title}」`,
    toastPrioritized: (title) => `已将「${title}」移到队列最前`,
    toastSyncingTap: (pct) => `正在镜像（${pct}%），请稍候`,
    toastAwayTap: (title, shortName) => `「${title}」在${shortName}，连上对应 Wi-Fi 后会优先镜像`,
    toastRemovedByPc: (name) => `「${name}」已移除此设备的配对，已下载副本仍保留在本地`,
    toastPaired: (name) => `已与「${name}」配对，正在自动镜像`,

    appearanceSection: "外观与语言",
    appearanceLabel: "外观",
    appearanceSystem: "跟随系统",
    appearanceLight: "浅色",
    appearanceDark: "深色",
    accentLabel: "主颜色",
    accentBlue: "蓝",
    accentGreen: "绿",
    accentOrange: "橙",
    accentPurple: "紫",
    accentRed: "红",
    versionLabel: "版本",
    languageLabel: "语言",
    syncSection: "镜像同步",
    backgroundSyncLabel: "后台同步",
    backgroundSyncFooter: "开启后切回应用会自动从断点继续拉取；关闭后切到后台将立即暂停传输。",
    pairedComputersSection: "已配对的电脑",
    noPairedComputers: "尚未配对任何电脑",
    connectedBadge: "已连接",
    offlineBadge: "未连接",
    syncedCount: (done, total) => `已同步 ${done}/${total}`,
    disconnect: "断开",
    disconnectConfirmTitle: (name) => `断开与「${name}」的连接？`,
    disconnectConfirmMsg: "这台电脑独有且尚未传完的视频会从列表移除；已经下载好的离线副本会保留在手机上。",
    pairNewComputer: "＋ 配对新的电脑",
    multiMacFooter: "回到哪台已配对电脑的 Wi-Fi，就会自动从哪台镜像；所有视频合并在同一个媒体库里并自动去重。",

    pairTitle: "配对电脑",
    pairModeLink: "二维码 / 链接",
    pairModeManual: "手动配对码",
    pairScanGuideTitle: "用 iPhone 相机扫码最快",
    pairScanGuideDesc: "打开电脑 Ear 的「设置 → 手机镜像」，用 iPhone 自带相机扫描二维码。系统会打开 Ear 并停在确认页，核对电脑名和地址后再配对。也可以把配对链接粘贴到下面。",
    pasteFromClipboard: "从剪贴板粘贴配对链接",
    pairUrlPlaceholder: "ear://pair?transport=lan&host=192.168.1.42&port=32783&code=1234",
    pairConfirmTitle: "请核对电脑地址后确认配对",
    pairConfirmDesc: (target) => `目标电脑：${target}。请确认这是你局域网内信任的电脑，再点击下方按钮完成配对。`,
    connectNow: "立即配对",
    hostLabel: "电脑局域网地址",
    hostPlaceholder: "192.168.1.42:32783",
    codeLabel: "4 位配对码",
    codeHint: "输入电脑屏幕上显示的 4 位一次性配对码，输满后自动配对。",
    pairingProgress: "正在验证配对码并连接电脑…",
    pairSuccessTitle: (name) => `已与「${name}」配对`,
    pairAlreadyPairedTitle: (name) => `已连接「${name}」`,
    pairSuccessSub: "即将返回媒体库并自动开始镜像",
    errInvalidUrl: "配对链接格式不正确，请确认以 ear://pair? 开头。",
    errInvalidHost: "请输入有效的局域网地址，例如 192.168.1.42:32783。",
    errWrongCode: "配对码不正确，请核对电脑屏幕上的 4 位数字。",
    errExpiredCode: "配对码已过期，请看电脑上新刷新的 4 位配对码。",
    errPairLocked: "错误次数过多，电脑端已临时锁定配对。请在电脑上点击「重新开启配对」后重试。",
    errUnreachable: (host) => `无法连接到 ${host}，请确认手机与电脑在同一 Wi-Fi 且已开启手机镜像。`,
    errClipboardEmpty: "剪贴板里没有检测到 ear://pair 配对链接。",

    offlinePreviewTitle: "已离线就绪",
    offlinePreviewBody: "视频和字幕已完整镜像到手机本地沙盒。完整字幕精听播放器将在下一个版本上线。",
    localFileSize: "本地大小",
    captionsStatus: "离线字幕",
    captionsIncluded: "已同步",
    captionsUnavailable: "无字幕",
    sourceComputers: "来源电脑",
  },
  en: {
    appTitle: "Ear",
    settings: "Settings",
    done: "Done",
    cancel: "Cancel",
    close: "Close",
    retry: "Retry",
    undo: "Undo",
    delete: "Delete",

    quickTitle: "Connect a Computer",
    quickDesc: "Automatically mirror downloaded videos and captions from Ear on your Mac or PC over Wi-Fi.",
    quickBtn: "Pair Computer",
    quickQrTip: "Scan the QR code in Ear Desktop (Settings → Phone Mirror) with the iPhone Camera app. Ear opens on the confirm step.",
    emptyPairedTitle: "Waiting for Videos",
    emptyPairedDesc: "Download videos on a paired computer and they will mirror here automatically on the same Wi-Fi.",

    offlineTitle: "No Paired Computer Reachable",
    offlineDesc: "Make sure your iPhone is on the same Wi-Fi and Phone Mirror is enabled on your computer.",
    syncingTitle: (ready, total, active) => `Mirroring ${ready}/${total} · ${active} active`,
    syncingFrom: (names) => `Pulling from ${names}`,
    syncedTitle: (names) => `Synced with ${names}`,
    syncedReadyCount: (ready) => `${ready} videos ready offline`,
    awaySummary: (count) => `${count} more waiting on another computer`,
    storagePausedTitle: "Mirroring Paused: Storage Error",
    storagePausedDesc: "Free up storage space on your iPhone, then resume mirroring.",
    resumeSync: "Resume",
    refreshNow: "Refresh",

    badgeReady: "Offline",
    badgeSyncing: (pct) => `Mirroring ${pct}%`,
    badgeQueued: "Queued",
    badgePriority: "Up Next",
    badgeAway: (shortName) => `On ${shortName} · Away`,
    mirrorAgain: "Mirror Again",
    onlyOnPcSection: "On Computer Only",
    fromGonePc: "Local copy",
    swipeHint: "Deleting removes only the copy on this iPhone; your computer keeps the original.",

    toastDeleted: (title) => `Removed local copy of "${title}"`,
    toastPrioritized: (title) => `Moved "${title}" to front of queue`,
    toastSyncingTap: (pct) => `Mirroring (${pct}%)…`,
    toastAwayTap: (title, shortName) => `"${title}" is on ${shortName}; it will mirror first once connected`,
    toastRemovedByPc: (name) => `"${name}" unpaired this iPhone. Downloaded copies remain available offline.`,
    toastPaired: (name) => `Paired with "${name}". Starting mirror…`,

    appearanceSection: "Appearance & Language",
    appearanceLabel: "Appearance",
    appearanceSystem: "System",
    appearanceLight: "Light",
    appearanceDark: "Dark",
    accentLabel: "Accent",
    accentBlue: "Blue",
    accentGreen: "Green",
    accentOrange: "Orange",
    accentPurple: "Purple",
    accentRed: "Red",
    versionLabel: "Version",
    languageLabel: "Language",
    syncSection: "Mirroring",
    backgroundSyncLabel: "Background Sync",
    backgroundSyncFooter: "Resumes transfers via HTTP Range when returning to Ear; turning off pauses immediately in background.",
    pairedComputersSection: "Paired Computers",
    noPairedComputers: "No paired computers yet",
    connectedBadge: "Connected",
    offlineBadge: "Offline",
    syncedCount: (done, total) => `${done}/${total} synced`,
    disconnect: "Disconnect",
    disconnectConfirmTitle: (name) => `Disconnect "${name}"?`,
    disconnectConfirmMsg: "Unfinished items unique to this computer will disappear from the list. Downloaded offline copies stay on your iPhone.",
    pairNewComputer: "+ Pair Another Computer",
    multiMacFooter: "Ear automatically connects to whichever paired computers are on your current Wi-Fi and deduplicates videos into one library.",

    pairTitle: "Pair Computer",
    pairModeLink: "QR / Pair Link",
    pairModeManual: "4-Digit Code",
    pairScanGuideTitle: "Scan with iPhone Camera",
    pairScanGuideDesc: "Open Settings → Phone Mirror in Ear on your computer and scan the QR code with the iPhone Camera app. iOS opens Ear on the confirm step so you can check the computer name and address. You can also paste the pairing link below.",
    pasteFromClipboard: "Paste Pair Link from Clipboard",
    pairUrlPlaceholder: "ear://pair?transport=lan&host=192.168.1.42&port=32783&code=1234",
    pairConfirmTitle: "Verify Computer Before Pairing",
    pairConfirmDesc: (target) => `Target: ${target}. Confirm this is your trusted computer on the local network before pairing.`,
    connectNow: "Pair Now",
    hostLabel: "Computer LAN Address",
    hostPlaceholder: "192.168.1.42:32783",
    codeLabel: "4-Digit Pairing Code",
    codeHint: "Enter the one-time 4-digit code shown on your computer screen.",
    pairingProgress: "Verifying code and connecting…",
    pairSuccessTitle: (name) => `Paired with "${name}"`,
    pairAlreadyPairedTitle: (name) => `Connected to "${name}"`,
    pairSuccessSub: "Returning to your library…",
    errInvalidUrl: "Invalid pairing link. Expected an ear://pair? URL.",
    errInvalidHost: "Enter a valid LAN address such as 192.168.1.42:32783.",
    errWrongCode: "Incorrect pairing code. Check the 4 digits shown on your computer.",
    errExpiredCode: "Pairing code expired. Enter the refreshed 4-digit code.",
    errPairLocked: "Too many failed attempts. Reopen pairing on your computer and try again.",
    errUnreachable: (host) => `Could not reach ${host}. Make sure both devices are on the same Wi-Fi.`,
    errClipboardEmpty: "No ear://pair link found on the clipboard.",

    offlinePreviewTitle: "Available Offline",
    offlinePreviewBody: "Video and captions are safely mirrored on this iPhone. The full offline listening player is coming in the next milestone.",
    localFileSize: "Local Size",
    captionsStatus: "Offline Captions",
    captionsIncluded: "Synced",
    captionsUnavailable: "None",
    sourceComputers: "Sources",
  },
};

export function copyFor(locale: Locale): MobileCopy {
  return COPY[locale] ?? COPY.zh;
}
