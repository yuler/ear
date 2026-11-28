import SwiftUI

struct PlayerBottomDockView: View {
    let isPlaying: Bool
    let hasMedia: Bool
    let hasSentences: Bool
    let maskAll: Bool
    let sentencePause: Bool
    let rate: PlaybackRate
    let theme: EarTheme
    let copy: AppCopy

    let onToggleMask: () -> Void
    let onPrevSentence: () -> Void
    let onTogglePlay: () -> Void
    let onRepeatCurrent: () -> Void
    let onNextSentence: () -> Void
    let onToggleSentencePause: () -> Void
    let onCycleRate: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            dockToggleButton(
                icon: maskAll ? "eye.slash.fill" : "eye.fill",
                active: maskAll,
                label: copy.blindMask,
                action: onToggleMask
            )

            Spacer(minLength: 0)

            dockIconButton(
                icon: "backward.end.fill",
                disabled: !hasSentences,
                action: onPrevSentence
            )

            Spacer(minLength: 0)

            Button(action: onTogglePlay) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 36)
                    .background(theme.brand, in: Capsule())
            }
            .disabled(!hasMedia)
            .opacity(hasMedia ? 1.0 : 0.45)
            .accessibilityLabel(isPlaying ? copy.pause : copy.play)

            Spacer(minLength: 0)

            dockIconButton(
                icon: "arrow.counterclockwise",
                disabled: !hasMedia,
                action: onRepeatCurrent
            )

            Spacer(minLength: 0)

            dockIconButton(
                icon: "forward.end.fill",
                disabled: !hasSentences,
                action: onNextSentence
            )

            Spacer(minLength: 0)

            dockToggleButton(
                icon: sentencePause ? "text.line.last.and.arrowtriangle.forward" : "text.justify.left",
                active: sentencePause,
                label: copy.sentencePause,
                action: onToggleSentencePause
            )

            Spacer(minLength: 0)

            Button(action: onCycleRate) {
                Text(rate.label)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(rate != .x1_0 ? theme.brand : .primary)
                    .frame(minWidth: 38, minHeight: 32)
                    .padding(.horizontal, 6)
                    .background(
                        rate != .x1_0 ? theme.brandSoft : theme.well,
                        in: Capsule()
                    )
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(theme.card)
        .overlay(alignment: .top) {
            Rectangle().fill(theme.line).frame(height: 0.5)
        }
    }

    private func dockToggleButton(icon: String, active: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(active ? theme.brand : .secondary)
                .frame(width: 36, height: 34)
                .background(active ? theme.brandSoft : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .accessibilityLabel(label)
    }

    private func dockIconButton(icon: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(disabled ? .tertiary : .primary)
                .frame(width: 34, height: 34)
        }
        .disabled(disabled)
    }
}
