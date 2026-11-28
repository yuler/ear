import SwiftUI

public enum AppAppearance: String, Codable, CaseIterable, Sendable, Identifiable {
    case system
    case light
    case dark

    public var id: String { rawValue }

    public var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

public enum AppAccent: String, Codable, CaseIterable, Sendable, Identifiable {
    case blue
    case green
    case orange
    case purple
    case red

    public var id: String { rawValue }

    public var color: Color {
        switch self {
        case .blue: return .blue
        case .green: return .green
        case .orange: return .orange
        case .purple: return .purple
        case .red: return .red
        }
    }
}

public enum AppLanguage: String, Codable, CaseIterable, Sendable, Identifiable {
    case zh
    case en

    public var id: String { rawValue }
}

public enum TransportKind: String, Codable, Sendable {
    case lan
    case relay
}

public struct MirrorSettings: Codable, Equatable, Sendable {
    public var appearance: AppAppearance = .system
    public var accent: AppAccent = .blue
    public var language: AppLanguage = .zh
    public var backgroundSync: Bool = true

    public init(
        appearance: AppAppearance = .system,
        accent: AppAccent = .blue,
        language: AppLanguage = .zh,
        backgroundSync: Bool = true
    ) {
        self.appearance = appearance
        self.accent = accent
        self.language = language
        self.backgroundSync = backgroundSync
    }
}

public struct PairedMac: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public var name: String
    public var shortName: String
    public var transport: TransportKind
    public var host: String
    public var port: Int
    public var deviceId: String
    public var pairedAt: Int64
    public var lastSyncedAt: Int64?

    public init(
        id: String,
        name: String,
        shortName: String,
        transport: TransportKind = .lan,
        host: String,
        port: Int,
        deviceId: String,
        pairedAt: Int64,
        lastSyncedAt: Int64? = nil
    ) {
        self.id = id
        self.name = name
        self.shortName = shortName
        self.transport = transport
        self.host = host
        self.port = port
        self.deviceId = deviceId
        self.pairedAt = pairedAt
        self.lastSyncedAt = lastSyncedAt
    }
}

public struct RemoteCatalogItem: Codable, Equatable, Identifiable, Sendable {
    public let videoId: String
    public let title: String
    public let thumbnailUrl: String
    public let url: String?
    public let site: String?
    public let durationMs: Int?
    public let videoWidth: Int?
    public let videoHeight: Int?
    public let sizeBytes: Int64
    public let contentSha256: String?
    public let quality: String?
    public let subtitleLabel: String?
    public let subtitleIsAuto: Bool?
    public let mediaExt: String
    public let mimeType: String
    public let hasCaptions: Bool
    public let createdAt: Int64?
    public let updatedAt: Int64

    public var id: String { videoId }

    public init(
        videoId: String,
        title: String,
        thumbnailUrl: String = "",
        url: String? = nil,
        site: String? = nil,
        durationMs: Int? = nil,
        videoWidth: Int? = nil,
        videoHeight: Int? = nil,
        sizeBytes: Int64,
        contentSha256: String? = nil,
        quality: String? = nil,
        subtitleLabel: String? = nil,
        subtitleIsAuto: Bool? = nil,
        mediaExt: String = "mp4",
        mimeType: String = "video/mp4",
        hasCaptions: Bool = false,
        createdAt: Int64? = nil,
        updatedAt: Int64 = 0
    ) {
        self.videoId = videoId
        self.title = title
        self.thumbnailUrl = thumbnailUrl
        self.url = url
        self.site = site
        self.durationMs = durationMs
        self.videoWidth = videoWidth
        self.videoHeight = videoHeight
        self.sizeBytes = sizeBytes
        self.contentSha256 = contentSha256
        self.quality = quality
        self.subtitleLabel = subtitleLabel
        self.subtitleIsAuto = subtitleIsAuto
        self.mediaExt = mediaExt
        self.mimeType = mimeType
        self.hasCaptions = hasCaptions
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum LocalRecordState: String, Codable, Sendable {
    case partial
    case ready
    case removed
}

public struct LocalItemRecord: Codable, Equatable, Sendable {
    public let videoId: String
    public var state: LocalRecordState
    public var title: String
    public var thumbnailUrl: String
    public var url: String?
    public var site: String?
    public var durationMs: Int?
    public var videoWidth: Int?
    public var videoHeight: Int?
    public var quality: String?
    public var subtitleLabel: String?
    public var subtitleIsAuto: Bool?
    public var sizeBytes: Int64
    public var contentSha256: String?
    public var downloadedBytes: Int64
    public var mediaExt: String
    public var mimeType: String
    public var hasCaptions: Bool
    public var localFileName: String?
    public var captionsFileName: String?
    public var thumbnailFileName: String?
    public var sourceMacId: String?
    public var sourceShortName: String?
    public var createdAt: Int64?
    public var updatedAt: Int64

    public init(
        videoId: String,
        state: LocalRecordState,
        title: String,
        thumbnailUrl: String = "",
        url: String? = nil,
        site: String? = nil,
        durationMs: Int? = nil,
        videoWidth: Int? = nil,
        videoHeight: Int? = nil,
        quality: String? = nil,
        subtitleLabel: String? = nil,
        subtitleIsAuto: Bool? = nil,
        sizeBytes: Int64,
        contentSha256: String? = nil,
        downloadedBytes: Int64 = 0,
        mediaExt: String = "mp4",
        mimeType: String = "video/mp4",
        hasCaptions: Bool = false,
        localFileName: String? = nil,
        captionsFileName: String? = nil,
        thumbnailFileName: String? = nil,
        sourceMacId: String? = nil,
        sourceShortName: String? = nil,
        createdAt: Int64? = nil,
        updatedAt: Int64 = 0
    ) {
        self.videoId = videoId
        self.state = state
        self.title = title
        self.thumbnailUrl = thumbnailUrl
        self.url = url
        self.site = site
        self.durationMs = durationMs
        self.videoWidth = videoWidth
        self.videoHeight = videoHeight
        self.quality = quality
        self.subtitleLabel = subtitleLabel
        self.subtitleIsAuto = subtitleIsAuto
        self.sizeBytes = sizeBytes
        self.contentSha256 = contentSha256
        self.downloadedBytes = downloadedBytes
        self.mediaExt = mediaExt
        self.mimeType = mimeType
        self.hasCaptions = hasCaptions
        self.localFileName = localFileName
        self.captionsFileName = captionsFileName
        self.thumbnailFileName = thumbnailFileName
        self.sourceMacId = sourceMacId
        self.sourceShortName = sourceShortName
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum MirrorItemStatus: String, Equatable, Sendable {
    case ready
    case syncing
    case queued
    case away
    case removed
}

public struct MirrorSourceRef: Equatable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let shortName: String
    public let online: Bool
}

public struct MirrorItemView: Equatable, Identifiable, Sendable {
    public let videoId: String
    public let title: String
    public let thumbnailUrl: String
    public let url: String?
    public let site: String?
    public let durationMs: Int?
    public let videoWidth: Int?
    public let videoHeight: Int?
    public let quality: String?
    public let subtitleLabel: String?
    public let subtitleIsAuto: Bool?
    public let sizeBytes: Int64
    public let contentSha256: String?
    public let downloadedBytes: Int64
    public let progress: Double
    public let status: MirrorItemStatus
    public let priority: Bool
    public let hasCaptions: Bool
    public let mediaExt: String
    public let mimeType: String
    public let localFileName: String?
    public let captionsFileName: String?
    public let thumbnailFileName: String?
    public let sources: [MirrorSourceRef]
    public let fallbackSourceShortName: String?
    public let createdAt: Int64?
    public let updatedAt: Int64

    public var id: String { videoId }

    public var isAudioOnly: Bool {
        if mimeType.hasPrefix("audio/") { return true }
        return ["m4a", "mp3", "opus", "ogg"].contains(mediaExt.lowercased())
    }

    public var mediaAspect: Double? {
        guard let w = videoWidth, let h = videoHeight, w > 0, h > 0 else { return nil }
        return Double(w) / Double(h)
    }
}

public struct SyncStats: Equatable, Sendable {
    public let ready: Int
    public let syncing: Int
    public let queued: Int
    public let away: Int
    public let removed: Int
    public let reachableWanted: Int
    public let overallProgress: Double
    public let complete: Bool
}

public struct OfflineStorageSummary: Equatable, Sendable {
    public let readyCount: Int
    public let totalBytes: Int64
}

public struct PairPayload: Equatable, Sendable {
    public let transport: TransportKind
    public let host: String
    public let port: Int
    public let code: String
    public let name: String?

    public init(transport: TransportKind = .lan, host: String, port: Int, code: String, name: String? = nil) {
        self.transport = transport
        self.host = host
        self.port = port
        self.code = code
        self.name = name
    }
}

public struct PersistedMobileData: Codable, Equatable, Sendable {
    public var settings: MirrorSettings = MirrorSettings()
    public var macs: [PairedMac] = []
    public var localItems: [String: LocalItemRecord] = [:]
    public var catalogs: [String: [RemoteCatalogItem]] = [:]

    public init(
        settings: MirrorSettings = MirrorSettings(),
        macs: [PairedMac] = [],
        localItems: [String: LocalItemRecord] = [:],
        catalogs: [String: [RemoteCatalogItem]] = [:]
    ) {
        self.settings = settings
        self.macs = macs
        self.localItems = localItems
        self.catalogs = catalogs
    }
}
