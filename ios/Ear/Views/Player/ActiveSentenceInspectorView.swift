import SwiftUI

struct SelectedWord: Equatable, Sendable {
    let sentenceIdx: Int
    let tokenIdx: Int
    let raw: String
}

struct ActiveSentenceInspectorView: View {
    let sentence: Sentence
    let totalCount: Int
    let currentTimeSec: Double
    let isPlaying: Bool
    let masked: Bool
    let selectedWord: SelectedWord?
    let revealedWords: Set<String>
    let isBookmarked: Bool
    let isWordStarred: (String) -> Bool
    let noteText: String
    @Binding var isCollapsed: Bool
    let theme: EarTheme
    let copy: AppCopy

    let onWordPress: (Int, String) -> Void
    let onClearWord: () -> Void
    let onStarWord: (String) -> Void
    let onToggleBookmark: () -> Void
    let onToggleReveal: () -> Void
    let onRepeatSentence: () -> Void
    let onCopySentence: () -> Void
    let onOpenNote: () -> Void
    let onOpenRawSubtitles: () -> Void

    private var tokens: [String] {
        SubtitleStudioHelpers.splitSentenceTokens(sentence.text)
    }

    private var spoken: SpokenWordProgress {
        SubtitleStudioHelpers.computeSpokenWordProgress(
            sentence: sentence,
            currentTimeSec: currentTimeSec,
            tokens: tokens
        )
    }

    private var isSweeping: Bool {
        isPlaying && spoken.spokenIndex >= 0 && spoken.spokenIndex < tokens.count
    }

    private var activeSelectedWord: SelectedWord? {
        guard let sel = selectedWord, sel.sentenceIdx == sentence.index else { return nil }
        return sel
    }

    private var hasNote: Bool {
        !noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 8) {
            if isCollapsed {
                collapsedBar
            } else {
                calloutStrip
                studyCard
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(theme.ground)
        .overlay(alignment: .bottom) {
            Rectangle().fill(theme.line).frame(height: 0.5)
        }
    }

    private var collapsedBar: some View {
        HStack(spacing: 8) {
            Text("#\(sentence.index + 1)")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(theme.brand)

            if masked {
                Capsule()
                    .fill(theme.brand.opacity(0.22))
                    .frame(width: 110, height: 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text(sentence.text)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                withAnimation(.easeInOut(duration: 0.2)) { isCollapsed = false }
            } label: {
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
            }
            .accessibilityLabel(copy.expand)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(theme.line, lineWidth: 1)
        )
    }

    private var calloutStrip: some View {
        HStack(spacing: 8) {
            if let sel = activeSelectedWord {
                HStack(spacing: 6) {
                    Text(cleanedWordDisplay(sel.raw))
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text(copy.selectedWord)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                let starred = isWordStarred(sel.raw)
                Button {
                    onStarWord(sel.raw)
                } label: {
                    Image(systemName: starred ? "star.fill" : "star")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(starred ? theme.amber : .secondary)
                        .frame(width: 28, height: 28)
                }
                .accessibilityLabel(starred ? copy.unstarWord : copy.starWord)

                Button(action: onClearWord) {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 26, height: 26)
                }
            } else {
                HStack(spacing: 6) {
                    Text(CaptionSegmentation.formatTimeRange(startMs: sentence.startMs, endMs: sentence.endMs))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(.primary)

                    Text("·")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text("\(sentence.wpm) wpm")
                        .font(.system(size: 12, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)

                    Text(sentence.difficulty.rawValue)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundStyle(theme.amber)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(theme.ground.opacity(0.65), in: RoundedRectangle(cornerRadius: 5))
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Button(action: onToggleBookmark) {
                    Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(isBookmarked ? theme.brand : .secondary)
                        .frame(width: 28, height: 28)
                }
                .accessibilityLabel(isBookmarked ? copy.unbookmark : copy.bookmark)
            }

            Button {
                withAnimation(.easeInOut(duration: 0.2)) { isCollapsed = true }
            } label: {
                Image(systemName: "chevron.up")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 26, height: 26)
            }
            .accessibilityLabel(copy.collapse)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(activeSelectedWord != nil ? theme.brandSoft : theme.amberSoft)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(
                    activeSelectedWord != nil ? theme.brand.opacity(0.35) : theme.amber.opacity(0.30),
                    lineWidth: 1
                )
        )
    }

    private var studyCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(theme.well)
                    Rectangle()
                        .fill(theme.brand)
                        .frame(width: geo.size.width * min(1, max(0, spoken.progress)))
                        .animation(.linear(duration: 0.1), value: spoken.progress)
                }
            }
            .frame(height: 2)

            VStack(alignment: .leading, spacing: 10) {
                WordFlowLayout(horizontalSpacing: 4, verticalSpacing: 6) {
                    ForEach(Array(tokens.enumerated()), id: \.offset) { idx, tok in
                        wordChip(idx: idx, token: tok)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if hasNote {
                    Button(action: onOpenNote) {
                        HStack(spacing: 6) {
                            Image(systemName: "note.text")
                                .font(.caption2)
                                .foregroundStyle(theme.brand)
                            Text(noteText)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(theme.well, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }

                Rectangle()
                    .fill(theme.line.opacity(0.75))
                    .frame(height: 0.5)

                microActionBar
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 10)
        }
        .background(theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(theme.line, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func wordChip(idx: Int, token: String) -> some View {
        let wordHidden = masked && !revealedWords.contains("\(sentence.index):\(idx)")
        let isSelected = !wordHidden && activeSelectedWord?.tokenIdx == idx
        let isSpokenNow = isSweeping && spoken.spokenIndex == idx
        let isSpokenPast = isSweeping && idx < spoken.spokenIndex
        let isUpcoming = isSweeping && idx > spoken.spokenIndex

        let bg: Color = {
            if wordHidden {
                if isSpokenNow { return theme.brand.opacity(0.25) }
                if isSpokenPast { return theme.brand.opacity(0.12) }
                return theme.well
            }
            if isSelected { return theme.brandSoft }
            if isSpokenNow { return theme.brandSoft.opacity(0.9) }
            return .clear
        }()

        let border: Color = {
            if wordHidden && isSpokenNow { return theme.brand.opacity(0.4) }
            if isSelected { return theme.brand }
            return .clear
        }()

        return Button {
            onWordPress(idx, token)
        } label: {
            Text(token)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.primary)
                .opacity(wordHidden ? 0 : (isUpcoming ? 0.45 : 1.0))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(bg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(border, lineWidth: 1)
                )
                .scaleEffect(isSpokenNow ? 1.04 : 1.0)
                .animation(.easeOut(duration: 0.16), value: isSpokenNow)
                .animation(.easeOut(duration: 0.16), value: wordHidden)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(wordHidden ? copy.tapToReveal : token)
    }

    private var microActionBar: some View {
        HStack(spacing: 4) {
            microButton(icon: "arrow.counterclockwise", active: false, label: copy.repeatSentence, action: onRepeatSentence)
            microButton(icon: masked ? "eye.slash" : "eye", active: !masked, label: masked ? copy.revealSentence : copy.hideSentence, action: onToggleReveal)
            microButton(icon: "doc.on.doc", active: false, label: copy.copy, action: onCopySentence)
            microButton(icon: isBookmarked ? "bookmark.fill" : "bookmark", active: isBookmarked, label: isBookmarked ? copy.unbookmark : copy.bookmark, action: onToggleBookmark)

            Button(action: onOpenNote) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "note.text")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(hasNote ? theme.brand : .secondary)
                        .frame(width: 28, height: 28)
                        .background(hasNote ? theme.brandSoft : .clear, in: RoundedRectangle(cornerRadius: 8))
                    if hasNote {
                        Circle()
                            .fill(theme.brand)
                            .frame(width: 5, height: 5)
                            .offset(x: -3, y: 4)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(copy.note)

            microButton(icon: "captions.bubble", active: false, label: copy.rawSubtitles, action: onOpenRawSubtitles)

            Spacer(minLength: 4)

            Text("\(sentence.index + 1)/\(totalCount) · \(sentence.wpm) wpm")
                .font(.system(size: 11, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(theme.dim)
                .lineLimit(1)
        }
    }

    private func microButton(icon: String, active: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(active ? theme.brand : .secondary)
                .frame(width: 28, height: 28)
                .background(active ? theme.brandSoft : .clear, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func cleanedWordDisplay(_ raw: String) -> String {
        raw.trimmingCharacters(in: CharacterSet(charactersIn: ".,!?;:，。！？；："))
    }
}

struct WordFlowLayout: Layout {
    var horizontalSpacing: CGFloat = 4
    var verticalSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxRowWidth: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                maxRowWidth = max(maxRowWidth, x - horizontalSpacing)
                x = 0
                y += rowHeight + verticalSpacing
                rowHeight = 0
            }
            x += size.width + horizontalSpacing
            rowHeight = max(rowHeight, size.height)
        }
        maxRowWidth = max(maxRowWidth, max(0, x - horizontalSpacing))
        return CGSize(width: min(maxWidth, maxRowWidth), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + verticalSpacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + horizontalSpacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
