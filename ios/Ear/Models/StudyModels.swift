import Foundation

public struct SubtitleBlockerRect: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public static let defaultRect = SubtitleBlockerRect(x: 6, y: 78, width: 88, height: 14)

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    public func clamped(minWidth: Double = 8, minHeight: Double = 4) -> SubtitleBlockerRect {
        let clampedW = min(100, max(minWidth, width))
        let clampedH = min(100, max(minHeight, height))
        let clampedX = min(100 - clampedW, max(0, x))
        let clampedY = min(100 - clampedH, max(0, y))
        return SubtitleBlockerRect(x: clampedX, y: clampedY, width: clampedW, height: clampedH)
    }
}

public struct VideoStudyState: Codable, Equatable, Sendable {
    public var bookmarkedIndices: Set<Int>
    public var starredWords: Set<String>
    public var notes: [Int: String]
    public var blockerEnabled: Bool
    public var blockerRect: SubtitleBlockerRect
    public var sentenceLength: SentenceLengthMode
    public var lastPositionSec: Double?

    public init(
        bookmarkedIndices: Set<Int> = [],
        starredWords: Set<String> = [],
        notes: [Int: String] = [:],
        blockerEnabled: Bool = false,
        blockerRect: SubtitleBlockerRect = .defaultRect,
        sentenceLength: SentenceLengthMode = .short,
        lastPositionSec: Double? = nil
    ) {
        self.bookmarkedIndices = bookmarkedIndices
        self.starredWords = starredWords
        self.notes = notes
        self.blockerEnabled = blockerEnabled
        self.blockerRect = blockerRect.clamped()
        self.sentenceLength = sentenceLength
        self.lastPositionSec = lastPositionSec
    }

    private enum CodingKeys: String, CodingKey {
        case bookmarkedIndices
        case starredWords
        case notes
        case blockerEnabled
        case blockerRect
        case sentenceLength
        case lastPositionSec
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.bookmarkedIndices = try c.decodeIfPresent(Set<Int>.self, forKey: .bookmarkedIndices) ?? []
        self.starredWords = try c.decodeIfPresent(Set<String>.self, forKey: .starredWords) ?? []
        self.notes = try c.decodeIfPresent([Int: String].self, forKey: .notes) ?? [:]
        self.blockerEnabled = try c.decodeIfPresent(Bool.self, forKey: .blockerEnabled) ?? false
        self.blockerRect = (try c.decodeIfPresent(SubtitleBlockerRect.self, forKey: .blockerRect) ?? .defaultRect).clamped()
        self.sentenceLength = try c.decodeIfPresent(SentenceLengthMode.self, forKey: .sentenceLength) ?? .short
        self.lastPositionSec = try c.decodeIfPresent(Double.self, forKey: .lastPositionSec)
    }
}
