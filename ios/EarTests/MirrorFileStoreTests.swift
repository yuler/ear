import CryptoKit
import XCTest
@testable import Ear

final class MirrorFileStoreTests: XCTestCase {
    private var tempRoot: URL!

    override func setUp() {
        super.setUp()
        tempRoot = FileManager.default.temporaryDirectory.appendingPathComponent("EarTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDown() {
        if let tempRoot {
            try? FileManager.default.removeItem(at: tempRoot)
        }
        super.tearDown()
    }

    func testStreamingAppendAndFinalizeVerifiesSHA256() async throws {
        let store = DiskMirrorFileStore(rootURL: tempRoot)
        let part1 = Data("hello ".utf8)
        let part2 = Data("native ear!".utf8)
        let combined = part1 + part2
        let digest = SHA256.hash(data: combined).map { String(format: "%02x", $0) }.joined()

        let off1 = try await store.appendMediaChunk(videoId: "vid_ok_1", ext: "mp4", data: part1, expectedOffset: 0)
        XCTAssertEqual(off1, Int64(part1.count))

        let partialSize = await store.partialByteCount(videoId: "vid_ok_1", ext: "mp4")
        XCTAssertEqual(partialSize, Int64(part1.count))

        let off2 = try await store.appendMediaChunk(videoId: "vid_ok_1", ext: "mp4", data: part2, expectedOffset: off1)
        XCTAssertEqual(off2, Int64(combined.count))

        let fileName = try await store.finalizeMedia(videoId: "vid_ok_1", ext: "mp4", expectedSha256: digest)
        XCTAssertEqual(fileName, "media.mp4")

        let url = await store.mediaURL(videoId: "vid_ok_1", fileName: fileName)
        XCTAssertNotNil(url)
        let diskBytes = try Data(contentsOf: url!)
        XCTAssertEqual(diskBytes, combined)
    }

    func testChecksumMismatchRejectsAndDeletesPartial() async throws {
        let store = DiskMirrorFileStore(rootURL: tempRoot)
        _ = try await store.appendMediaChunk(videoId: "vid_bad", ext: "mp4", data: Data("corrupt".utf8), expectedOffset: 0)
        let wrongSha = String(repeating: "a", count: 64)

        do {
            _ = try await store.finalizeMedia(videoId: "vid_bad", ext: "mp4", expectedSha256: wrongSha)
            XCTFail("Expected checksumMismatch")
        } catch MirrorFileStoreError.checksumMismatch {
            let remaining = await store.partialByteCount(videoId: "vid_bad", ext: "mp4")
            XCTAssertEqual(remaining, 0)
        }
    }

    func testUnsafeVideoIdIsRejected() async {
        let store = DiskMirrorFileStore(rootURL: tempRoot)
        do {
            _ = try await store.appendMediaChunk(videoId: "../escape", ext: "mp4", data: Data([1]), expectedOffset: 0)
            XCTFail("Expected unsafeIdentifier")
        } catch MirrorFileStoreError.unsafeIdentifier {
            // expected
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testDesktopAlignedLibraryLayoutAndStudyStateRoundTrip() async throws {
        let store = DiskMirrorFileStore(rootURL: tempRoot)
        let record = LocalItemRecord(
            videoId: "vid_meta_1",
            state: .ready,
            title: "Desktop Aligned Video",
            thumbnailUrl: "https://i.ytimg.com/vi/vid_meta_1/hqdefault.jpg",
            url: "https://www.youtube.com/watch?v=vid_meta_1",
            site: "YouTube",
            durationMs: 95_000,
            videoWidth: 1920,
            videoHeight: 1080,
            quality: "1080p",
            subtitleLabel: "English · 人工",
            subtitleIsAuto: false,
            sizeBytes: 2048,
            downloadedBytes: 2048,
            mediaExt: "mp4",
            mimeType: "video/mp4",
            hasCaptions: true,
            localFileName: "media.mp4",
            captionsFileName: "captions.json",
            thumbnailFileName: "thumb.jpg",
            sourceMacId: "mac-1",
            sourceShortName: "Home",
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_005_000
        )
        let removedRecord = LocalItemRecord(
            videoId: "vid_removed",
            state: .removed,
            title: "Removed Video",
            sizeBytes: 512,
            updatedAt: 1_700_000_001_000
        )

        let thumbName = try await store.writeThumbnail(videoId: "vid_meta_1", data: Data([0xFF, 0xD8, 0xFF]))
        XCTAssertEqual(thumbName, "thumb.jpg")
        let thumbURL = await store.thumbnailURL(videoId: "vid_meta_1", fileName: thumbName)
        XCTAssertNotNil(thumbURL)
        XCTAssertEqual(thumbURL?.pathComponents.suffix(3), ["library", "vid_meta_1", "thumb.jpg"])

        let study = VideoStudyState(
            bookmarkedIndices: [0, 3],
            starredWords: ["resilient", "cadence"],
            notes: [3: "Check pronunciation"],
            blockerEnabled: true,
            blockerRect: SubtitleBlockerRect(x: -5, y: 80, width: 120, height: 15),
            sentenceLength: .medium,
            lastPositionSec: 42.5
        )
        await store.saveStudyState(videoId: "vid_meta_1", state: study)
        let loadedStudy = await store.loadStudyState(videoId: "vid_meta_1")
        XCTAssertEqual(loadedStudy.bookmarkedIndices, [0, 3])
        XCTAssertEqual(loadedStudy.starredWords, ["resilient", "cadence"])
        XCTAssertEqual(loadedStudy.notes[3], "Check pronunciation")
        XCTAssertTrue(loadedStudy.blockerEnabled)
        XCTAssertEqual(loadedStudy.blockerRect, SubtitleBlockerRect(x: 0, y: 80, width: 100, height: 15))
        XCTAssertEqual(loadedStudy.sentenceLength, .medium)
        XCTAssertEqual(loadedStudy.lastPositionSec, 42.5)

        await store.saveState(PersistedMobileData(
            settings: MirrorSettings(appearance: .dark, accent: .green, language: .en, backgroundSync: false),
            macs: [],
            localItems: ["vid_meta_1": record, "vid_removed": removedRecord],
            catalogs: [:]
        ))

        let metaFile = tempRoot.appendingPathComponent("library/vid_meta_1.json")
        XCTAssertTrue(FileManager.default.fileExists(atPath: metaFile.path))
        let removedMetaFile = tempRoot.appendingPathComponent("library/vid_removed.json")
        XCTAssertFalse(FileManager.default.fileExists(atPath: removedMetaFile.path))

        let reloaded = await store.loadState()
        XCTAssertEqual(reloaded.settings.appearance, .dark)
        XCTAssertEqual(reloaded.localItems["vid_meta_1"], record)
        XCTAssertEqual(reloaded.localItems["vid_removed"]?.state, .removed)

        await store.removeVideoFiles(videoId: "vid_meta_1")
        XCTAssertFalse(FileManager.default.fileExists(atPath: metaFile.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: tempRoot.appendingPathComponent("library/vid_meta_1").path))
    }
}
