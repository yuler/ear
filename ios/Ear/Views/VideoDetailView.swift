import AVFoundation
import AVKit
import SwiftUI

struct VideoDetailView: View {
    let videoId: String
    let engine: MirrorEngine
    let onToast: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var player = AVPlayer()
    @State private var audioController = AudioSessionController()
    @State private var timeObserver: Any?
    @State private var endObserver: NSObjectProtocol?

    @State private var mediaURL: URL?
    @State private var thumbURL: URL?
    @State private var mediaLoadFailed = false
    @State private var isPlaying = false
    @State private var isMuted = false
    @State private var rate: PlaybackRate = .x1_0
    @State private var currentTimeSec: Double = 0
    @State private var durationSec: Double = 0

    @State private var studyState = VideoStudyState()
    @State private var captionTrack: CaptionTrackInfo?
    @State private var rawCues: [CaptionCue] = []
    @State private var rawSentences: [Sentence] = []
    @State private var sentences: [Sentence] = []
    @State private var activeIndex: Int = 0
    @State private var clipEndMs: Int?
    @State private var sentencePause = false
    @State private var maskAll = true
    @State private var revealedIndices: Set<Int> = []
    @State private var revealedWords: Set<String> = []
    @State private var selectedWord: SelectedWord?
    @State private var inspectorCollapsed = false

    @State private var fullscreenPresented = false
    @State private var infoPresented = false
    @State private var rawSubsPresented = false
    @State private var noteSheetSentence: Sentence?

    private var copy: AppCopy { AppCopy(engine.settings.language) }
    private var theme: EarTheme { EarTheme(colorScheme: colorScheme, appAccent: engine.settings.accent) }
    private var item: MirrorItemView? { engine.library.first { $0.videoId == videoId } }

    var body: some View {
        VStack(spacing: 0) {
            VideoStageView(
                player: player,
                item: item,
                mediaURL: mediaURL,
                thumbURL: thumbURL,
                mediaLoadFailed: mediaLoadFailed,
                isPlaying: isPlaying,
                isMuted: isMuted,
                currentTimeSec: currentTimeSec,
                durationSec: durationSec,
                sentences: sentences,
                sentenceLength: studyState.sentenceLength,
                blockerEnabled: studyState.blockerEnabled,
                blockerRect: $studyState.blockerRect,
                theme: theme,
                copy: copy,
                onBack: { dismiss() },
                onTogglePlay: { togglePlay() },
                onSeek: { seek(to: $0) },
                onToggleMute: { toggleMute() },
                onFullscreen: { fullscreenPresented = true },
                onChangeSentenceLength: { changeSentenceLength($0) },
                onToggleBlocker: { enabled in
                    studyState.blockerEnabled = enabled
                    persistStudyState()
                },
                onCommitBlockerRect: { rect in
                    studyState.blockerRect = rect
                    persistStudyState()
                },
                onOpenRawSubtitles: { rawSubsPresented = true },
                onOpenVideoInfo: { infoPresented = true }
            )

            if let cur = currentSentence {
                let isMasked = maskAll && !revealedIndices.contains(cur.index)
                ActiveSentenceInspectorView(
                    sentence: cur,
                    totalCount: sentences.count,
                    currentTimeSec: currentTimeSec,
                    isPlaying: isPlaying,
                    masked: isMasked,
                    selectedWord: selectedWord,
                    revealedWords: revealedWords,
                    isBookmarked: studyState.bookmarkedIndices.contains(cur.index),
                    isWordStarred: { isWordStarred($0) },
                    noteText: studyState.notes[cur.index] ?? "",
                    isCollapsed: $inspectorCollapsed,
                    theme: theme,
                    copy: copy,
                    onWordPress: { tokenIdx, raw in
                        handleWordPress(sentence: cur, tokenIdx: tokenIdx, raw: raw, sentenceMasked: isMasked)
                    },
                    onClearWord: { selectedWord = nil },
                    onStarWord: { toggleStarWord($0) },
                    onToggleBookmark: { toggleBookmark(cur.index) },
                    onToggleReveal: { toggleRevealSentence(cur.index) },
                    onRepeatSentence: { repeatCurrent() },
                    onCopySentence: { copySentence(cur) },
                    onOpenNote: { noteSheetSentence = cur },
                    onOpenRawSubtitles: { rawSubsPresented = true }
                )

                TranscriptStreamView(
                    sentences: sentences,
                    activeIndex: activeIndex,
                    maskAll: maskAll,
                    revealedIndices: revealedIndices,
                    bookmarkedIndices: studyState.bookmarkedIndices,
                    notes: studyState.notes,
                    theme: theme,
                    copy: copy,
                    onPlaySentence: { playSentence($0) },
                    onToggleReveal: { toggleRevealSentence($0) },
                    onCopySentence: { copySentence($0) },
                    onToggleBookmark: { toggleBookmark($0) },
                    onOpenNote: { idx in
                        if idx >= 0, idx < sentences.count {
                            noteSheetSentence = sentences[idx]
                        }
                    }
                )
            } else {
                ContentUnavailableView(copy.noCaptions, systemImage: "captions.bubble")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(theme.well)
            }

            PlayerBottomDockView(
                isPlaying: isPlaying,
                hasMedia: mediaURL != nil,
                hasSentences: !sentences.isEmpty,
                maskAll: maskAll,
                sentencePause: sentencePause,
                rate: rate,
                theme: theme,
                copy: copy,
                onToggleMask: {
                    maskAll.toggle()
                    UISelectionFeedbackGenerator().selectionChanged()
                },
                onPrevSentence: { prevSentence() },
                onTogglePlay: { togglePlay() },
                onRepeatCurrent: { repeatCurrent() },
                onNextSentence: { nextSentence() },
                onToggleSentencePause: {
                    sentencePause.toggle()
                    clipEndMs = sentencePause ? currentSentence?.endMs : nil
                    UISelectionFeedbackGenerator().selectionChanged()
                },
                onCycleRate: {
                    rate = rate.next()
                    if isPlaying { player.rate = Float(rate.rawValue) }
                    updateNowPlaying()
                }
            )
        }
        .background(theme.well)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $infoPresented) {
            if let item {
                VideoInfoSheetView(item: item, captionTrack: captionTrack, mediaURL: mediaURL, copy: copy)
            }
        }
        .sheet(isPresented: $rawSubsPresented) {
            RawSubtitlesSheetView(cues: rawCues, sentences: sentences, copy: copy)
        }
        .sheet(item: $noteSheetSentence) { sentence in
            NoteEditorSheetView(
                sentence: sentence,
                initialText: studyState.notes[sentence.index] ?? "",
                copy: copy
            ) { updated in
                if updated.isEmpty {
                    studyState.notes.removeValue(forKey: sentence.index)
                } else {
                    studyState.notes[sentence.index] = updated
                }
                persistStudyState()
            }
        }
        .fullScreenCover(isPresented: $fullscreenPresented) {
            FullscreenAVPlayerSheet(player: player)
                .ignoresSafeArea()
        }
        .task(id: videoId) {
            await setupMediaAndCaptions()
        }
        .onDisappear {
            saveLastPosition()
            teardownPlayer()
        }
    }

    private var currentSentence: Sentence? {
        guard !sentences.isEmpty else { return nil }
        let idx = max(0, min(sentences.count - 1, activeIndex))
        return sentences[idx]
    }

    private func setupMediaAndCaptions() async {
        guard let item else { return }
        if let durationMs = item.durationMs, durationSec == 0 {
            durationSec = Double(durationMs) / 1000.0
        }

        let loadedStudy = await engine.loadStudyState(for: videoId)
        studyState = loadedStudy
        thumbURL = await engine.thumbnailURL(for: item)

        let loadedCaptions = await engine.loadCaptions(for: videoId, mode: loadedStudy.sentenceLength)
        captionTrack = loadedCaptions.track
        rawCues = loadedCaptions.cues
        rawSentences = loadedCaptions.rawSentences
        sentences = loadedCaptions.sentences
        activeIndex = 0
        revealedIndices = []
        revealedWords = []
        selectedWord = nil

        guard let url = await engine.playableURL(for: item) else {
            mediaLoadFailed = true
            return
        }
        mediaURL = url
        let avItem = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: avItem)
        player.isMuted = isMuted

        if let assetDuration = try? await avItem.asset.load(.duration), assetDuration.seconds.isFinite, assetDuration.seconds > 0 {
            durationSec = assetDuration.seconds
        }

        if let savedPos = loadedStudy.lastPositionSec, savedPos > 0, durationSec == 0 || savedPos < max(0, durationSec - 1) {
            seek(to: savedPos)
        }

        audioController.onPlay = { if !isPlaying { togglePlay() } }
        audioController.onPause = { if isPlaying { togglePlay() } }
        audioController.onTogglePlayPause = { togglePlay() }
        audioController.onPreviousSentence = { prevSentence() }
        audioController.onNextSentence = { nextSentence() }
        audioController.activate()

        let interval = CMTime(seconds: 0.08, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [self] time in
            Task { @MainActor in
                let sec = time.seconds.isFinite ? max(0, time.seconds) : 0
                currentTimeSec = sec
                let eval = CaptionSegmentation.evaluatePlaybackProgress(
                    currentTimeSec: sec,
                    sentences: sentences,
                    paused: !isPlaying,
                    sentencePause: sentencePause,
                    clipEndMs: clipEndMs,
                    activeIndex: activeIndex
                )
                switch eval {
                case .pause(let clearClip):
                    pausePlayback()
                    if clearClip { clipEndMs = nil }
                case .advance(let nextIdx, let newEnd, let shouldUpdate):
                    activeIndex = nextIdx
                    selectedWord = nil
                    if shouldUpdate { clipEndMs = newEnd }
                    updateNowPlaying()
                case .none(let newEnd, let shouldUpdate):
                    if shouldUpdate { clipEndMs = newEnd }
                }
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: avItem,
            queue: .main
        ) { _ in
            Task { @MainActor in
                pausePlayback()
                clipEndMs = nil
            }
        }
        updateNowPlaying()
    }

    private func teardownPlayer() {
        player.pause()
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }
        audioController.deactivate()
    }

    private func togglePlay() {
        if isPlaying {
            pausePlayback()
        } else {
            if sentencePause, let cur = currentSentence {
                clipEndMs = cur.endMs
            } else {
                clipEndMs = nil
            }
            isPlaying = true
            player.playImmediately(atRate: Float(rate.rawValue))
            updateNowPlaying()
        }
    }

    private func pausePlayback() {
        isPlaying = false
        player.pause()
        saveLastPosition()
        updateNowPlaying()
    }

    private func toggleMute() {
        isMuted.toggle()
        player.isMuted = isMuted
    }

    private func seek(to seconds: Double) {
        currentTimeSec = seconds
        let cm = CMTime(seconds: seconds, preferredTimescale: 600)
        player.seek(to: cm, toleranceBefore: .zero, toleranceAfter: .zero)
        activeIndex = CaptionSegmentation.findSentenceIndexAtTime(sentences, currentTimeSec: seconds)
        clipEndMs = nil
        updateNowPlaying()
    }

    private func playSentence(_ sentence: Sentence) {
        activeIndex = sentence.index
        selectedWord = nil
        clipEndMs = sentencePause ? sentence.endMs : nil
        let targetSec = Double(max(0, sentence.startMs)) / 1000.0
        currentTimeSec = targetSec
        let cm = CMTime(seconds: targetSec, preferredTimescale: 600)
        player.seek(to: cm, toleranceBefore: .zero, toleranceAfter: .zero)
        isPlaying = true
        player.playImmediately(atRate: Float(rate.rawValue))
        updateNowPlaying()
    }

    private func repeatCurrent() {
        if let cur = currentSentence {
            playSentence(cur)
        } else {
            seek(to: 0)
            isPlaying = true
            player.playImmediately(atRate: Float(rate.rawValue))
        }
    }

    private func prevSentence() {
        let idx = activeIndex - 1
        if idx >= 0, idx < sentences.count {
            playSentence(sentences[idx])
        } else {
            repeatCurrent()
        }
    }

    private func nextSentence() {
        let idx = activeIndex + 1
        if idx < sentences.count {
            playSentence(sentences[idx])
        } else {
            repeatCurrent()
        }
    }

    private func changeSentenceLength(_ mode: SentenceLengthMode) {
        guard mode != studyState.sentenceLength else { return }
        studyState.sentenceLength = mode
        persistStudyState()
        sentences = CaptionSegmentation.resegmentSentences(
            cues: rawCues,
            fallbackSentences: rawSentences,
            mode: mode
        )
        revealedIndices = []
        revealedWords = []
        selectedWord = nil
        activeIndex = CaptionSegmentation.findSentenceIndexAtTime(sentences, currentTimeSec: currentTimeSec)
        clipEndMs = sentencePause ? currentSentence?.endMs : nil
    }

    private func handleWordPress(sentence: Sentence, tokenIdx: Int, raw: String, sentenceMasked: Bool) {
        let key = "\(sentence.index):\(tokenIdx)"
        if sentenceMasked && !revealedWords.contains(key) {
            revealedWords.insert(key)
            selectedWord = SelectedWord(sentenceIdx: sentence.index, tokenIdx: tokenIdx, raw: raw)
            UISelectionFeedbackGenerator().selectionChanged()
            return
        }
        if let sel = selectedWord, sel.sentenceIdx == sentence.index, sel.tokenIdx == tokenIdx {
            selectedWord = nil
        } else {
            selectedWord = SelectedWord(sentenceIdx: sentence.index, tokenIdx: tokenIdx, raw: raw)
        }
    }

    private func toggleRevealSentence(_ idx: Int) {
        if maskAll {
            if revealedIndices.contains(idx) {
                revealedIndices.remove(idx)
            } else {
                revealedIndices.insert(idx)
            }
        } else {
            maskAll = true
            revealedIndices.remove(idx)
        }
    }

    private func toggleBookmark(_ idx: Int) {
        if studyState.bookmarkedIndices.contains(idx) {
            studyState.bookmarkedIndices.remove(idx)
        } else {
            studyState.bookmarkedIndices.insert(idx)
        }
        persistStudyState()
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func isWordStarred(_ raw: String) -> Bool {
        let norm = SubtitleStudioHelpers.normalizeWordToken(raw)
        guard !norm.isEmpty else { return false }
        return studyState.starredWords.contains(norm)
    }

    private func toggleStarWord(_ raw: String) {
        let norm = SubtitleStudioHelpers.normalizeWordToken(raw)
        guard !norm.isEmpty else { return }
        if studyState.starredWords.contains(norm) {
            studyState.starredWords.remove(norm)
        } else {
            studyState.starredWords.insert(norm)
        }
        persistStudyState()
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func copySentence(_ sentence: Sentence) {
        UIPasteboard.general.string = sentence.text
        onToast(copy.toastCopied)
    }

    private func saveLastPosition() {
        guard currentTimeSec > 0 else { return }
        studyState.lastPositionSec = currentTimeSec
        persistStudyState()
    }

    private func persistStudyState() {
        engine.saveStudyState(studyState, for: videoId)
    }

    private func updateNowPlaying() {
        audioController.updateNowPlaying(
            title: item?.title ?? "Ear",
            subtitle: currentSentence?.text,
            currentTimeSec: currentTimeSec,
            durationSec: durationSec,
            isPlaying: isPlaying,
            rate: rate.rawValue
        )
    }
}
