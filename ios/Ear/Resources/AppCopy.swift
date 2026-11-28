import Foundation

public struct AppCopy: Sendable {
    public let language: AppLanguage

    public init(_ language: AppLanguage) {
        self.language = language
    }

    private var zh: Bool { language == .zh }

    public var appTitle: String { "Ear" }
    public var cancel: String { zh ? "取消" : "Cancel" }
    public var done: String { zh ? "完成" : "Done" }
    public var close: String { zh ? "关闭" : "Close" }
    public var delete: String { zh ? "删除" : "Delete" }
    public var undo: String { zh ? "撤销" : "Undo" }
    public var retry: String { zh ? "重试" : "Retry" }
    public var openSettings: String { zh ? "去设置开启" : "Open Settings" }

    // Library
    public var connectTitle: String { zh ? "连接电脑" : "Connect Your Computer" }
    public var connectBody: String {
        zh ? "把电脑上下载好的视频和字幕镜像到手机，随时离线精听。"
           : "Mirror downloaded videos and captions from Ear Desktop for offline listening."
    }
    public var scanToPair: String { zh ? "扫码配对" : "Scan QR to Pair" }
    public var manualPairBtn: String { zh ? "手动输入配对码" : "Enter Pairing Code" }
    public var noVideosYet: String { zh ? "电脑上还没有视频" : "No videos on your computer yet" }
    public var noVideosHint: String {
        zh ? "在电脑端 Ear 下载视频后，回到同一 Wi-Fi 会自动同步到这里。"
           : "Download a video on Ear Desktop and it will mirror here automatically on the same Wi-Fi."
    }
    public var onComputerOnlySection: String { zh ? "仅在电脑上" : "On Computer Only" }
    public var remirror: String { zh ? "重新镜像" : "Mirror Again" }
    public var statusOfflineReady: String { zh ? "已离线" : "Offline" }
    public var statusQueued: String { zh ? "等待镜像" : "Queued" }
    public var statusPriority: String { zh ? "下一个" : "Up Next" }
    public func statusSyncing(_ percent: Int) -> String { zh ? "镜像中 \(percent)%" : "Syncing \(percent)%" }
    public func statusAway(_ source: String) -> String {
        zh ? (source.isEmpty ? "待连接" : "在\(source) · 待连接")
           : (source.isEmpty ? "Waiting for Wi-Fi" : "On \(source) · Waiting")
    }
    public func bannerSyncing(done: Int, total: Int, active: Int) -> String {
        zh ? "镜像中 \(done)/\(total) · 同时 \(active) 个" : "Syncing \(done)/\(total) · \(active) active"
    }
    public func bannerSynced(names: [String], awayCount: Int) -> String {
        let joined = names.joined(separator: " · ")
        if zh {
            let base = joined.isEmpty ? "已同步" : "已与 \(joined) 同步"
            return awayCount > 0 ? "\(base)（另有 \(awayCount) 个待连接）" : base
        } else {
            let base = joined.isEmpty ? "Up to date" : "Synced with \(joined)"
            return awayCount > 0 ? "\(base) (\(awayCount) away)" : base
        }
    }
    public var bannerOffline: String { zh ? "未连接到已配对的电脑，请确认在同一 Wi-Fi" : "No paired computer reachable on this Wi-Fi" }
    public var bannerPausedBg: String { zh ? "后台同步已暂停" : "Background sync paused" }

    // Toasts
    public func toastPaired(_ name: String) -> String { zh ? "已配对 \(name)" : "Paired with \(name)" }
    public func toastRemovedByPC(_ name: String) -> String { zh ? "已被 \(name) 移除配对" : "Unpaired by \(name)" }
    public func toastDeleted(_ title: String) -> String { zh ? "已删除「\(title)」" : "Deleted \"\(title)\"" }
    public func toastSyncingTap(_ percent: Int) -> String {
        zh ? "正在镜像 \(percent)%，完成后即可播放" : "Syncing \(percent)% — playable when finished"
    }
    public func toastPrioritized(_ title: String) -> String { zh ? "已优先镜像「\(title)」" : "Prioritized \"\(title)\"" }
    public func toastAwayTap(_ source: String) -> String {
        zh ? "在\(source)的电脑上，连上同一 Wi-Fi 后优先镜像"
           : "On \(source) — will prioritize once connected to its Wi-Fi"
    }
    public var toastCopied: String { zh ? "已复制句子" : "Sentence copied" }

    // Pairing
    public var pairTitle: String { zh ? "配对电脑" : "Pair Computer" }
    public var scannerTitle: String { zh ? "扫描电脑端二维码" : "Scan Desktop QR Code" }
    public var scannerHint: String {
        zh ? "在桌面端 Ear「设置 → 手机镜像」中打开二维码"
           : "Open Settings -> Mobile Mirror on Ear Desktop"
    }
    public var cameraDeniedTitle: String { zh ? "需要相机权限才能扫码" : "Camera Access Required" }
    public var cameraDeniedBody: String {
        zh ? "请在系统设置中允许 Ear 使用相机，或直接手动输入电脑 IP 与 4 位配对码。"
           : "Allow camera access in Settings, or enter your computer address and 4-digit code manually."
    }
    public var addressPlaceholder: String { zh ? "电脑地址（例如 192.168.1.42）" : "Computer address (e.g. 192.168.1.42)" }
    public var codePlaceholder: String { zh ? "4 位配对码" : "4-digit code" }
    public var pasteLinkPlaceholder: String { zh ? "或粘贴 ear://pair 链接" : "Or paste ear://pair link" }
    public var connectButton: String { zh ? "连接并配对" : "Connect & Pair" }
    public var pairingBusy: String { zh ? "正在配对…" : "Pairing..." }
    public var pairSuccess: String { zh ? "配对成功" : "Paired" }
    public func pairError(_ error: MirrorAPIError) -> String {
        switch error {
        case .invalidCode(let left):
            if let left { return zh ? "配对码不对（剩余 \(left) 次）" : "Invalid code (\(left) tries left)" }
            return zh ? "配对码不对" : "Invalid pairing code"
        case .codeExpired: return zh ? "配对码已过期，请在电脑端刷新" : "Pairing code expired"
        case .pairLocked: return zh ? "尝试次数过多，请稍后再试" : "Pairing temporarily locked"
        case .timeout: return zh ? "连接超时，请确认手机与电脑在同一 Wi-Fi" : "Timed out — check that both devices share Wi-Fi"
        case .unreachable: return zh ? "无法连接电脑，请检查局域网权限与地址" : "Cannot reach computer — check Local Network & address"
        default: return zh ? "配对失败，请重试" : "Pairing failed, please try again"
        }
    }

    // Settings
    public var settingsTitle: String { zh ? "设置" : "Settings" }
    public var appearanceSection: String { zh ? "外观与语言" : "Appearance & Language" }
    public var appearanceLabel: String { zh ? "外观" : "Appearance" }
    public var accentLabel: String { zh ? "强调色" : "Accent Color" }
    public var languageLabel: String { zh ? "语言" : "Language" }
    public var syncSection: String { zh ? "同步与存储" : "Sync & Storage" }
    public var backgroundSyncLabel: String { zh ? "后台同步" : "Background Sync" }
    public var offlineStorageLabel: String { zh ? "本地已离线" : "Offline Storage" }
    public var pairedMacsSection: String { zh ? "已配对的电脑" : "Paired Computers" }
    public var pairNewMac: String { zh ? "配对新的电脑" : "Pair New Computer" }
    public var disconnectMac: String { zh ? "断开" : "Disconnect" }
    public var onlineBadge: String { zh ? "在线" : "Online" }
    public var offlineBadge: String { zh ? "离线" : "Offline" }
    public var settingsFooter: String {
        zh ? "连上哪台电脑的 Wi-Fi，就自动从哪台镜像；所有视频在同一个媒体库里。"
           : "Ear mirrors automatically from whichever paired computer is on your current Wi-Fi."
    }
    public func appearanceName(_ a: AppAppearance) -> String {
        switch a {
        case .system: return zh ? "跟随系统" : "System"
        case .light: return zh ? "浅色" : "Light"
        case .dark: return zh ? "深色" : "Dark"
        }
    }

    // Player
    public var blindMask: String { zh ? "盲听遮罩" : "Blind Mask" }
    public var sentencePause: String { zh ? "单句暂停" : "Sentence Pause" }
    public var subtitleBlocker: String { zh ? "遮挡硬字幕" : "Subtitle Blocker" }
    public var sentenceLength: String { zh ? "分句长度" : "Sentence Length" }
    public func sentenceLengthName(_ m: SentenceLengthMode) -> String {
        switch m {
        case .short: return zh ? "短句" : "Short"
        case .medium: return zh ? "中句" : "Medium"
        case .long: return zh ? "长句" : "Long"
        }
    }
    public var rawSubtitles: String { zh ? "原始字幕" : "Raw Subtitles" }
    public var videoInfo: String { zh ? "视频信息" : "Video Info" }
    public var noCaptions: String { zh ? "此视频暂无离线字幕" : "No offline captions for this video" }
    public var tapToReveal: String { zh ? "点击显示字幕" : "Tap to reveal" }
    public var mediaUnavailable: String { zh ? "无法加载本地媒体文件" : "Local media file is unavailable" }
    public var fullscreen: String { zh ? "全屏播放" : "Fullscreen" }
    public var back: String { zh ? "返回" : "Back" }
    public var play: String { zh ? "播放" : "Play" }
    public var pause: String { zh ? "暂停" : "Pause" }
    public var mute: String { zh ? "静音" : "Mute" }
    public var unmute: String { zh ? "取消静音" : "Unmute" }
    public var repeatSentence: String { zh ? "复读当前句" : "Repeat Sentence" }
    public var revealSentence: String { zh ? "显示字幕" : "Reveal Sentence" }
    public var hideSentence: String { zh ? "隐藏字幕" : "Hide Sentence" }
    public var copy: String { zh ? "复制" : "Copy" }
    public var bookmark: String { zh ? "收藏句子" : "Bookmark" }
    public var unbookmark: String { zh ? "取消收藏" : "Remove Bookmark" }
    public var selectedWord: String { zh ? "已选单词" : "Selected Word" }
    public var starWord: String { zh ? "收藏生词" : "Star Word" }
    public var unstarWord: String { zh ? "取消收藏生词" : "Unstar Word" }
    public var note: String { zh ? "笔记" : "Note" }
    public var editNote: String { zh ? "编辑笔记" : "Edit Note" }
    public var notePlaceholder: String { zh ? "记录这句的生词、连读或理解…" : "Add a note for this sentence..." }
    public var save: String { zh ? "保存" : "Save" }
    public var clearNote: String { zh ? "清除笔记" : "Clear Note" }
    public var collapse: String { zh ? "收起" : "Collapse" }
    public var expand: String { zh ? "展开" : "Expand" }
    public var subtitleTrack: String { zh ? "字幕轨道" : "Subtitle Track" }
    public var autoGenerated: String { zh ? "自动生成" : "Auto" }
    public var resolution: String { zh ? "分辨率" : "Resolution" }
    public var quality: String { zh ? "画质" : "Quality" }
    public var site: String { zh ? "来源" : "Site" }
}
