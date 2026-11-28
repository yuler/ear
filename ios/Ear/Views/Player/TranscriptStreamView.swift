import SwiftUI

struct TranscriptStreamView: View {
    let sentences: [Sentence]
    let activeIndex: Int
    let maskAll: Bool
    let revealedIndices: Set<Int>
    let bookmarkedIndices: Set<Int>
    let notes: [Int: String]
    let theme: EarTheme
    let copy: AppCopy

    let onPlaySentence: (Sentence) -> Void
    let onToggleReveal: (Int) -> Void
    let onCopySentence: (Sentence) -> Void
    let onToggleBookmark: (Int) -> Void
    let onOpenNote: (Int) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(sentences) { sentence in
                        let isActive = sentence.index == activeIndex
                        let isMasked = maskAll && !revealedIndices.contains(sentence.index)
                        let isBookmarked = bookmarkedIndices.contains(sentence.index)
                        let hasNote = !(notes[sentence.index]?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)

                        TranscriptSentenceRow(
                            sentence: sentence,
                            isActive: isActive,
                            isMasked: isMasked,
                            isBookmarked: isBookmarked,
                            hasNote: hasNote,
                            theme: theme,
                            copy: copy,
                            onTap: {
                                if maskAll && isActive {
                                    onToggleReveal(sentence.index)
                                }
                                onPlaySentence(sentence)
                            },
                            onPlay: { onPlaySentence(sentence) },
                            onCopy: { onCopySentence(sentence) },
                            onToggleBookmark: { onToggleBookmark(sentence.index) },
                            onOpenNote: { onOpenNote(sentence.index) }
                        )
                        .id(sentence.index)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
            .background(theme.well)
            .onChange(of: activeIndex) { _, idx in
                withAnimation(.easeInOut(duration: 0.25)) {
                    proxy.scrollTo(idx, anchor: .center)
                }
            }
        }
    }
}

private struct TranscriptSentenceRow: View {
    let sentence: Sentence
    let isActive: Bool
    let isMasked: Bool
    let isBookmarked: Bool
    let hasNote: Bool
    let theme: EarTheme
    let copy: AppCopy

    let onTap: () -> Void
    let onPlay: () -> Void
    let onCopy: () -> Void
    let onToggleBookmark: () -> Void
    let onOpenNote: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Capsule()
                .fill(theme.brand)
                .frame(width: 3, height: 14)
                .scaleEffect(y: isActive ? 1.0 : 0.4)
                .opacity(isActive ? 1.0 : 0.0)
                .padding(.top, 3)
                .animation(.easeOut(duration: 0.2), value: isActive)

            Text(CaptionSegmentation.formatTime(sentence.startMs))
                .font(.system(size: 11, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(isActive ? theme.brand.opacity(0.85) : theme.dim)
                .frame(width: 36, alignment: .leading)
                .padding(.top, 2)

            ZStack(alignment: .leading) {
                Text(sentence.text)
                    .font(.system(size: 14, weight: isActive ? .semibold : .medium))
                    .foregroundStyle(isActive ? Color.primary : Color.primary.opacity(0.75))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .opacity(isMasked ? 0 : 1)
                    .animation(.easeOut(duration: 0.18), value: isMasked)

                VStack(alignment: .leading, spacing: 6) {
                    Capsule()
                        .fill(isActive ? theme.brand.opacity(0.25) : Color.primary.opacity(0.10))
                        .frame(height: 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.trailing, 32)

                    if sentence.wordCount > 7 {
                        Capsule()
                            .fill(isActive ? theme.brand.opacity(0.18) : Color.primary.opacity(0.10))
                            .frame(height: 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.trailing, 84)
                    }
                }
                .padding(.vertical, 2)
                .opacity(isMasked ? 1 : 0)
                .animation(.easeOut(duration: 0.18), value: isMasked)
                .allowsHitTesting(false)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 5) {
                if hasNote {
                    Image(systemName: "note.text")
                        .font(.system(size: 10))
                        .foregroundStyle(theme.dim)
                }
                if isBookmarked {
                    Circle()
                        .fill(theme.brand)
                        .frame(width: 6, height: 6)
                }
            }
            .padding(.top, 5)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isActive ? theme.brandSoft.opacity(0.85) : Color.clear)
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .contextMenu {
            Button(action: onPlay) {
                Label(copy.play, systemImage: "play.fill")
            }
            Button(action: onCopy) {
                Label(copy.copy, systemImage: "doc.on.doc")
            }
            Button(action: onToggleBookmark) {
                Label(isBookmarked ? copy.unbookmark : copy.bookmark, systemImage: isBookmarked ? "bookmark.slash" : "bookmark")
            }
            Button(action: onOpenNote) {
                Label(copy.note, systemImage: "note.text")
            }
        }
    }
}
