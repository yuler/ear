import CryptoKit
import Foundation

public enum MirrorFileStoreError: Error, Equatable, Sendable {
    case unsafeIdentifier
    case offsetMismatch(expected: Int64, actual: Int64)
    case checksumMismatch(expected: String, actual: String)
    case missingPartialFile
}

public protocol MirrorFileStoring: Sendable {
    func loadState() async -> PersistedMobileData
    func saveState(_ data: PersistedMobileData) async
    func saveLocalItem(_ record: LocalItemRecord) async
    func partialByteCount(videoId: String, ext: String) async -> Int64
    func appendMediaChunk(videoId: String, ext: String, data: Data, expectedOffset: Int64) async throws -> Int64
    func finalizeMedia(videoId: String, ext: String, expectedSha256: String?) async throws -> String
    func writeCaptions(videoId: String, data: Data) async throws -> String
    func readCaptions(videoId: String) async -> Data?
    func mediaURL(videoId: String, fileName: String) async -> URL?
    func writeThumbnail(videoId: String, data: Data) async throws -> String
    func thumbnailURL(videoId: String, fileName: String) async -> URL?
    func loadStudyState(videoId: String) async -> VideoStudyState
    func saveStudyState(videoId: String, state: VideoStudyState) async
    func removeVideoFiles(videoId: String) async
}

private struct PersistedAppState: Codable {
    var settings: MirrorSettings = MirrorSettings()
    var macs: [PairedMac] = []
    var catalogs: [String: [RemoteCatalogItem]] = [:]
    var removedItems: [String: LocalItemRecord] = [:]

    init(
        settings: MirrorSettings = MirrorSettings(),
        macs: [PairedMac] = [],
        catalogs: [String: [RemoteCatalogItem]] = [:],
        removedItems: [String: LocalItemRecord] = [:]
    ) {
        self.settings = settings
        self.macs = macs
        self.catalogs = catalogs
        self.removedItems = removedItems
    }

    private enum CodingKeys: String, CodingKey {
        case settings
        case macs
        case catalogs
        case removedItems
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.settings = try c.decodeIfPresent(MirrorSettings.self, forKey: .settings) ?? MirrorSettings()
        self.macs = try c.decodeIfPresent([PairedMac].self, forKey: .macs) ?? []
        self.catalogs = try c.decodeIfPresent([String: [RemoteCatalogItem]].self, forKey: .catalogs) ?? [:]
        self.removedItems = try c.decodeIfPresent([String: LocalItemRecord].self, forKey: .removedItems) ?? [:]
    }
}

public actor DiskMirrorFileStore: MirrorFileStoring {
    public let rootURL: URL
    private let fm = FileManager.default

    public init(rootURL: URL? = nil) {
        if let rootURL {
            self.rootURL = rootURL
        } else {
            let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? FileManager.default.temporaryDirectory
            self.rootURL = appSupport.appendingPathComponent("EarMirror", isDirectory: true)
        }
        Self.ensureRootDirectory(self.rootURL)
    }

    private static func ensureRootDirectory(_ url: URL) {
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var mutableURL = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? mutableURL.setResourceValues(values)
    }

    private var stateURL: URL { rootURL.appendingPathComponent("state.json") }
    private var libraryRootURL: URL { rootURL.appendingPathComponent("library", isDirectory: true) }

    private func videoDir(videoId: String) throws -> URL {
        guard MirrorValidation.isSafeVideoId(videoId) else { throw MirrorFileStoreError.unsafeIdentifier }
        return libraryRootURL.appendingPathComponent(videoId, isDirectory: true)
    }

    private func videoMetadataURL(videoId: String) throws -> URL {
        guard MirrorValidation.isSafeVideoId(videoId) else { throw MirrorFileStoreError.unsafeIdentifier }
        return libraryRootURL.appendingPathComponent("\(videoId).json")
    }

    private func sanitizeExt(_ ext: String) throws -> String {
        let clean = ext.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard MirrorValidation.isSafeMediaExt(clean) else { throw MirrorFileStoreError.unsafeIdentifier }
        return clean
    }

    public func loadState() async -> PersistedMobileData {
        let appState: PersistedAppState
        if let data = try? Data(contentsOf: stateURL),
           let decoded = try? JSONDecoder().decode(PersistedAppState.self, from: data) {
            appState = decoded
        } else {
            appState = PersistedAppState()
        }

        var localItems = appState.removedItems
        if let entries = try? fm.contentsOfDirectory(at: libraryRootURL, includingPropertiesForKeys: nil) {
            let decoder = JSONDecoder()
            for url in entries where url.pathExtension == "json" {
                let stem = url.deletingPathExtension().lastPathComponent
                guard MirrorValidation.isSafeVideoId(stem),
                      let raw = try? Data(contentsOf: url),
                      let record = try? decoder.decode(LocalItemRecord.self, from: raw),
                      record.videoId == stem else {
                    continue
                }
                localItems[record.videoId] = record
            }
        }

        return PersistedMobileData(
            settings: appState.settings,
            macs: appState.macs,
            localItems: localItems,
            catalogs: appState.catalogs
        )
    }

    public func saveState(_ data: PersistedMobileData) async {
        Self.ensureRootDirectory(rootURL)
        try? fm.createDirectory(at: libraryRootURL, withIntermediateDirectories: true)

        var removedItems: [String: LocalItemRecord] = [:]
        let encoder = JSONEncoder()
        for (videoId, record) in data.localItems {
            if record.state == .removed {
                removedItems[videoId] = record
                if let metaURL = try? videoMetadataURL(videoId: videoId), fm.fileExists(atPath: metaURL.path) {
                    try? fm.removeItem(at: metaURL)
                }
            } else if let metaURL = try? videoMetadataURL(videoId: videoId),
                      let encoded = try? encoder.encode(record) {
                try? encoded.write(to: metaURL, options: .atomic)
            }
        }

        let appState = PersistedAppState(
            settings: data.settings,
            macs: data.macs,
            catalogs: data.catalogs,
            removedItems: removedItems
        )
        guard let encoded = try? encoder.encode(appState) else { return }
        try? encoded.write(to: stateURL, options: .atomic)
    }

    public func saveLocalItem(_ record: LocalItemRecord) async {
        Self.ensureRootDirectory(rootURL)
        guard let metaURL = try? videoMetadataURL(videoId: record.videoId) else { return }
        if record.state == .removed {
            try? fm.removeItem(at: metaURL)
            return
        }
        try? fm.createDirectory(at: libraryRootURL, withIntermediateDirectories: true)
        guard let encoded = try? JSONEncoder().encode(record) else { return }
        try? encoded.write(to: metaURL, options: .atomic)
    }

    public func partialByteCount(videoId: String, ext: String) async -> Int64 {
        guard let dir = try? videoDir(videoId: videoId),
              let safeExt = try? sanitizeExt(ext) else { return 0 }
        let partURL = dir.appendingPathComponent("media.\(safeExt).part")
        guard let attrs = try? fm.attributesOfItem(atPath: partURL.path),
              let size = attrs[.size] as? NSNumber else { return 0 }
        return max(0, size.int64Value)
    }

    public func appendMediaChunk(videoId: String, ext: String, data: Data, expectedOffset: Int64) async throws -> Int64 {
        let dir = try videoDir(videoId: videoId)
        let safeExt = try sanitizeExt(ext)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)

        let partURL = dir.appendingPathComponent("media.\(safeExt).part")
        if !fm.fileExists(atPath: partURL.path) {
            guard expectedOffset == 0 else {
                throw MirrorFileStoreError.offsetMismatch(expected: expectedOffset, actual: 0)
            }
            fm.createFile(atPath: partURL.path, contents: nil)
        }

        let handle = try FileHandle(forUpdating: partURL)
        defer { try? handle.close() }
        let currentSize = Int64(try handle.seekToEnd())
        guard currentSize == expectedOffset else {
            throw MirrorFileStoreError.offsetMismatch(expected: expectedOffset, actual: currentSize)
        }
        try handle.write(contentsOf: data)
        return currentSize + Int64(data.count)
    }

    public func finalizeMedia(videoId: String, ext: String, expectedSha256: String?) async throws -> String {
        let dir = try videoDir(videoId: videoId)
        let safeExt = try sanitizeExt(ext)
        let partURL = dir.appendingPathComponent("media.\(safeExt).part")
        let finalFileName = "media.\(safeExt)"
        let finalURL = dir.appendingPathComponent(finalFileName)

        guard fm.fileExists(atPath: partURL.path) else {
            throw MirrorFileStoreError.missingPartialFile
        }

        if let expected = expectedSha256?.lowercased(), MirrorValidation.isSha256Hex(expected) {
            let actual = try Self.streamSHA256Hex(of: partURL)
            guard actual == expected else {
                try? fm.removeItem(at: partURL)
                throw MirrorFileStoreError.checksumMismatch(expected: expected, actual: actual)
            }
        }

        if fm.fileExists(atPath: finalURL.path) {
            try fm.removeItem(at: finalURL)
        }
        try fm.moveItem(at: partURL, to: finalURL)
        return finalFileName
    }

    public func writeCaptions(videoId: String, data: Data) async throws -> String {
        let dir = try videoDir(videoId: videoId)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let fileName = "captions.json"
        let fileURL = dir.appendingPathComponent(fileName)
        try data.write(to: fileURL, options: .atomic)
        return fileName
    }

    public func readCaptions(videoId: String) async -> Data? {
        guard let dir = try? videoDir(videoId: videoId) else { return nil }
        return try? Data(contentsOf: dir.appendingPathComponent("captions.json"))
    }

    public func mediaURL(videoId: String, fileName: String) async -> URL? {
        guard let dir = try? videoDir(videoId: videoId),
              !fileName.contains("/"), !fileName.contains("..") else { return nil }
        let url = dir.appendingPathComponent(fileName)
        return fm.fileExists(atPath: url.path) ? url : nil
    }

    public func writeThumbnail(videoId: String, data: Data) async throws -> String {
        let dir = try videoDir(videoId: videoId)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let fileName = "thumb.jpg"
        let fileURL = dir.appendingPathComponent(fileName)
        try data.write(to: fileURL, options: .atomic)
        return fileName
    }

    public func thumbnailURL(videoId: String, fileName: String) async -> URL? {
        guard let dir = try? videoDir(videoId: videoId),
              !fileName.contains("/"), !fileName.contains("..") else { return nil }
        let url = dir.appendingPathComponent(fileName)
        return fm.fileExists(atPath: url.path) ? url : nil
    }

    public func loadStudyState(videoId: String) async -> VideoStudyState {
        guard let dir = try? videoDir(videoId: videoId),
              let data = try? Data(contentsOf: dir.appendingPathComponent("study.json")),
              let decoded = try? JSONDecoder().decode(VideoStudyState.self, from: data) else {
            return VideoStudyState()
        }
        return decoded
    }

    public func saveStudyState(videoId: String, state: VideoStudyState) async {
        guard let dir = try? videoDir(videoId: videoId) else { return }
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        guard let encoded = try? JSONEncoder().encode(state) else { return }
        try? encoded.write(to: dir.appendingPathComponent("study.json"), options: .atomic)
    }

    public func removeVideoFiles(videoId: String) async {
        if let metaURL = try? videoMetadataURL(videoId: videoId) {
            try? fm.removeItem(at: metaURL)
        }
        if let dir = try? videoDir(videoId: videoId) {
            try? fm.removeItem(at: dir)
        }
    }

    private static func streamSHA256Hex(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 256 * 1024), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        let digest = hasher.finalize()
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
