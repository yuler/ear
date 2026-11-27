import AVFoundation
import MediaPlayer

@MainActor
public final class AudioSessionController {
    public var onPlay: (() -> Void)?
    public var onPause: (() -> Void)?
    public var onTogglePlayPause: (() -> Void)?
    public var onPreviousSentence: (() -> Void)?
    public var onNextSentence: (() -> Void)?

    private var commandTokens: [Any] = []

    public init() {}

    public func activate() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.allowAirPlay, .allowBluetoothA2DP])
        try? session.setActive(true)
        registerRemoteCommands()
    }

    public func deactivate() {
        clearRemoteCommands()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    public func updateNowPlaying(
        title: String,
        subtitle: String?,
        currentTimeSec: Double,
        durationSec: Double,
        isPlaying: Bool,
        rate: Double
    ) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: max(0, currentTimeSec),
            MPMediaItemPropertyPlaybackDuration: max(0, durationSec),
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? rate : 0.0
        ]
        if let subtitle, !subtitle.isEmpty {
            info[MPMediaItemPropertyArtist] = subtitle
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func registerRemoteCommands() {
        clearRemoteCommands()
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.togglePlayPauseCommand.isEnabled = true
        center.previousTrackCommand.isEnabled = true
        center.nextTrackCommand.isEnabled = true

        commandTokens.append(center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.onPlay?() }
            return .success
        })
        commandTokens.append(center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.onPause?() }
            return .success
        })
        commandTokens.append(center.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.onTogglePlayPause?() }
            return .success
        })
        commandTokens.append(center.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.onPreviousSentence?() }
            return .success
        })
        commandTokens.append(center.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.onNextSentence?() }
            return .success
        })
    }

    private func clearRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.removeTarget(nil)
        center.pauseCommand.removeTarget(nil)
        center.togglePlayPauseCommand.removeTarget(nil)
        center.previousTrackCommand.removeTarget(nil)
        center.nextTrackCommand.removeTarget(nil)
        commandTokens.removeAll()
    }
}
