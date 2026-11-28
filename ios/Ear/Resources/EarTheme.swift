import SwiftUI

/// Desktop-matched theme tokens (from `desktop/theme.json`) for light and dark mode.
public struct EarTheme: Sendable {
    public let colorScheme: ColorScheme
    public let accent: Color
    public let isBrandBlue: Bool

    public init(colorScheme: ColorScheme, accent: Color = .accentColor, isBrandBlue: Bool = true) {
        self.colorScheme = colorScheme
        self.accent = accent
        self.isBrandBlue = isBrandBlue
    }

    public init(colorScheme: ColorScheme, appAccent: AppAccent) {
        self.colorScheme = colorScheme
        self.accent = appAccent.color
        self.isBrandBlue = (appAccent == .blue)
    }

    public var isDark: Bool { colorScheme == .dark }

    public var brand: Color { accent }

    public var brandSoft: Color {
        if isBrandBlue {
            return isDark
                ? Color(red: 0x13 / 255, green: 0x22 / 255, blue: 0x3A / 255)
                : Color(red: 0xE8 / 255, green: 0xF0 / 255, blue: 0xFE / 255)
        }
        return accent.opacity(isDark ? 0.22 : 0.12)
    }

    public var amber: Color {
        isDark
            ? Color(red: 0xE2 / 255, green: 0xA9 / 255, blue: 0x4B / 255)
            : Color(red: 0xB4 / 255, green: 0x78 / 255, blue: 0x1F / 255)
    }

    public var amberSoft: Color {
        isDark
            ? Color(red: 0x24 / 255, green: 0x1D / 255, blue: 0x11 / 255)
            : Color(red: 0xF8 / 255, green: 0xF0 / 255, blue: 0xE2 / 255)
    }

    public var well: Color {
        isDark
            ? Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x11 / 255)
            : Color(red: 0xF4 / 255, green: 0xF4 / 255, blue: 0xF5 / 255)
    }

    public var card: Color {
        isDark
            ? Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x14 / 255)
            : Color(red: 0xFF / 255, green: 0xFF / 255, blue: 0xFF / 255)
    }

    public var line: Color {
        isDark
            ? Color(red: 0x26 / 255, green: 0x26 / 255, blue: 0x26 / 255)
            : Color(red: 0xE4 / 255, green: 0xE4 / 255, blue: 0xE7 / 255)
    }

    public var dim: Color {
        isDark
            ? Color(red: 0x63 / 255, green: 0x63 / 255, blue: 0x63 / 255)
            : Color(red: 0xA1 / 255, green: 0xA1 / 255, blue: 0xAA / 255)
    }

    public var ground: Color {
        isDark
            ? Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0A / 255)
            : Color(red: 0xFF / 255, green: 0xFF / 255, blue: 0xFF / 255)
    }
}
