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
}
