import Foundation

public struct CaptionCue: Codable, Equatable, Sendable, Identifiable {
    public let startMs: Int
    public let endMs: Int
    public let text: String

    public var id: String { "\(startMs)-\(endMs)-\(text.prefix(16))" }

    public init(startMs: Int, endMs: Int, text: String) {
        self.startMs = startMs
        self.endMs = endMs
        self.text = text
    }
}

public enum SentenceDifficulty: String, Codable, Equatable, Sendable {
    case easy = "i-1"
    case optimal = "i+1"
    case hard = "Hard"
}

public struct Sentence: Codable, Equatable, Sendable, Identifiable {
    public let index: Int
    public let startMs: Int
    public let endMs: Int
    public let text: String
    public let wordCount: Int
    public let wpm: Int
    public let difficulty: SentenceDifficulty

    public var id: Int { index }

    public init(
        index: Int,
        startMs: Int,
        endMs: Int,
        text: String,
        wordCount: Int,
        wpm: Int,
        difficulty: SentenceDifficulty
    ) {
        self.index = index
        self.startMs = startMs
        self.endMs = endMs
        self.text = text
        self.wordCount = wordCount
        self.wpm = wpm
        self.difficulty = difficulty
    }
}

public enum SentenceLengthMode: String, Codable, CaseIterable, Sendable, Identifiable {
    case short
    case medium
    case long

    public var id: String { rawValue }
}

public enum PlaybackRate: Double, CaseIterable, Sendable, Identifiable {
    case x0_8 = 0.8
    case x1_0 = 1.0
    case x1_2 = 1.2
    case x1_5 = 1.5
    case x2_0 = 2.0

    public var id: Double { rawValue }

    public var label: String {
        rawValue == floor(rawValue) ? "\(Int(rawValue))x" : "\(rawValue)x"
    }

    public func next() -> PlaybackRate {
        let all = Self.allCases
        guard let idx = all.firstIndex(of: self) else { return .x1_0 }
        return all[(idx + 1) % all.count]
    }
}

public enum ProgressEvaluation: Equatable, Sendable {
    case none(newClipEndMs: Int? = nil, shouldUpdateClipEnd: Bool = false)
    case pause(clearClipEnd: Bool = false)
    case advance(activeIndex: Int, newClipEndMs: Int? = nil, shouldUpdateClipEnd: Bool = false)
}

public struct LoadedLocalCaptions: Equatable, Sendable {
    public let cues: [CaptionCue]
    public let rawSentences: [Sentence]
    public let sentences: [Sentence]
}

public enum CaptionSegmentation {
    private struct LengthProfile {
        let gapMs: Int
        let maxDurationMs: Int
        let maxWordsEn: Int
        let maxWordsCjk: Int
        let clauseMinEn: Int
        let clauseMinCjk: Int
    }

    private static let sentencePadMs = 150

    private static func profile(for mode: SentenceLengthMode) -> LengthProfile {
        switch mode {
        case .short:
            return LengthProfile(gapMs: 250, maxDurationMs: 4000, maxWordsEn: 8, maxWordsCjk: 14, clauseMinEn: 4, clauseMinCjk: 6)
        case .medium:
            return LengthProfile(gapMs: 380, maxDurationMs: 7500, maxWordsEn: 20, maxWordsCjk: 30, clauseMinEn: 8, clauseMinCjk: 12)
        case .long:
            return LengthProfile(gapMs: 650, maxDurationMs: 14000, maxWordsEn: 36, maxWordsCjk: 55, clauseMinEn: 22, clauseMinCjk: 30)
        }
    }

    public static func difficulty(fromWpm wpm: Double) -> SentenceDifficulty {
        if wpm < 145 { return .easy }
        if wpm <= 180 { return .optimal }
        return .hard
    }

    public static func isCJK(_ text: String) -> Bool {
        text.unicodeScalars.contains { scalar in
            let v = scalar.value
            return (0x3040...0x30FF).contains(v) ||
                   (0x3400...0x4DBF).contains(v) ||
                   (0x4E00...0x9FFF).contains(v)
        }
    }

    public static func countWords(_ text: String) -> Int {
        if isCJK(text) {
            let stripSet = CharacterSet.whitespacesAndNewlines
                .union(CharacterSet(charactersIn: ".,!?;:()[]{}\"'，。！？；：、（）「」"))
            return text.unicodeScalars.filter { !stripSet.contains($0) }.count
        }
        return text.split(whereSeparator: \.isWhitespace).count
    }

    private static func endsSentence(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let closing = CharacterSet(charactersIn: "\"')]」』")
        var idx = trimmed.endIndex
        while idx > trimmed.startIndex {
            let prev = trimmed.index(before: idx)
            if trimmed[prev].unicodeScalars.allSatisfy({ closing.contains($0) }) {
                idx = prev
            } else {
                break
            }
        }
        guard idx > trimmed.startIndex else { return false }
        let lastChar = trimmed[trimmed.index(before: idx)]
        return ".!?…。！？".contains(lastChar)
    }

    private static func endsClause(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let closing = CharacterSet(charactersIn: "\"')]」』")
        var idx = trimmed.endIndex
        while idx > trimmed.startIndex {
            let prev = trimmed.index(before: idx)
            if trimmed[prev].unicodeScalars.allSatisfy({ closing.contains($0) }) {
                idx = prev
            } else {
                break
            }
        }
        guard idx > trimmed.startIndex else { return false }
        let lastChar = trimmed[trimmed.index(before: idx)]
        return ",;:—、，；：-".contains(lastChar)
    }

    private static func splitClauses(_ text: String) -> [String] {
        let delims = Set(",;:—、，；：-")
        var parts: [String] = []
        var current = ""
        for ch in text {
            current.append(ch)
            if delims.contains(ch) {
                let trimmed = current.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { parts.append(trimmed) }
                current = ""
            }
        }
        let tail = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if !tail.isEmpty { parts.append(tail) }
        return parts
    }

    private static func appendWithoutOverlap(_ prev: String, _ next: String) -> String {
        let a = prev.trimmingCharacters(in: .whitespacesAndNewlines)
        let b = next.trimmingCharacters(in: .whitespacesAndNewlines)
        if a.isEmpty { return b }
        if b.isEmpty { return a }
        if a.lowercased().hasSuffix(b.lowercased()) { return a }

        let aWords = a.split(whereSeparator: \.isWhitespace).map(String.init)
        let bWords = b.split(whereSeparator: \.isWhitespace).map(String.init)
        let maxOverlap = min(aWords.count, bWords.count)
        var overlap = 0
        if maxOverlap > 0 {
            for n in stride(from: maxOverlap, through: 1, by: -1) {
                let left = aWords.suffix(n).joined(separator: " ").lowercased()
                let right = bWords.prefix(n).joined(separator: " ").lowercased()
                if left == right {
                    overlap = n
                    break
                }
            }
        }
        if overlap == 0 { return "\(a) \(b)" }
        let rest = bWords.dropFirst(overlap).joined(separator: " ")
        return rest.isEmpty ? a : "\(a) \(rest)"
    }

    private static func normalizeCues(_ cues: [CaptionCue], mode: SentenceLengthMode) -> [CaptionCue] {
        guard mode == .short else { return cues }
        var out: [CaptionCue] = []
        for cue in cues {
            let text = cue.text.trimmingCharacters(in: .whitespacesAndNewlines)
            let parts = splitClauses(text)
            if countWords(text) <= 8 || parts.count <= 1 {
                out.append(cue)
                continue
            }
            let totalDuration = max(cue.endMs - cue.startMs, 10)
            let totalChars = max(text.count, 1)
            var offsetMs = cue.startMs
            for (idx, part) in parts.enumerated() {
                let dur = max(100, Int((Double(part.count) / Double(totalChars) * Double(totalDuration)).rounded()))
                let end = idx == parts.count - 1 ? cue.endMs : min(cue.endMs, offsetMs + dur)
                out.append(CaptionCue(startMs: offsetMs, endMs: end, text: part))
                offsetMs = end
            }
        }
        return out
    }

    public static func mergeSentences(_ cues: [CaptionCue], mode: SentenceLengthMode = .short) -> [Sentence] {
        guard !cues.isEmpty else { return [] }
        let prof = profile(for: mode)
        let normalized = normalizeCues(cues, mode: mode)
        var sentences: [Sentence] = []
        var buf = ""
        var rawStartMs = normalized[0].startMs
        var rawEndMs = normalized[0].endMs

        func flush() {
            let text = buf.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            guard !text.isEmpty else { return }
            let wc = countWords(text)
            let durationMs = max(rawEndMs - rawStartMs, 1)
            let wpm = Double(wc) * 60_000.0 / Double(durationMs)
            sentences.append(Sentence(
                index: sentences.count,
                startMs: max(0, rawStartMs - sentencePadMs),
                endMs: rawEndMs + sentencePadMs,
                text: text,
                wordCount: wc,
                wpm: Int(wpm.rounded()),
                difficulty: difficulty(fromWpm: wpm)
            ))
            buf = ""
        }

        for cue in normalized {
            if buf.isEmpty {
                rawStartMs = cue.startMs
                rawEndMs = cue.endMs
            } else {
                let gap = cue.startMs - rawEndMs
                let curDuration = rawEndMs - rawStartMs
                let curWords = countWords(buf)
                let cjk = isCJK(buf)
                let maxWords = cjk ? prof.maxWordsCjk : prof.maxWordsEn
                let clauseMin = cjk ? prof.clauseMinCjk : prof.clauseMinEn

                if gap > prof.gapMs || curDuration >= prof.maxDurationMs || curWords >= maxWords {
                    flush()
                    rawStartMs = cue.startMs
                    rawEndMs = cue.endMs
                } else if curWords >= clauseMin && endsClause(buf) {
                    flush()
                    rawStartMs = cue.startMs
                    rawEndMs = cue.endMs
                }
            }
            buf = appendWithoutOverlap(buf, cue.text)
            rawEndMs = max(rawEndMs, cue.endMs)
            if endsSentence(cue.text) {
                let curWords = countWords(buf)
                let curDuration = rawEndMs - rawStartMs
                if mode != .long || curWords >= prof.clauseMinEn || curDuration >= 6000 {
                    flush()
                }
            }
        }
        flush()
        return sentences
    }

    public static func resegmentSentences(
        cues: [CaptionCue],
        fallbackSentences: [Sentence],
        mode: SentenceLengthMode
    ) -> [Sentence] {
        if !cues.isEmpty { return mergeSentences(cues, mode: mode) }
        if fallbackSentences.isEmpty { return [] }
        if mode == .medium { return fallbackSentences }

        if mode == .short {
            var result: [Sentence] = []
            for s in fallbackSentences {
                let clauses = splitClauses(s.text)
                if s.wordCount <= 8 || clauses.count <= 1 {
                    result.append(Sentence(
                        index: result.count, startMs: s.startMs, endMs: s.endMs,
                        text: s.text, wordCount: s.wordCount, wpm: s.wpm, difficulty: s.difficulty
                    ))
                    continue
                }
                let totalDur = max(s.endMs - s.startMs, 10)
                let totalLen = max(s.text.count, 1)
                var start = s.startMs
                for (idx, clause) in clauses.enumerated() {
                    let dur = Int((Double(clause.count) / Double(totalLen) * Double(totalDur)).rounded())
                    let end = idx == clauses.count - 1 ? s.endMs : start + dur
                    let wc = countWords(clause)
                    let wpm = Double(wc) * 60_000.0 / Double(max(end - start, 1))
                    result.append(Sentence(
                        index: result.count, startMs: start, endMs: end,
                        text: clause, wordCount: wc, wpm: Int(wpm.rounded()),
                        difficulty: difficulty(fromWpm: wpm)
                    ))
                    start = end
                }
            }
            return result
        }

        var result: [Sentence] = []
        var cur: Sentence?
        for s in fallbackSentences {
            guard let existing = cur else {
                cur = s
                continue
            }
            let gap = s.startMs - existing.endMs
            let combinedDuration = s.endMs - existing.startMs
            if gap <= 650 && combinedDuration <= 14000 {
                let combinedText = "\(existing.text) \(s.text)".trimmingCharacters(in: .whitespaces)
                let wc = countWords(combinedText)
                let wpm = Double(wc) * 60_000.0 / Double(max(combinedDuration, 1))
                let merged = Sentence(
                    index: result.count, startMs: existing.startMs, endMs: s.endMs,
                    text: combinedText, wordCount: wc, wpm: Int(wpm.rounded()),
                    difficulty: difficulty(fromWpm: wpm)
                )
                if endsSentence(s.text) {
                    result.append(merged)
                    cur = nil
                } else {
                    cur = merged
                }
            } else {
                result.append(Sentence(
                    index: result.count, startMs: existing.startMs, endMs: existing.endMs,
                    text: existing.text, wordCount: existing.wordCount, wpm: existing.wpm,
                    difficulty: existing.difficulty
                ))
                cur = s
            }
        }
        if let remaining = cur {
            result.append(Sentence(
                index: result.count, startMs: remaining.startMs, endMs: remaining.endMs,
                text: remaining.text, wordCount: remaining.wordCount, wpm: remaining.wpm,
                difficulty: remaining.difficulty
            ))
        }
        return result
    }

    public static func parseCaptionsPayload(_ data: Data, mode: SentenceLengthMode) -> LoadedLocalCaptions {
        struct RawPayload: Decodable {
            let cues: [CaptionCue]?
            let sentences: [Sentence]?
        }
        guard let decoded = try? JSONDecoder().decode(RawPayload.self, from: data) else {
            return LoadedLocalCaptions(cues: [], rawSentences: [], sentences: [])
        }
        let cues = (decoded.cues ?? []).filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let rawSentences = (decoded.sentences ?? []).filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let sentences = resegmentSentences(cues: cues, fallbackSentences: rawSentences, mode: mode)
        return LoadedLocalCaptions(cues: cues, rawSentences: rawSentences, sentences: sentences)
    }

    public static func findSentenceIndexAtTime(_ sentences: [Sentence], currentTimeSec: Double) -> Int {
        guard !sentences.isEmpty else { return 0 }
        let currentMs = currentTimeSec * 1000.0
        for (idx, s) in sentences.enumerated() {
            if currentMs >= Double(s.startMs) && currentMs <= Double(s.endMs) {
                return idx
            }
        }
        for idx in stride(from: sentences.count - 1, through: 0, by: -1) {
            if currentMs >= Double(sentences[idx].startMs) {
                return idx
            }
        }
        return 0
    }

    public static func evaluatePlaybackProgress(
        currentTimeSec: Double,
        sentences: [Sentence],
        paused: Bool,
        sentencePause: Bool,
        clipEndMs: Int?,
        activeIndex: Int
    ) -> ProgressEvaluation {
        guard !sentences.isEmpty, !paused else { return .none() }
        let slackMs = 40.0
        func clipEnded(_ endMs: Int) -> Bool {
            currentTimeSec * 1000.0 >= Double(endMs) - slackMs
        }

        if !sentencePause {
            if let last = sentences.last, clipEnded(last.endMs) {
                return .pause(clearClipEnd: true)
            }
            let idx = findSentenceIndexAtTime(sentences, currentTimeSec: currentTimeSec)
            if idx != activeIndex {
                return .advance(activeIndex: idx)
            }
            return .none()
        }

        if let clipEndMs {
            if clipEnded(clipEndMs) {
                return .pause(clearClipEnd: false)
            }
            return .none()
        }

        let idx = findSentenceIndexAtTime(sentences, currentTimeSec: currentTimeSec)
        let endMs = sentences[idx].endMs
        if idx != activeIndex {
            return .advance(activeIndex: idx, newClipEndMs: endMs, shouldUpdateClipEnd: true)
        }
        return .none(newClipEndMs: endMs, shouldUpdateClipEnd: true)
    }

    public static func formatTime(_ ms: Int) -> String {
        let totalSeconds = max(0, ms / 1000)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    public static func formatTimeRange(startMs: Int, endMs: Int) -> String {
        "\(formatTime(startMs)) - \(formatTime(endMs))"
    }
}
