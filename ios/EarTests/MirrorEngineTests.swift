import CryptoKit
import XCTest
@testable import Ear

private actor MockMirrorAPI: MirrorAPIClientProtocol {
    var shouldReturnUnpaired = false
    var catalogItems: [RemoteCatalogItem] = []
    var mediaByVideoId: [String: Data] = [:]
    var captionsByVideoId: [String: Data] = [:]

    func setCatalog(_ items: [RemoteCatalogItem]) { catalogItems = items }
    func setMedia(_ data: Data, for videoId: String) { mediaByVideoId[videoId] = data }
    func setCaptions(_ data: Data, for videoId: String) { captionsByVideoId[videoId] = data }
    func setUnpaired(_ value: Bool) { shouldReturnUnpaired = value }

    func pair(host: String, port: Int, code: String, deviceName: String, deviceId: String?) async throws -> PairResponse {
        guard code == "1234" else { throw MirrorAPIError.invalidCode(attemptsRemaining: 2) }
        return PairResponse(
            serverId: "mac-1",
            serverName: "Yule's MacBook",
            shortName: "Home",
            deviceId: deviceId ?? "ios-dev-1",
            token: "tok_0123456789abcdef0123456789",
            transport: .lan
        )
    }

    func fetchLibrary(mac: PairedMac, token: String) async throws -> CatalogResponse {
        if shouldReturnUnpaired { throw MirrorAPIError.unpaired }
        return CatalogResponse(serverId: mac.id, serverName: mac.name, shortName: mac.shortName, items: catalogItems)
    }

    func fetchMediaRange(
        mac: PairedMac,
        token: String,
        videoId: String,
        start: Int64,
        end: Int64,
        options: MediaRangeOptions
    ) async throws -> Data {
        if shouldReturnUnpaired { throw MirrorAPIError.unpaired }
        guard let full = mediaByVideoId[videoId] else { throw MirrorAPIError.httpError(status: 404, detail: nil) }
        return full.subdata(in: Int(start)..<Int(end + 1))
    }

    func fetchCaptions(mac: PairedMac, token: String, videoId: String) async throws -> Data? {
        captionsByVideoId[videoId]
    }

    func reportStatus(mac: PairedMac, token: String, syncedCount: Int, totalCount: Int, background: Bool) async {}
    func unpair(mac: PairedMac, token: String) async {}
}

@MainActor
final class MirrorEngineTests: XCTestCase {
    private var tempRoot: URL!

    override func setUp() {
        super.setUp()
        tempRoot = FileManager.default.temporaryDirectory.appendingPathComponent("EarEngineTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDown() {
        if let tempRoot {
            try? FileManager.default.removeItem(at: tempRoot)
        }
        super.tearDown()
    }

    func testPairSyncDeleteUndoAndRemoteUnpair() async throws {
        let api = MockMirrorAPI()
        let payload = Data("offline video stream bytes".utf8)
        let sha = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        let captions = Data("{\"cues\":[{\"startMs\":0,\"endMs\":1000,\"text\":\"Hi there.\"}]}".utf8)

        await api.setCatalog([
            RemoteCatalogItem(
                videoId: "v1",
                title: "Listening Lesson 1",
                sizeBytes: Int64(payload.count),
                contentSha256: sha,
                mediaExt: "mp4",
                mimeType: "video/mp4",
                hasCaptions: true,
                updatedAt: 1000
            )
        ])
        await api.setMedia(payload, for: "v1")
        await api.setCaptions(captions, for: "v1")

        let files = DiskMirrorFileStore(rootURL: tempRoot)
        let tokens = InMemoryTokenStore()
        let engine = MirrorEngine(api: api, files: files, tokens: tokens)
        await engine.hydrate()

        let paired = try await engine.pairWith(host: "192.168.1.50", port: 32783, code: "1234", deviceName: "Test iPhone")
        XCTAssertEqual(paired.id, "mac-1")
        XCTAssertEqual(tokens.token(forServerId: "mac-1"), "tok_0123456789abcdef0123456789")

        // Schedule and wait briefly for local in-memory transfer to finish.
        engine.scheduleTransfers()
        for _ in 0..<40 {
            if engine.localItems["v1"]?.state == .ready { break }
            try await Task.sleep(for: .milliseconds(25))
        }

        XCTAssertEqual(engine.localItems["v1"]?.state, .ready)
        let loadedCaptions = await engine.loadCaptions(for: "v1", mode: .short)
        XCTAssertEqual(loadedCaptions.sentences.count, 1)

        // Delete and undo restore
        let snapshot = engine.deleteLocal(videoId: "v1")
        XCTAssertEqual(engine.localItems["v1"]?.state, .removed)
        engine.restoreLocal(videoId: "v1", previous: snapshot)
        XCTAssertEqual(engine.localItems["v1"]?.state, .ready)

        // Remote unpair removes Mac and surfaces notice while keeping offline copy
        await api.setUnpaired(true)
        await engine.pollAllMacs()
        XCTAssertTrue(engine.macs.isEmpty)
        XCTAssertEqual(engine.lastNotice, .removedByPC(macName: "Home"))
        XCTAssertEqual(engine.localItems["v1"]?.state, .ready)
    }
}
