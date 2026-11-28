import XCTest
@testable import Ear

final class CaptionSegmentationTests: XCTestCase {
    func testWordCountHandlesEnglishAndCJK() {
        XCTAssertEqual(CaptionSegmentation.countWords("Hello world from Ear"), 4)
        XCTAssertEqual(CaptionSegmentation.countWords("你好，世界！"), 4)
    }

    func testMergeSentencesDeduplicatesRollingOverlap() {
        let cues = [
            CaptionCue(startMs: 1000, endMs: 2000, text: "Hello there"),
            CaptionCue(startMs: 2050, endMs: 3200, text: "there my friend.")
        ]
        let merged = CaptionSegmentation.mergeSentences(cues, mode: .medium)
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged[0].text, "Hello there my friend.")
        XCTAssertEqual(merged[0].startMs, 850)
        XCTAssertEqual(merged[0].endMs, 3350)
    }

    func testEvaluatePlaybackProgressHandlesSentencePauseAndAdvance() {
        let sentences = [
            Sentence(index: 0, startMs: 0, endMs: 2000, text: "First.", wordCount: 1, wpm: 30, difficulty: .easy),
            Sentence(index: 1, startMs: 2100, endMs: 5000, text: "Second.", wordCount: 1, wpm: 20, difficulty: .easy)
        ]

        let advance = CaptionSegmentation.evaluatePlaybackProgress(
            currentTimeSec: 2.5,
            sentences: sentences,
            paused: false,
            sentencePause: false,
            clipEndMs: nil,
            activeIndex: 0
        )
        XCTAssertEqual(advance, .advance(activeIndex: 1))

        let pauseAtClipEnd = CaptionSegmentation.evaluatePlaybackProgress(
            currentTimeSec: 1.98,
            sentences: sentences,
            paused: false,
            sentencePause: true,
            clipEndMs: 2000,
            activeIndex: 0
        )
        XCTAssertEqual(pauseAtClipEnd, .pause(clearClipEnd: false))
    }

    func testParseCaptionsPayloadSupportsCuesAndFallbackSentences() {
        let json = """
        {
          "videoId": "abc123",
          "title": "Morning Lesson",
          "track": {"languageCode": "en", "name": "English (auto-generated)", "kind": "asr", "vssId": "a.en"},
          "cues": [{"startMs": 500, "endMs": 1500, "text": "Good morning."}]
        }
        """
        let loaded = CaptionSegmentation.parseCaptionsPayload(Data(json.utf8), mode: .short)
        XCTAssertEqual(loaded.videoId, "abc123")
        XCTAssertEqual(loaded.title, "Morning Lesson")
        XCTAssertEqual(loaded.track, CaptionTrackInfo(lang: "en", name: "English (auto-generated)", isAuto: true))
        XCTAssertEqual(loaded.cues.count, 1)
        XCTAssertEqual(loaded.sentences.count, 1)
        XCTAssertEqual(loaded.sentences[0].text, "Good morning.")
    }

    func testCaptionTrackInfoDecodesAlternateKeys() throws {
        let json = #"{"lang":"ja","label":"Japanese","isAuto":false}"#
        let decoded = try JSONDecoder().decode(CaptionTrackInfo.self, from: Data(json.utf8))
        XCTAssertEqual(decoded, CaptionTrackInfo(lang: "ja", name: "Japanese", isAuto: false))
    }
}
