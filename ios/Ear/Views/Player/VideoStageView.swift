import AVFoundation
import SwiftUI
import UIKit

struct VideoStageView: View {
    let player: AVPlayer
    let item: MirrorItemView?
    let mediaURL: URL?
    let thumbURL: URL?
    let mediaLoadFailed: Bool
    let isPlaying: Bool
    let isMuted: Bool
    let currentTimeSec: Double
    let durationSec: Double
    let sentences: [Sentence]
    let sentenceLength: SentenceLengthMode
    let blockerEnabled: Bool
    @Binding var blockerRect: SubtitleBlockerRect
    let theme: EarTheme
    let copy: AppCopy

    let onBack: () -> Void
    let onTogglePlay: () -> Void
    let onSeek: (Double) -> Void
    let onToggleMute: () -> Void
    let onFullscreen: () -> Void
    let onChangeSentenceLength: (SentenceLengthMode) -> Void
    let onToggleBlocker: (Bool) -> Void
    let onCommitBlockerRect: (SubtitleBlockerRect) -> Void
    let onOpenRawSubtitles: () -> Void
    let onOpenVideoInfo: () -> Void

    @State private var controlsVisible = true
    @State private var hideTask: Task<Void, Never>?

    private var isAudioOnly: Bool { item?.isAudioOnly ?? false }
    private var showOverlay: Bool { !isPlaying || controlsVisible }

    private func stageHeight(for width: CGFloat) -> CGFloat {
        let screenHeight = UIScreen.main.bounds.height
        let maxHeight = screenHeight * 0.38
        guard let aspect = item?.mediaAspect, aspect > 0 else {
            return min(width * 9.0 / 16.0, maxHeight)
        }
        return min(width / CGFloat(aspect), maxHeight)
    }

    var body: some View {
        let width = UIScreen.main.bounds.width
        let height = stageHeight(for: width)

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

            if isAudioOnly {
                audioArtworkLayer
                    .allowsHitTesting(false)
            }

            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    handleStageTap()
                }

            if !isAudioOnly && blockerEnabled {
                SubtitleBlockerOverlay(
                    rect: $blockerRect,
                    onCommit: onCommitBlockerRect
                )
            }

            if showOverlay && mediaURL != nil {
                Button {
                    onTogglePlay()
                    bumpAutoHide()
                } label: {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 54, height: 54)
                        .background(theme.brand, in: Circle())
                        .shadow(color: .black.opacity(0.35), radius: 8, y: 3)
                }
                .accessibilityLabel(isPlaying ? copy.pause : copy.play)
                .transition(.opacity.combined(with: .scale(scale: 0.92)))
            }

            VStack(spacing: 0) {
                if showOverlay {
                    topBar
                        .transition(.opacity)
                }

                Spacer(minLength: 0)

                if showOverlay {
                    bottomControlsBar
                        .transition(.opacity)
                } else {
                    collapsedProgressHairline
                        .transition(.opacity)
                }
            }
        }
        .frame(width: width, height: height)
        .clipped()
        .background(Color.black.ignoresSafeArea(edges: .top))
        .animation(.easeOut(duration: 0.2), value: showOverlay)
        .onChange(of: isPlaying) { _, playing in
            if playing {
                scheduleAutoHide()
            } else {
                hideTask?.cancel()
                controlsVisible = true
            }
        }
        .onDisappear {
            hideTask?.cancel()
        }
    }

    @ViewBuilder
    private var audioArtworkLayer: some View {
        ZStack(alignment: .bottomLeading) {
            if let thumbURL, let uiImage = UIImage(contentsOfFile: thumbURL.path) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let raw = item?.thumbnailUrl, let remote = URL(string: raw), !raw.isEmpty {
                AsyncImage(url: remote) { phase in
                    if case .success(let image) = phase {
                        image
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        audioPlaceholder
                    }
                }
            } else {
                audioPlaceholder
            }

            HStack(spacing: 5) {
                Image(systemName: "headphones")
                    .font(.caption2.weight(.semibold))
                Text("Audio")
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(.white.opacity(0.9))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.black.opacity(0.55), in: Capsule())
            .padding(10)
        }
    }

    private var audioPlaceholder: some View {
        Image(systemName: "headphones")
            .font(.system(size: 40, weight: .light))
            .foregroundStyle(.white.opacity(0.35))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(.black.opacity(0.45), in: Circle())
            }
            .accessibilityLabel(copy.back)

            Text(item?.title ?? copy.videoInfo)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)

            Menu {
                Picker(copy.sentenceLength, selection: Binding(
                    get: { sentenceLength },
                    set: { onChangeSentenceLength($0) }
                )) {
                    ForEach(SentenceLengthMode.allCases) { mode in
                        Text(copy.sentenceLengthName(mode)).tag(mode)
                    }
                }

                if !isAudioOnly {
                    Toggle(copy.subtitleBlocker, isOn: Binding(
                        get: { blockerEnabled },
                        set: { onToggleBlocker($0) }
                    ))
                }

                Divider()

                Button(action: onOpenRawSubtitles) {
                    Label(copy.rawSubtitles, systemImage: "captions.bubble")
                }

                Button(action: onOpenVideoInfo) {
                    Label(copy.videoInfo, systemImage: "info.circle")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(.black.opacity(0.45), in: Circle())
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 16)
        .background(
            LinearGradient(
                colors: [.black.opacity(0.72), .black.opacity(0.28), .clear],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private var bottomControlsBar: some View {
        VStack(spacing: 6) {
            VideoSeekBar(
                currentTimeSec: currentTimeSec,
                durationSec: durationSec,
                sentences: sentences,
                brandColor: theme.brand,
                onSeek: { sec in
                    onSeek(sec)
                    bumpAutoHide()
                }
            )

            HStack(spacing: 10) {
                HStack(spacing: 4) {
                    Text(CaptionSegmentation.formatTime(Int(max(0, currentTimeSec) * 1000)))
                        .foregroundStyle(.white.opacity(0.95))
                    Text("/")
                        .foregroundStyle(.white.opacity(0.45))
                    Text(CaptionSegmentation.formatTime(Int(max(0, durationSec) * 1000)))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .monospacedDigit()

                Spacer(minLength: 0)

                Button {
                    onToggleMute()
                    bumpAutoHide()
                } label: {
                    Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(isMuted ? theme.brand : .white.opacity(0.9))
                        .frame(width: 28, height: 28)
                        .background(.white.opacity(isMuted ? 0.18 : 0.08), in: RoundedRectangle(cornerRadius: 7))
                }
                .accessibilityLabel(isMuted ? copy.unmute : copy.mute)

                if !isAudioOnly && mediaURL != nil {
                    Button {
                        onFullscreen()
                    } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .frame(width: 28, height: 28)
                            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 7))
                    }
                    .accessibilityLabel(copy.fullscreen)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 20)
        .padding(.bottom, 8)
        .background(
            LinearGradient(
                colors: [.clear, .black.opacity(0.5), .black.opacity(0.84)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private var collapsedProgressHairline: some View {
        GeometryReader { geo in
            let dur = max(0.1, durationSec)
            let ratio = min(1, max(0, currentTimeSec / dur))
            ZStack(alignment: .leading) {
                Rectangle().fill(.white.opacity(0.22))
                Rectangle()
                    .fill(theme.brand)
                    .frame(width: geo.size.width * ratio)
                ForEach(sentences) { s in
                    let frac = min(1, max(0, (Double(s.startMs) / 1000.0) / dur))
                    Rectangle()
                        .fill(.black.opacity(0.45))
                        .frame(width: 1)
                        .offset(x: geo.size.width * frac)
                }
            }
        }
        .frame(height: 3)
        .allowsHitTesting(false)
    }

    private func handleStageTap() {
        if isPlaying {
            controlsVisible.toggle()
            if controlsVisible {
                scheduleAutoHide()
            } else {
                hideTask?.cancel()
            }
        } else {
            onTogglePlay()
        }
    }

    private func bumpAutoHide() {
        if isPlaying {
            controlsVisible = true
            scheduleAutoHide()
        }
    }

    private func scheduleAutoHide() {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(2.6))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                if isPlaying {
                    controlsVisible = false
                }
            }
        }
    }
}

private struct VideoSeekBar: View {
    let currentTimeSec: Double
    let durationSec: Double
    let sentences: [Sentence]
    let brandColor: Color
    let onSeek: (Double) -> Void

    @State private var isDragging = false
    @State private var dragRatio: Double = 0

    var body: some View {
        GeometryReader { geo in
            let dur = max(0.1, durationSec)
            let liveRatio = min(1, max(0, currentTimeSec / dur))
            let ratio = isDragging ? dragRatio : liveRatio
            let width = max(1, geo.size.width)

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.white.opacity(0.28))
                    .frame(height: isDragging ? 5 : 3)

                Capsule()
                    .fill(brandColor)
                    .frame(width: width * ratio, height: isDragging ? 5 : 3)

                ForEach(sentences) { s in
                    let frac = min(1, max(0, (Double(s.startMs) / 1000.0) / dur))
                    Rectangle()
                        .fill(.black.opacity(0.55))
                        .frame(width: 1, height: isDragging ? 5 : 3)
                        .offset(x: width * frac)
                }

                Circle()
                    .fill(brandColor)
                    .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 1.5))
                    .frame(width: isDragging ? 14 : 11, height: isDragging ? 14 : 11)
                    .shadow(color: .black.opacity(0.45), radius: 2, y: 1)
                    .offset(x: max(0, min(width - 11, width * ratio - 5.5)))
            }
            .frame(height: 18)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isDragging = true
                        let r = min(1, max(0, Double(value.location.x / width)))
                        dragRatio = r
                        onSeek(r * dur)
                    }
                    .onEnded { value in
                        let r = min(1, max(0, Double(value.location.x / width)))
                        isDragging = false
                        onSeek(r * dur)
                    }
            )
        }
        .frame(height: 18)
    }
}

private struct SubtitleBlockerOverlay: View {
    @Binding var rect: SubtitleBlockerRect
    let onCommit: (SubtitleBlockerRect) -> Void

    @State private var dragStart: SubtitleBlockerRect?

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width * CGFloat(rect.width / 100.0)
            let h = geo.size.height * CGFloat(rect.height / 100.0)
            let cx = geo.size.width * CGFloat((rect.x + rect.width / 2.0) / 100.0)
            let cy = geo.size.height * CGFloat((rect.y + rect.height / 2.0) / 100.0)

            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(.black.opacity(0.55))
                    )
                    .overlay(
                        Canvas { ctx, size in
                            let step: CGFloat = 10
                            var path = Path()
                            var x: CGFloat = step
                            while x < size.width {
                                path.move(to: CGPoint(x: x, y: 0))
                                path.addLine(to: CGPoint(x: x, y: size.height))
                                x += step
                            }
                            var y: CGFloat = step
                            while y < size.height {
                                path.move(to: CGPoint(x: 0, y: y))
                                path.addLine(to: CGPoint(x: size.width, y: y))
                                y += step
                            }
                            ctx.stroke(path, with: .color(.white.opacity(0.08)), lineWidth: 0.5)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(.white.opacity(0.24), lineWidth: 1)
                    )
                    .gesture(dragGesture(handle: .move, container: geo.size))

                VStack {
                    resizeHandle
                        .gesture(dragGesture(handle: .resizeTop, container: geo.size))
                    Spacer(minLength: 0)
                    resizeHandle
                        .gesture(dragGesture(handle: .resizeBottom, container: geo.size))
                }
            }
            .frame(width: max(36, w), height: max(22, h))
            .position(x: cx, y: cy)
        }
    }

    private var resizeHandle: some View {
        Capsule()
            .fill(.white.opacity(0.55))
            .frame(width: 28, height: 3)
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
    }

    private func dragGesture(handle: SubtitleBlockerDragMath.Handle, container: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                let start = dragStart ?? rect
                if dragStart == nil { dragStart = start }
                rect = SubtitleBlockerDragMath.updatedRect(
                    from: start,
                    translation: value.translation,
                    containerSize: container,
                    handle: handle
                )
            }
            .onEnded { value in
                let start = dragStart ?? rect
                let finalRect = SubtitleBlockerDragMath.updatedRect(
                    from: start,
                    translation: value.translation,
                    containerSize: container,
                    handle: handle
                )
                rect = finalRect
                dragStart = nil
                onCommit(finalRect)
            }
    }
}
