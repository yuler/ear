import AVFoundation
import AVKit
import SwiftUI

struct InlineAVPlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerContainerView {
        let view = PlayerContainerView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
        return view
    }

    func updateUIView(_ uiView: PlayerContainerView, context: Context) {
        uiView.playerLayer.player = player
    }

    final class PlayerContainerView: UIView {
        override static var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}

struct FullscreenAVPlayerSheet: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.allowsPictureInPicturePlayback = true
        return controller
    }

    func updateUIViewController(_ uiViewController: AVPlayerViewController, context: Context) {
        uiViewController.player = player
    }
}

struct SentenceRowView: View {
    let sentence: Sentence
    let isActive: Bool
    let isVisible: Bool
    let tapToRevealLabel: String
    let onPlay: () -> Void
    let onToggleReveal: () -> Void
    let onCopy: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("#\(sentence.index + 1)")
                        .font(.caption2.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(isActive ? Color.accentColor : .secondary)

                    Text(CaptionSegmentation.formatTimeRange(startMs: sentence.startMs, endMs: sentence.endMs))
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)

                    Text("\(sentence.wpm) WPM")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if isVisible {
                    Text(sentence.text)
                        .font(.body)
                        .foregroundStyle(.primary)
                } else {
                    Text(tapToRevealLabel)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                        .onTapGesture { onToggleReveal() }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture { onPlay() }

            Button {
                onToggleReveal()
            } label: {
                Image(systemName: isVisible ? "eye" : "eye.slash")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
        }
        .padding(.vertical, 4)
        .contextMenu {
            Button {
                onCopy()
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }
            Button {
                onPlay()
            } label: {
                Label("Play", systemImage: "play.fill")
            }
        }
    }
}

struct VideoInfoSheetView: View {
    @Environment(\.dismiss) private var dismiss
    let item: MirrorItemView
    let mediaURL: URL?
    let copy: AppCopy

    var body: some View {
        NavigationStack {
            List {
                LabeledContent("Title", value: item.title)
                LabeledContent("Video ID", value: item.videoId)
                LabeledContent("Format", value: "\(item.mediaExt.uppercased()) · \(item.mimeType)")
                LabeledContent("Size", value: formatBytes(item.sizeBytes))
                if let durationMs = item.durationMs {
                    LabeledContent("Duration", value: CaptionSegmentation.formatTime(durationMs))
                }
                if let sha = item.contentSha256 {
                    LabeledContent("SHA-256", value: String(sha.prefix(16)) + "...")
                }
                if let mediaURL {
                    LabeledContent("Local File", value: mediaURL.lastPathComponent)
                }
            }
            .navigationTitle(copy.videoInfo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(copy.close) { dismiss() }
                }
            }
        }
    }
}

struct RawSubtitlesSheetView: View {
    @Environment(\.dismiss) private var dismiss
    let cues: [CaptionCue]
    let sentences: [Sentence]
    let copy: AppCopy

    var body: some View {
        NavigationStack {
            List {
                if !cues.isEmpty {
                    ForEach(cues) { cue in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(CaptionSegmentation.formatTimeRange(startMs: cue.startMs, endMs: cue.endMs))
                                .font(.caption2)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                            Text(cue.text)
                                .font(.subheadline)
                        }
                    }
                } else {
                    ForEach(sentences) { s in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(CaptionSegmentation.formatTimeRange(startMs: s.startMs, endMs: s.endMs))
                                .font(.caption2)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                            Text(s.text)
                                .font(.subheadline)
                        }
                    }
                }
            }
            .navigationTitle(copy.rawSubtitles)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(copy.close) { dismiss() }
                }
            }
        }
    }
}
