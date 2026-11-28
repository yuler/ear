import CoreGraphics
import Foundation

public struct SpokenWordProgress: Equatable, Sendable {
    /// Normalized progress within the sentence speech window (0...1).
    public let progress: Double
    /// Currently spoken word index: -1 before speech starts, tokens.count after speech ends.
    public let spokenIndex: Int

    public init(progress: Double, spokenIndex: Int) {
        self.progress = progress
        self.spokenIndex = spokenIndex
    }
}

public enum SubtitleStudioHelpers {
    private static let leadingOpeningPunct = Set("「『（([{\"'“‘")
    private static let trailingClosingPunct = Set("，。！？；：、.,!?;:」』）)]}\"'”’—…")

    /// Normalize a word token for star/selection lookup (lowercased, stripped surrounding punctuation).
    public static func normalizeWordToken(_ raw: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "'"))
        let scalars = Array(raw.unicodeScalars)
        var start = 0
        var end = scalars.count
        while start < end && !allowed.contains(scalars[start]) {
            start += 1
        }
        while end > start && !allowed.contains(scalars[end - 1]) {
            end -= 1
        }
        guard start < end else { return "" }
        return String(String.UnicodeScalarView(scalars[start..<end])).lowercased()
    }

    /// Split a sentence into clickable display tokens (handles English whitespace & CJK character grouping).
    public static func splitSentenceTokens(_ text: String) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        let chunks = trimmed.split(whereSeparator: \.isWhitespace).map(String.init)
        var tokens: [String] = []

        for chunk in chunks {
            if !CaptionSegmentation.isCJK(chunk) {
                tokens.append(chunk)
                continue
            }
            var pendingPrefix = ""
            var latinBuf = ""

            func flushLatin() {
                if !latinBuf.isEmpty {
                    tokens.append(pendingPrefix + latinBuf)
                    pendingPrefix = ""
                    latinBuf = ""
                }
            }

            for ch in chunk {
                if isCJKScalarCharacter(ch) {
                    flushLatin()
                    tokens.append(pendingPrefix + String(ch))
                    pendingPrefix = ""
                } else if trailingClosingPunct.contains(ch) {
                    flushLatin()
                    if !tokens.isEmpty {
                        tokens[tokens.count - 1].append(ch)
                    } else {
                        pendingPrefix.append(ch)
                    }
                } else if leadingOpeningPunct.contains(ch) {
                    flushLatin()
                    pendingPrefix.append(ch)
                } else {
                    latinBuf.append(ch)
                }
            }
            flushLatin()
            if !pendingPrefix.isEmpty {
                if !tokens.isEmpty {
                    tokens[tokens.count - 1].append(pendingPrefix)
                } else {
                    tokens.append(pendingPrefix)
                }
            }
        }
        return tokens
    }

    /// Estimate which word is currently being spoken within a sentence using
    /// character-weighted timing (longer words receive proportionally more time).
    public static func computeSpokenWordProgress(
        sentence: Sentence,
        currentTimeSec: Double,
        tokens: [String]
    ) -> SpokenWordProgress {
        guard !tokens.isEmpty else {
            return SpokenWordProgress(progress: 0, spokenIndex: -1)
        }
        let span = max(100, sentence.endMs - sentence.startMs)
        let pad = min(150, Int(floor(Double(span) * 0.15)))
        let speechStart = Double(sentence.startMs + pad)
        let speechEnd = max(speechStart + 100.0, Double(sentence.endMs - pad))
        let nowMs = currentTimeSec * 1000.0

        if nowMs < speechStart {
            return SpokenWordProgress(progress: 0, spokenIndex: -1)
        }
        if nowMs >= speechEnd {
            return SpokenWordProgress(progress: 1, spokenIndex: tokens.count)
        }

        let progress = (nowMs - speechStart) / (speechEnd - speechStart)
        let weights = tokens.map { max(2, normalizeWordToken($0).count) }
        let totalWeight = weights.reduce(0, +)
        let target = progress * Double(totalWeight)

        var acc = 0
        for (idx, weight) in weights.enumerated() {
            acc += weight
            if target <= Double(acc) {
                return SpokenWordProgress(progress: progress, spokenIndex: idx)
            }
        }
        return SpokenWordProgress(progress: progress, spokenIndex: tokens.count - 1)
    }

    private static func isCJKScalarCharacter(_ ch: Character) -> Bool {
        ch.unicodeScalars.contains { scalar in
            let v = scalar.value
            return (0x3040...0x30FF).contains(v) ||
                   (0x3400...0x4DBF).contains(v) ||
                   (0x4E00...0x9FFF).contains(v)
        }
    }
}

public enum SubtitleBlockerDragMath {
    public enum Handle: Sendable {
        case move
        case resizeTop
        case resizeBottom
    }

    public static func updatedRect(
        from initial: SubtitleBlockerRect,
        translation: CGSize,
        containerSize: CGSize,
        handle: Handle,
        minWidth: Double = 8,
        minHeight: Double = 6
    ) -> SubtitleBlockerRect {
        let base = initial.clamped(minWidth: minWidth, minHeight: minHeight)
        guard containerSize.width > 0, containerSize.height > 0 else {
            return base
        }
        let dxPct = Double(translation.width / containerSize.width) * 100.0
        let dyPct = Double(translation.height / containerSize.height) * 100.0

        switch handle {
        case .move:
            let newX = min(100.0 - base.width, max(0.0, base.x + dxPct))
            let newY = min(100.0 - base.height, max(0.0, base.y + dyPct))
            return SubtitleBlockerRect(
                x: newX,
                y: newY,
                width: base.width,
                height: base.height
            ).clamped(minWidth: minWidth, minHeight: minHeight)

        case .resizeTop:
            let bottom = base.y + base.height
            let newY = min(bottom - minHeight, max(0.0, base.y + dyPct))
            let newH = bottom - newY
            return SubtitleBlockerRect(
                x: base.x,
                y: newY,
                width: base.width,
                height: newH
            ).clamped(minWidth: minWidth, minHeight: minHeight)

        case .resizeBottom:
            let maxH = 100.0 - base.y
            let newH = min(maxH, max(minHeight, base.height + dyPct))
            return SubtitleBlockerRect(
                x: base.x,
                y: base.y,
                width: base.width,
                height: newH
            ).clamped(minWidth: minWidth, minHeight: minHeight)
        }
    }
}
