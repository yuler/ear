import CryptoKit
import XCTest
@testable import Ear

private actor MockMirrorAPI: MirrorAPIClientProtocol {
    var shouldReturnUnpaired = false
    var catalogItems: [RemoteCatalogItem] = []
    var mediaByVideoId: [String: Data] = [:]
    var captionsByVideoId: [String: Data] = [:]
    var thumbnailsByUrl: [String: Data] = [:]

    func setCatalog(_ items: [RemoteCatalogItem]) { catalogItems = items }
    func setMedia(_ data: Data, for videoId: String) { mediaByVideoId[videoId] = data }
    func setCaptions(_ data: Data, for videoId: String) { captionsByVideoId[videoId] = data }
    func setThumbnail(_ data: Data, for url: String) { thumbnailsByUrl[url] = data }
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

    func fetchThumbnail(urlString: String) async -> Data? {
        thumbnailsByUrl[urlString]
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
        let captions = Data("""
        {"videoId":"v1","title":"Listening Lesson 1","track":{"languageCode":"en","name":"English","isAuto":false},"cues":[{"startMs":0,"endMs":1000,"text":"Hi there."}]}
        """.utf8)
        let thumbUrl = "https://i.ytimg.com/vi/v1/hqdefault.jpg"
        let thumbBytes = Data([0xFF, 0xD8, 0xFF, 0xD9])

        await api.setCatalog([
            RemoteCatalogItem(
                videoId: "v1",
                title: "Listening Lesson 1",
                thumbnailUrl: thumbUrl,
                url: "https://www.youtube.com/watch?v=v1",
                site: "YouTube",
                durationMs: 60_000,
                videoWidth: 1920,
                videoHeight: 1080,
                sizeBytes: Int64(payload.count),
                contentSha256: sha,
                quality: "1080p",
                subtitleLabel: "English · 人工",
                subtitleIsAuto: false,
                mediaExt: "mp4",
                mimeType: "video/mp4",
                hasCaptions: true,
                createdAt: 900,
                updatedAt: 1000
            )
        ])
        await api.setMedia(payload, for: "v1")
        await api.setCaptions(captions, for: "v1")
        await api.setThumbnail(thumbBytes, for: thumbUrl)

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
        XCTAssertEqual(engine.localItems["v1"]?.url, "https://www.youtube.com/watch?v=v1")
        XCTAssertEqual(engine.localItems["v1"]?.site, "YouTube")
        XCTAssertEqual(engine.localItems["v1"]?.videoWidth, 1920)
        XCTAssertEqual(engine.localItems["v1"]?.videoHeight, 1080)
        XCTAssertEqual(engine.localItems["v1"]?.quality, "1080p")
        XCTAssertEqual(engine.localItems["v1"]?.subtitleLabel, "English · 人工")
        XCTAssertEqual(engine.localItems["v1"]?.subtitleIsAuto, false)
        XCTAssertEqual(engine.localItems["v1"]?.thumbnailFileName, "thumb.jpg")
        XCTAssertEqual(engine.localItems["v1"]?.createdAt, 900)

        let viewItem = try XCTUnwrap(engine.library.first(where: { $0.videoId == "v1" }))
        XCTAssertEqual(viewItem.mediaAspect ?? 0, 16.0 / 9.0, accuracy: 0.001)
        let localThumbURL = await engine.thumbnailURL(for: viewItem)
        XCTAssertNotNil(localThumbURL)
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(localThumbURL)), thumbBytes)

        let loadedCaptions = await engine.loadCaptions(for: "v1", mode: .short)
        XCTAssertEqual(loadedCaptions.videoId, "v1")
        XCTAssertEqual(loadedCaptions.track, CaptionTrackInfo(lang: "en", name: "English", isAuto: false))
        XCTAssertEqual(loadedCaptions.sentences.count, 1)

        // Study state persistence via MirrorEngine
        let studyState = VideoStudyState(bookmarkedIndices: [0], starredWords: ["hi"], blockerEnabled: true)
        engine.saveStudyState(studyState, for: "v1")
        try await Task.sleep(for: .milliseconds(50))
        let loadedStudy = await engine.loadStudyState(for: "v1")
        XCTAssertEqual(loadedStudy, studyState)

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
