import CoreGraphics
import XCTest
@testable import Ear

final class SubtitleStudioHelpersTests: XCTestCase {
    func testNormalizeWordTokenStripsPunctuationAndLowercases() {
        XCTAssertEqual(SubtitleStudioHelpers.normalizeWordToken("Hello,"), "hello")
        XCTAssertEqual(SubtitleStudioHelpers.normalizeWordToken("don't!"), "don't")
        XCTAssertEqual(SubtitleStudioHelpers.normalizeWordToken("“World”..."), "world")
        XCTAssertEqual(SubtitleStudioHelpers.normalizeWordToken("..."), "")
        XCTAssertEqual(SubtitleStudioHelpers.normalizeWordToken("你好！"), "你好")
    }

    func testSplitSentenceTokensHandlesEnglishAndCJK() {
        XCTAssertEqual(
            SubtitleStudioHelpers.splitSentenceTokens("  Hello,   world!  Don't stop. "),
            ["Hello,", "world!", "Don't", "stop."]
        )
        XCTAssertEqual(
            SubtitleStudioHelpers.splitSentenceTokens("你好，世界！"),
            ["你", "好，", "世", "界！"]
        )
        XCTAssertEqual(
            SubtitleStudioHelpers.splitSentenceTokens("学习 Swift 编程。"),
            ["学", "习", "Swift", "编", "程。"]
        )
        XCTAssertEqual(SubtitleStudioHelpers.splitSentenceTokens("   "), [])
    }

    func testComputeSpokenWordProgressCoversBoundariesAndWeightedTiming() {
        let sentence = Sentence(
            index: 0,
            startMs: 1000,
            endMs: 3000,
            text: "Hi extraordinary world",
            wordCount: 3,
            wpm: 90,
            difficulty: .easy
        )
        let tokens = SubtitleStudioHelpers.splitSentenceTokens(sentence.text)

        // Empty tokens
        XCTAssertEqual(
            SubtitleStudioHelpers.computeSpokenWordProgress(sentence: sentence, currentTimeSec: 2.0, tokens: []),
            SpokenWordProgress(progress: 0, spokenIndex: -1)
        )

        // Before speech start (pad = 150ms -> speechStart = 1150ms)
        XCTAssertEqual(
            SubtitleStudioHelpers.computeSpokenWordProgress(sentence: sentence, currentTimeSec: 1.1, tokens: tokens),
            SpokenWordProgress(progress: 0, spokenIndex: -1)
        )

        // Mid-sentence: speechStart=1150, speechEnd=2850, span=1700.
        // Weights: "Hi"(2), "extraordinary"(13), "world"(5) -> total 20.
        // At 2.0s (2000ms), progress = 850/1700 = 0.5 -> target = 10 -> inside index 1 ("extraordinary").
        let mid = SubtitleStudioHelpers.computeSpokenWordProgress(sentence: sentence, currentTimeSec: 2.0, tokens: tokens)
        XCTAssertEqual(mid.spokenIndex, 1)
        XCTAssertEqual(mid.progress, 0.5, accuracy: 0.001)

        // Near end: at 2.7s (2700ms), progress = 1550/1700 = 0.911 -> target = 18.2 -> index 2 ("world").
        let late = SubtitleStudioHelpers.computeSpokenWordProgress(sentence: sentence, currentTimeSec: 2.7, tokens: tokens)
        XCTAssertEqual(late.spokenIndex, 2)

        // After speech end (>= 2850ms)
        XCTAssertEqual(
            SubtitleStudioHelpers.computeSpokenWordProgress(sentence: sentence, currentTimeSec: 2.9, tokens: tokens),
            SpokenWordProgress(progress: 1, spokenIndex: tokens.count)
        )
    }

    func testBlockerDragMathMoveAndClamp() {
        let initial = SubtitleBlockerRect(x: 10, y: 70, width: 80, height: 15)
        let container = CGSize(width: 400, height: 200)

        // Move right by 20px (+5%) and up by 40px (-20%)
        let moved = SubtitleBlockerDragMath.updatedRect(
            from: initial,
            translation: CGSize(width: 20, height: -40),
            containerSize: container,
            handle: .move
        )
        XCTAssertEqual(moved.x, 15, accuracy: 0.01)
        XCTAssertEqual(moved.y, 50, accuracy: 0.01)
        XCTAssertEqual(moved.width, 80, accuracy: 0.01)
        XCTAssertEqual(moved.height, 15, accuracy: 0.01)

        // Clamp past bottom-right corner
        let clamped = SubtitleBlockerDragMath.updatedRect(
            from: initial,
            translation: CGSize(width: 500, height: 500),
            containerSize: container,
            handle: .move
        )
        XCTAssertEqual(clamped.x, 20, accuracy: 0.01)
        XCTAssertEqual(clamped.y, 85, accuracy: 0.01)
    }

    func testBlockerDragMathResizeTopAndBottomClamp() {
        let initial = SubtitleBlockerRect(x: 10, y: 70, width: 80, height: 20)
        let container = CGSize(width: 400, height: 200)

        // Drag top handle up by 20px (-10%) -> y=60, height=30 (bottom stays 90)
        let resizedTop = SubtitleBlockerDragMath.updatedRect(
            from: initial,
            translation: CGSize(width: 0, height: -20),
            containerSize: container,
            handle: .resizeTop
        )
        XCTAssertEqual(resizedTop.y, 60, accuracy: 0.01)
        XCTAssertEqual(resizedTop.height, 30, accuracy: 0.01)

        // Drag top handle far down -> clamped to minHeight (6), bottom stays 90 -> y=84
        let topMin = SubtitleBlockerDragMath.updatedRect(
            from: initial,
            translation: CGSize(width: 0, height: 200),
            containerSize: container,
            handle: .resizeTop,
            minHeight: 6
        )
        XCTAssertEqual(topMin.y, 84, accuracy: 0.01)
        XCTAssertEqual(topMin.height, 6, accuracy: 0.01)

        // Drag bottom handle down far -> clamped so y + height <= 100 (height = 30)
        let bottomMax = SubtitleBlockerDragMath.updatedRect(
            from: initial,
            translation: CGSize(width: 0, height: 200),
            containerSize: container,
            handle: .resizeBottom
        )
        XCTAssertEqual(bottomMax.y, 70, accuracy: 0.01)
        XCTAssertEqual(bottomMax.height, 30, accuracy: 0.01)
    }
}
