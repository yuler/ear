import { setTheme, type Theme } from "nsh";
import baseTheme from "../theme.json";
import type { AccentColor } from "./types";

export const ACCENT_COLORS = ["blue", "green", "orange", "purple", "red"] as const;

interface AccentTokens {
  light: string;
  dark: string;
  softLight: string;
  softDark: string;
}

const PALETTE: Record<AccentColor, AccentTokens> = {
  blue: {
    light: "#007AFF",
    dark: "#0A84FF",
    softLight: "#E6F2FF",
    softDark: "#0D2540",
  },
  green: {
    light: "#34C759",
    dark: "#30D158",
    softLight: "#E5F8EB",
    softDark: "#0D2818",
  },
  orange: {
    light: "#FF9500",
    dark: "#FF9F0A",
    softLight: "#FFF4E5",
    softDark: "#2C210E",
  },
  purple: {
    light: "#AF52DE",
    dark: "#BF5AF2",
    softLight: "#F6EEFE",
    softDark: "#2A1840",
  },
  red: {
    light: "#FF3B30",
    dark: "#FF453A",
    softLight: "#FFECEB",
    softDark: "#2E1413",
  },
};

function tokenPatch(tokens: AccentTokens, mode: "light" | "dark"): Record<string, string> {
  const color = mode === "light" ? tokens.light : tokens.dark;
  const soft = mode === "light" ? tokens.softLight : tokens.softDark;
  return {
    primary: color,
    ring: color,
    tint: color,
    "tint-soft": soft,
  };
}

/** Full app theme with button and link tokens swapped to `accent`. */
export function themeForAccent(accent: AccentColor): Theme {
  const tokens = PALETTE[accent];
  const base = baseTheme as Theme;
  return {
    cssVars: {
      theme: base.cssVars.theme,
      light: { ...base.cssVars.light, ...tokenPatch(tokens, "light") },
      dark: { ...base.cssVars.dark, ...tokenPatch(tokens, "dark") },
    },
  };
}

export function accentSwatch(accent: AccentColor): string {
  return PALETTE[accent].light;
}

/** Apply the accent immediately. Blue restores the theme shipped with the app. */
export function applyAccentTheme(accent: AccentColor): void {
  try {
    setTheme(accent === "blue" ? null : themeForAccent(accent));
  } catch {
    // Headless tests have no theme host.
  }
}
