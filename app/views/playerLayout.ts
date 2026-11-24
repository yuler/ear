/**
 * Pure layout math for the player page (desktop redesign §7).
 * Portrait videos automatically default to side-by-side layout (video on the left,
 * subtitles on the right); landscape videos switch between side-by-side and stacked
 * by the window's aspect ratio with hysteresis so resizing does not flap.
 * Both layouts render the video in a full-bleed black stage with no outer margins.
 */

export type PlayerLayoutMode = "side" | "stacked";
export type SubtitleTextSize = "sm" | "md" | "lg";

/** Fixed header height (points). */
export const PLAYER_HEADER_H = 44;
/** Overlay control bar height inside the bottom of the video (points). */
export const PLAYER_CONTROLS_H = 76;

export const SIDE_ENTER_RATIO = 1.65;
export const STACKED_ENTER_RATIO = 1.55;
/** Aspect ratio (width / height) below which a video is considered portrait. */
export const PORTRAIT_ASPECT_THRESHOLD = 0.95;

/** True when the media's natural dimensions are taller than wide (e.g. 9:16 phone video). */
export function isPortraitMedia(mediaAspect: number | null | undefined): boolean {
  return (
    typeof mediaAspect === "number" &&
    Number.isFinite(mediaAspect) &&
    mediaAspect > 0 &&
    mediaAspect < PORTRAIT_ASPECT_THRESHOLD
  );
}

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

/**
 * Automatic layout selection: portrait videos prefer side-by-side layout
 * whenever the window is wide enough (`>= 600pt`); landscape videos follow
 * the window aspect ratio hysteresis rule.
 */
export function resolveAutoLayoutMode(
  prev: PlayerLayoutMode,
  width: number,
  height: number,
  mediaAspect?: number | null,
): PlayerLayoutMode {
  if (isPortraitMedia(mediaAspect) && width >= 600) {
    return "side";
  }
  return nextLayoutMode(prev, width, height);
}

export type PlayerLayout = {
  mode: PlayerLayoutMode;
  /** Width of the full-bleed black video stage. */
  mainWidth: number;
  /** Width of the subtitle column. */
  subtitleWidth: number;
  /** Size of the video stage (fills the entire left panel in side mode, full width in stacked mode). */
  videoWidth: number;
  videoHeight: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Subtitle column width in side mode (landscape): 38% of the window, clamped to 360..520. */
export function sideSubtitleWidth(width: number): number {
  return Math.round(clamp(width * 0.38, 360, 520));
}

export function computePlayerLayout(
  mode: PlayerLayoutMode,
  width: number,
  height: number,
  mediaAspect?: number | null,
): PlayerLayout {
  const w = Math.max(0, width);
  // Header and bottom controls are overlays inside the video stage, so full height is available.
  const availH = Math.max(0, height);

  if (mode === "side") {
    if (isPortraitMedia(mediaAspect)) {
      const aspect = clamp(mediaAspect!, 0.4, PORTRAIT_ASPECT_THRESHOLD);
      const minSubtitleW = Math.min(360, Math.floor(w * 0.45));
      const maxMainW = Math.max(0, w - minSubtitleW);
      const idealW = Math.floor(availH * aspect);
      const mainWidth = Math.min(maxMainW, Math.max(idealW, Math.min(maxMainW, 360)));
      const subtitleWidth = Math.max(0, w - mainWidth);
      return { mode, mainWidth, subtitleWidth, videoWidth: mainWidth, videoHeight: availH };
    }

    const subtitleWidth = Math.min(sideSubtitleWidth(w), w);
    const mainWidth = Math.max(0, w - subtitleWidth);
    return { mode, mainWidth, subtitleWidth, videoWidth: mainWidth, videoHeight: availH };
  }

  // Stacked: the video stage spans the full width (letterboxed on black by the player).
  const videoHeight = Math.floor(Math.min((w * 9) / 16, availH * 0.55));
  return { mode, mainWidth: w, subtitleWidth: w, videoWidth: w, videoHeight };
}

/** One of 3 subtitle text sizes, picked from the subtitle column width. */
export function subtitleTextSize(columnWidth: number): SubtitleTextSize {
  if (columnWidth < 460) return "sm";
  if (columnWidth < 760) return "md";
  return "lg";
}
