import XCTest
@testable import Ear

final class MirrorValidationTests: XCTestCase {
    func testSafeVideoIdAllowsNormalIdsAndRejectsTraversal() {
        XCTAssertTrue(MirrorValidation.isSafeVideoId("dQw4w9WgXcQ"))
        XCTAssertTrue(MirrorValidation.isSafeVideoId("abc_123-XYZ"))
        XCTAssertFalse(MirrorValidation.isSafeVideoId(""))
        XCTAssertFalse(MirrorValidation.isSafeVideoId("../etc/passwd"))
        XCTAssertFalse(MirrorValidation.isSafeVideoId("__proto__"))
        XCTAssertFalse(MirrorValidation.isSafeVideoId("a/b"))
    }

    func testSanitizeThumbnailUrlAllowsOnlyTrustedYouTubeHosts() {
        let valid = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
        XCTAssertEqual(MirrorValidation.sanitizeThumbnailUrl(valid), valid)
        XCTAssertEqual(MirrorValidation.sanitizeThumbnailUrl("http://i.ytimg.com/vi/abc/hq.jpg"), "")
        XCTAssertEqual(MirrorValidation.sanitizeThumbnailUrl("https://evil.example.com/a.jpg"), "")
        XCTAssertEqual(MirrorValidation.sanitizeThumbnailUrl("https://192.168.1.10/thumb.jpg"), "")
    }

    func testLanHostAndPairUrlParsing() {
        XCTAssertTrue(MirrorValidation.isValidLanHost("192.168.1.42"))
        XCTAssertTrue(MirrorValidation.isValidLanHost("[::1]"))
        XCTAssertTrue(MirrorValidation.isValidLanHost("macbook.local"))
        XCTAssertFalse(MirrorValidation.isValidLanHost("192.168.1.999"))
        XCTAssertFalse(MirrorValidation.isValidLanHost("192.168.1.1/evil"))

        let url = "ear://pair?transport=lan&host=192.168.1.42&port=32783&code=4829&name=Home%20Mac"
        let diag = MirrorValidation.diagnosePairUrl(url)
        XCTAssertEqual(
            diag,
            .valid(PairPayload(transport: .lan, host: "192.168.1.42", port: 32783, code: "4829", name: "Home Mac"))
        )

        XCTAssertEqual(MirrorValidation.diagnosePairUrl("https://example.com"), .invalid(.notEarUrl))
        XCTAssertEqual(MirrorValidation.diagnosePairUrl("ear://pair?host=192.168.1.42&code=12"), .invalid(.invalidCode))

        let parsed = MirrorValidation.parseHostAndPort("http://192.168.1.8:9000/")
        XCTAssertEqual(parsed?.host, "192.168.1.8")
        XCTAssertEqual(parsed?.port, 9000)

        let defaultPort = MirrorValidation.parseHostAndPort("10.0.0.5")
        XCTAssertEqual(defaultPort?.host, "10.0.0.5")
        XCTAssertEqual(defaultPort?.port, MirrorConstants.defaultPort)
    }

    func testContentRangeParsing() {
        XCTAssertEqual(
            MirrorValidation.parseContentRangeHeader("bytes 0-1023/4096"),
            ContentRangeValue(start: 0, end: 1023, total: 4096)
        )
        XCTAssertNil(MirrorValidation.parseContentRangeHeader("bytes 500-100/4096"))
        XCTAssertNil(MirrorValidation.parseContentRangeHeader("bytes 0-4096/4096"))
        XCTAssertNil(MirrorValidation.parseContentRangeHeader("invalid"))
    }

    func testBuildLibraryViewDeduplicatesAcrossMacs() {
        let macA = PairedMac(id: "m1", name: "Home Mac", shortName: "Home", host: "192.168.1.2", port: 32783, deviceId: "d1", pairedAt: 1)
        let macB = PairedMac(id: "m2", name: "Work Mac", shortName: "Work", host: "10.0.0.2", port: 32783, deviceId: "d1", pairedAt: 2)
        let shared = RemoteCatalogItem(videoId: "vid1", title: "Shared", sizeBytes: 1000, updatedAt: 200)
        let onlyWork = RemoteCatalogItem(videoId: "vid2", title: "Work Only", sizeBytes: 500, updatedAt: 100)

        let view = MirrorSelectors.buildLibraryView(
            macs: [macA, macB],
            onlineMacIds: ["m1"],
            pausedInBackground: false,
            catalogs: ["m1": [shared], "m2": [shared, onlyWork]],
            localItems: [:],
            activeVideoIds: [],
            priorityQueue: []
        )

        XCTAssertEqual(view.count, 2)
        XCTAssertEqual(view[0].videoId, "vid1")
        XCTAssertEqual(view[0].sources.count, 2)
        XCTAssertEqual(view[0].status, .queued)
        XCTAssertEqual(view[1].videoId, "vid2")
        XCTAssertEqual(view[1].status, .away)
    }
}
