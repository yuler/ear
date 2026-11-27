import AVFoundation
import AVKit
import SwiftUI

struct VideoDetailView: View {
    let videoId: String
    let engine: MirrorEngine
    let onToast: (String) -> Void

    @State private var player = AVPlayer()
    @State private var audioController = AudioSessionController()
    @State private var timeObserver: Any?
    @State private var endObserver: NSObjectProtocol?

    @State private var mediaURL: URL?
    @State private var mediaLoadFailed = false
    @State private var isPlaying = false
    @State private var rate: PlaybackRate = .x1_0
    @State private var currentTimeSec: Double = 0
    @State private var durationSec: Double = 0

    @State private var sentenceLength: SentenceLengthMode = .short
    @State private var rawCues: [CaptionCue] = []
    @State private var rawSentences: [Sentence] = []
    @State private var sentences: [Sentence] = []
    @State private var activeIndex: Int = 0
    @State private var clipEndMs: Int?
    @State private var sentencePause = false
    @State private var maskAll = true
    @State private var revealedIndices: Set<Int> = []
    @State private var blockerEnabled = false

    @State private var fullscreenPresented = false
    @State private var infoPresented = false
    @State private var rawSubsPresented = false

    private var copy: AppCopy { AppCopy(engine.settings.language) }
    private var item: MirrorItemView? { engine.library.first { $0.videoId == videoId } }

    var body: some View {
        VStack(spacing: 0) {
            videoStage
            Divider()
            subtitleStudio
            Divider()
            controlDock
        }
        .navigationTitle(item?.title ?? copy.videoInfo)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker(copy.sentenceLength, selection: Binding(
                        get: { sentenceLength },
                        set: { changeSentenceLength($0) }
                    )) {
                        ForEach(SentenceLengthMode.allCases) { mode in
                            Text(copy.sentenceLengthName(mode)).tag(mode)
                        }
                    }

                    if item?.isAudioOnly == false {
                        Toggle(copy.subtitleBlocker, isOn: $blockerEnabled)
                    }

                    Divider()

                    Button {
                        rawSubsPresented = true
                    } label: {
                        Label(copy.rawSubtitles, systemImage: "captions.bubble")
                    }

                    Button {
                        infoPresented = true
                    } label: {
                        Label(copy.videoInfo, systemImage: "info.circle")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $infoPresented) {
            if let item {
                VideoInfoSheetView(item: item, mediaURL: mediaURL, copy: copy)
            }
        }
        .sheet(isPresented: $rawSubsPresented) {
            RawSubtitlesSheetView(cues: rawCues, sentences: sentences, copy: copy)
        }
        .fullScreenCover(isPresented: $fullscreenPresented) {
            FullscreenAVPlayerSheet(player: player)
                .ignoresSafeArea()
        }
        .task(id: videoId) {
            await setupMediaAndCaptions()
        }
        .onDisappear {
            teardownPlayer()
        }
    }

    private var videoStage: some View {
        ZStack {
            Color.black

            if mediaURL != nil {
                InlineAVPlayerLayerView(player: player)
            } else if mediaLoadFailed {
                ContentUnavailableView(copy.mediaUnavailable, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.white)
            } else {
                ProgressView()
                    .tint(.white)
            }

            if item?.isAudioOnly == true, let thumb = item?.thumbnailUrl, let url = URL(string: thumb) {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFit()
                    }
                }
                .allowsHitTesting(false)
            }

            if item?.isAudioOnly == false && blockerEnabled {
                VStack {
                    Spacer()
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(.black.opacity(0.92))
                        .frame(height: 40)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 10)
                }
                .allowsHitTesting(false)
            }

            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { togglePlay() }

            if !isPlaying && mediaURL != nil {
                Image(systemName: "play.fill")
                    .font(.title)
                    .foregroundStyle(.white)
                    .padding(18)
                    .background(.black.opacity(0.55), in: Circle())
                    .allowsHitTesting(false)
            }

            if item?.isAudioOnly == false && mediaURL != nil {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button {
                            fullscreenPresented = true
                        } label: {
                            Image(systemName: "arrow.up.left.and.arrow.down.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.white)
                                .padding(8)
                                .background(.black.opacity(0.55), in: Circle())
                        }
                        .accessibilityLabel(copy.fullscreen)
                        .padding(10)
                    }
                }
            }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
    }

    private var subtitleStudio: some View {
        Group {
            if sentences.isEmpty {
                ContentUnavailableView(copy.noCaptions, systemImage: "captions.bubble")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollViewReader { proxy in
                    List {
                        ForEach(sentences) { sentence in
                            let isActive = sentence.index == activeIndex
                            let isVisible = !maskAll || revealedIndices.contains(sentence.index)
                            SentenceRowView(
                                sentence: sentence,
                                isActive: isActive,
                                isVisible: isVisible,
                                tapToRevealLabel: copy.tapToReveal,
                                onPlay: { playSentence(sentence) },
                                onToggleReveal: {
                                    if revealedIndices.contains(sentence.index) {
                                        revealedIndices.remove(sentence.index)
                                    } else {
                                        revealedIndices.insert(sentence.index)
                                    }
                                },
                                onCopy: {
                                    UIPasteboard.general.string = sentence.text
                                    onToast(copy.toastCopied)
                                }
                            )
                            .id(sentence.index)
                            .listRowBackground(isActive ? Color.accentColor.opacity(0.12) : Color.clear)
                        }
                    }
                    .listStyle(.plain)
                    .onChange(of: activeIndex) { _, idx in
                        withAnimation(.easeInOut(duration: 0.25)) {
                            proxy.scrollTo(idx, anchor: .center)
                        }
                    }
                }
            }
        }
    }

    private var controlDock: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Text(CaptionSegmentation.formatTime(Int(currentTimeSec * 1000)))
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(width: 38, alignment: .leading)

                Slider(
                    value: Binding(
                        get: { min(currentTimeSec, max(durationSec, 1)) },
                        set: { seek(to: $0) }
                    ),
                    in: 0...max(durationSec, 1)
                )

                Text(CaptionSegmentation.formatTime(Int(durationSec * 1000)))
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(width: 38, alignment: .trailing)
            }

            HStack {
                Button {
                    maskAll.toggle()
                    UISelectionFeedbackGenerator().selectionChanged()
                } label: {
                    Image(systemName: maskAll ? "eye.slash.fill" : "eye.fill")
                        .font(.title3)
                        .foregroundStyle(maskAll ? Color.accentColor : .secondary)
                }
                .accessibilityLabel(copy.blindMask)

                Spacer()

                Button { prevSentence() } label: {
                    Image(systemName: "backward.end.fill").font(.title3)
                }
                .disabled(sentences.isEmpty)

                Spacer()

                Button { togglePlay() } label: {
                    Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 44))
                }
                .disabled(mediaURL == nil)

                Spacer()

                Button { repeatCurrent() } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.title3)
                }
                .disabled(mediaURL == nil)

                Spacer()

                Button { nextSentence() } label: {
                    Image(systemName: "forward.end.fill").font(.title3)
                }
                .disabled(sentences.isEmpty)

                Spacer()

                Button {
                    sentencePause.toggle()
                    clipEndMs = sentencePause ? currentSentence?.endMs : nil
                    UISelectionFeedbackGenerator().selectionChanged()
                } label: {
                    Image(systemName: sentencePause ? "text.line.last.and.arrowtriangle.forward" : "text.justify.left")
                        .font(.title3)
                        .foregroundStyle(sentencePause ? Color.accentColor : .secondary)
                }
                .accessibilityLabel(copy.sentencePause)

                Spacer()

                Button {
                    rate = rate.next()
                    if isPlaying { player.rate = Float(rate.rawValue) }
                    updateNowPlaying()
                } label: {
                    Text(rate.label)
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.secondary.opacity(0.15), in: Capsule())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
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

        let loadedCaptions = await engine.loadCaptions(for: videoId, mode: sentenceLength)
        rawCues = loadedCaptions.cues
        rawSentences = loadedCaptions.rawSentences
        sentences = loadedCaptions.sentences
        activeIndex = 0
        revealedIndices = []

        guard let url = await engine.playableURL(for: item) else {
            mediaLoadFailed = true
            return
        }
        mediaURL = url
        let avItem = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: avItem)

        if let assetDuration = try? await avItem.asset.load(.duration), assetDuration.seconds.isFinite, assetDuration.seconds > 0 {
            durationSec = assetDuration.seconds
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
        updateNowPlaying()
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
        guard mode != sentenceLength else { return }
        sentenceLength = mode
        sentences = CaptionSegmentation.resegmentSentences(
            cues: rawCues,
            fallbackSentences: rawSentences,
            mode: mode
        )
        revealedIndices = []
        activeIndex = CaptionSegmentation.findSentenceIndexAtTime(sentences, currentTimeSec: currentTimeSec)
        clipEndMs = sentencePause ? currentSentence?.endMs : nil
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
