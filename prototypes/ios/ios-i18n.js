// PROTOTYPE. Phone UI strings (zh / en). The Mac panels stay Chinese: they stand for the
// desktop app, which has its own language setting. Uses the global `state` from ios-mvp.js.

const STRINGS = {
  zh: {
    subtitle: "Local Listening Mirror",
    settings: "设置",
    close: "完成",
    appearance: "外观",
    themeDark: "深色", themeLight: "浅色", themeSystem: "跟随系统",
    language: "语言",
    bgSync: "后台同步",
    bgSyncDesc: "切到后台时继续镜像",
    computers: "已配对的电脑",
    noComputers: "还没有配对的电脑",
    pairNew: "＋ 配对新的电脑",
    unpair: "断开",
    connected: (net) => `已连接 · ${net}`,
    elsewhere: (net) => `不在当前网络 · ${net}`,
    have: (a, b) => `已有 ${a}/${b}`,
    multiNote: "连上哪台电脑所在的 Wi-Fi，就自动从哪台镜像。所有电脑的视频放在同一个媒体库里，同一个视频只传一次。",
    quickTitle: "连接电脑",
    quickDesc: "和电脑连同一个 Wi-Fi，扫描电脑「设置 → 手机镜像」里的二维码。配对后媒体库会自动镜像到这里。",
    quickBtn: "扫码配对",
    offlineNone: "没有连上已配对的电脑",
    offlineDetail: (wifi) => `当前：${wifi} · 回到家里或公司的 Wi-Fi 后自动镜像`,
    syncing: (a, b, k) => `镜像中 ${a}/${b} · 同时 ${k} 个`,
    syncingFrom: (names) => `从 ${names} 拉取`,
    synced: (names) => `已与 ${names} 同步`,
    readyCount: (n) => `${n} 个视频与字幕已离线就绪`,
    awayNote: (n) => `还有 ${n} 个在其他电脑上，连上那里的 Wi-Fi 后镜像`,
    pausedBg: "后台同步已关闭 · 回到 Ear 后继续",
    badgeReady: "已离线", badgeSyncing: (p) => `镜像中 ${p}%`, badgeQueued: "等待镜像",
    badgeAway: (s) => `在${s} · 待连接`, mirrorAgain: "重新镜像",
    fromGone: "来自已断开的电脑",
    onlyOnPc: "仅在电脑上",
    swipeHint: "左滑删除手机上的副本，电脑上的不受影响",
    del: "删除",
    liveSyncing: (a, b) => `后台镜像中 ${a}/${b}`, liveDone: "已镜像完成", liveWait: "等待连接电脑",
    livePaused: "后台同步已暂停", liveNone: "未配对电脑", lan: "局域网",
    scanHint: "对准电脑上的二维码",
    scanSub: "电脑：设置 → 手机镜像",
    scanFound: (name) => `已识别「${name}」`,
    waitTitle: (name) => `在「${name}」上点「允许」`,
    waitCode: "配对码",
    doneTitle: (name) => `已配对「${name}」`,
    doneSub: "开始在后台镜像媒体库",
    retry: "重试", cancel: "取消",
    notSameWifi: (name) => `手机和「${name}」不在同一个 Wi-Fi`,
    alreadyPaired: (name) => `已经配对过「${name}」`,
    refused: (name) => `「${name}」拒绝了配对`,
    removedByPc: (name) => `已被「${name}」移除`,
    back: "‹ 返回", mask: "遮罩", masking: "盲听中", prev: "上一句", next: "下一句",
    loop: "单句循环", looping: "循环中", sequential: "顺序",
    wifiHome: "家里 Wi-Fi", wifiOffice: "公司 Wi-Fi", wifiNone: "外出（无 Wi-Fi）"
  },
  en: {
    subtitle: "Local Listening Mirror",
    settings: "Settings",
    close: "Done",
    appearance: "Appearance",
    themeDark: "Dark", themeLight: "Light", themeSystem: "System",
    language: "Language",
    bgSync: "Background sync",
    bgSyncDesc: "Keep mirroring while Ear is in the background",
    computers: "Paired computers",
    noComputers: "No computers paired yet",
    pairNew: "+ Pair a computer",
    unpair: "Unpair",
    connected: (net) => `Connected · ${net}`,
    elsewhere: (net) => `Not on this network · ${net}`,
    have: (a, b) => `${a}/${b} on phone`,
    multiNote: "Ear mirrors from whichever paired computer shares your Wi-Fi. Everything lands in one library; a video is copied only once.",
    quickTitle: "Connect a computer",
    quickDesc: "Join the same Wi-Fi as your computer and scan the QR code in Settings → Phone Mirror. Its library then mirrors here.",
    quickBtn: "Scan to pair",
    offlineNone: "No paired computer nearby",
    offlineDetail: (wifi) => `Now: ${wifi} · mirroring resumes on your home or office Wi-Fi`,
    syncing: (a, b, k) => `Mirroring ${a}/${b} · ${k} at once`,
    syncingFrom: (names) => `From ${names}`,
    synced: (names) => `Up to date with ${names}`,
    readyCount: (n) => `${n} videos with subtitles ready offline`,
    awayNote: (n) => `${n} more on other computers, mirrored when you join their Wi-Fi`,
    pausedBg: "Background sync is off · resumes when Ear is open",
    badgeReady: "Offline", badgeSyncing: (p) => `Mirroring ${p}%`, badgeQueued: "Waiting",
    badgeAway: (s) => `On ${s} · not nearby`, mirrorAgain: "Mirror again",
    fromGone: "From an unpaired computer",
    onlyOnPc: "Only on computers",
    swipeHint: "Swipe left to delete the phone copy; computers keep theirs",
    del: "Delete",
    liveSyncing: (a, b) => `Mirroring in background ${a}/${b}`, liveDone: "Mirror complete", liveWait: "Waiting for a computer",
    livePaused: "Background sync paused", liveNone: "No computer paired", lan: "LAN",
    scanHint: "Point at the QR code on your computer",
    scanSub: "Computer: Settings → Phone Mirror",
    scanFound: (name) => `Found “${name}”`,
    waitTitle: (name) => `Click “Allow” on “${name}”`,
    waitCode: "Pairing code",
    doneTitle: (name) => `Paired with “${name}”`,
    doneSub: "Mirroring its library in the background",
    retry: "Try again", cancel: "Cancel",
    notSameWifi: (name) => `This phone is not on the same Wi-Fi as “${name}”`,
    alreadyPaired: (name) => `Already paired with “${name}”`,
    refused: (name) => `“${name}” declined the request`,
    removedByPc: (name) => `Removed by “${name}”`,
    back: "‹ Back", mask: "Mask", masking: "Masked", prev: "Prev", next: "Next",
    loop: "Loop", looping: "Looping", sequential: "In order",
    wifiHome: "Home Wi-Fi", wifiOffice: "Office Wi-Fi", wifiNone: "Out (no Wi-Fi)"
  }
};

/** t("key", ...args): a string, or a template called with args. */
function t(key, ...args) {
  const v = STRINGS[state.settings.lang][key] ?? STRINGS.zh[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}

/** Notices from the engine are stored as { key, name } and translated when shown. */
const noticeText = (n) => (n ? t(n.key, n.name) : null);

/** Static labels in the HTML carry data-i18n="key". */
function applyI18n() {
  document.documentElement.lang = state.settings.lang === "en" ? "en" : "zh-CN";
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
}
