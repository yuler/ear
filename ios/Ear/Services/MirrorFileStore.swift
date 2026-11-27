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
    func partialByteCount(videoId: String, ext: String) async -> Int64
    func appendMediaChunk(videoId: String, ext: String, data: Data, expectedOffset: Int64) async throws -> Int64
    func finalizeMedia(videoId: String, ext: String, expectedSha256: String?) async throws -> String
    func writeCaptions(videoId: String, data: Data) async throws -> String
    func readCaptions(videoId: String) async -> Data?
    func mediaURL(videoId: String, fileName: String) async -> URL?
    func removeVideoFiles(videoId: String) async
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
    private var mediaRootURL: URL { rootURL.appendingPathComponent("media", isDirectory: true) }

    private func videoDir(videoId: String) throws -> URL {
        guard MirrorValidation.isSafeVideoId(videoId) else { throw MirrorFileStoreError.unsafeIdentifier }
        return mediaRootURL.appendingPathComponent(videoId, isDirectory: true)
    }

    private func sanitizeExt(_ ext: String) throws -> String {
        let clean = ext.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard MirrorValidation.isSafeMediaExt(clean) else { throw MirrorFileStoreError.unsafeIdentifier }
        return clean
    }

    public func loadState() async -> PersistedMobileData {
        guard let data = try? Data(contentsOf: stateURL),
              let decoded = try? JSONDecoder().decode(PersistedMobileData.self, from: data) else {
            return PersistedMobileData()
        }
        return decoded
    }

    public func saveState(_ data: PersistedMobileData) async {
        Self.ensureRootDirectory(rootURL)
        guard let encoded = try? JSONEncoder().encode(data) else { return }
        try? encoded.write(to: stateURL, options: .atomic)
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

    public func removeVideoFiles(videoId: String) async {
        guard let dir = try? videoDir(videoId: videoId) else { return }
        try? fm.removeItem(at: dir)
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
