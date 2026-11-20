/**
 * Pure layout math for the player page (desktop redesign §7).
 * The page switches between side-by-side and stacked by the window's
 * aspect ratio, with hysteresis so resizing near the threshold does not flap.
 */

export type PlayerLayoutMode = "side" | "stacked";
export type SubtitleTextSize = "sm" | "md" | "lg";

/** Fixed header height (points). */
export const PLAYER_HEADER_H = 44;
/** Fixed control bar height under the video (points). */
export const PLAYER_CONTROLS_H = 84;
/** Padding around the video column in side-by-side mode (points). */
export const PLAYER_SIDE_PAD = 16;

export const SIDE_ENTER_RATIO = 1.65;
export const STACKED_ENTER_RATIO = 1.55;

/** ≥ 1.65 → side, ≤ 1.55 → stacked, in between keep `prev`. */
export function nextLayoutMode(
  prev: PlayerLayoutMode,
  width: number,
  height: number,
): PlayerLayoutMode {
  if (width <= 0 || height <= 0) return prev;
  const ratio = width / height;
  if (ratio >= SIDE_ENTER_RATIO) return "side";
  if (ratio <= STACKED_ENTER_RATIO) return "stacked";
  return prev;
}

export type PlayerLayout = {
  mode: PlayerLayoutMode;
  /** Width of the video + control bar column. */
  mainWidth: number;
  /** Width of the subtitle column. */
  subtitleWidth: number;
  /** Size of the video box (16:9 in side mode, full width in stacked mode). */
  videoWidth: number;
  videoHeight: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Subtitle column width in side mode: 38% of the window, clamped to 360..520. */
export function sideSubtitleWidth(width: number): number {
  return Math.round(clamp(width * 0.38, 360, 520));
}

export function computePlayerLayout(
  mode: PlayerLayoutMode,
  width: number,
  height: number,
): PlayerLayout {
  const w = Math.max(0, width);
  const availH = Math.max(0, height - PLAYER_HEADER_H);

  if (mode === "side") {
    const subtitleWidth = Math.min(sideSubtitleWidth(w), w);
    const mainWidth = Math.max(0, w - subtitleWidth);
    const maxW = Math.max(0, mainWidth - PLAYER_SIDE_PAD * 2);
    const maxH = Math.max(0, availH - PLAYER_CONTROLS_H - PLAYER_SIDE_PAD * 2);
    const videoWidth = Math.floor(Math.min(maxW, (maxH * 16) / 9));
    const videoHeight = Math.floor((videoWidth * 9) / 16);
    return { mode, mainWidth, subtitleWidth, videoWidth, videoHeight };
  }

  // Stacked: the video box spans the full width (letterboxed by the player).
  const videoHeight = Math.floor(Math.min((w * 9) / 16, availH * 0.55));
  return { mode, mainWidth: w, subtitleWidth: w, videoWidth: w, videoHeight };
}

/** One of 3 subtitle text sizes, picked from the subtitle column width. */
export function subtitleTextSize(columnWidth: number): SubtitleTextSize {
  if (columnWidth < 460) return "sm";
  if (columnWidth < 760) return "md";
  return "lg";
}
