/**
 * Pure layout math for the player page (Dual-Zone Studio).
 * - Portrait videos automatically use side-by-side layout (video left, dual studio right),
 *   capping the subtitle column to <= 50% width (360..560pt) so it never outweighs the video.
 * - Landscape videos stay in stacked layout (video top ~52%, horizontal dual studio below ~48%)
 *   even on large desktop displays, while users can still toggle side-by-side manually.
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

/** True when the window is near the minimum desktop size (800x560) and needs compact chrome. */
export function isCompactStudio(width: number, height: number): boolean {
  return width <= 860 || height <= 600;
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
 * Automatic layout selection:
 * - Portrait videos use side-by-side layout whenever width >= 600pt.
 * - Known landscape videos default to stacked so the dual-zone studio sits cleanly below.
 * - Unknown aspect falls back to window aspect hysteresis.
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
  if (
    typeof mediaAspect === "number" &&
    Number.isFinite(mediaAspect) &&
    mediaAspect >= PORTRAIT_ASPECT_THRESHOLD
  ) {
    return "stacked";
  }
  return nextLayoutMode(prev, width, height);
}

export type PlayerLayout = {
  mode: PlayerLayoutMode;
  /** Width of the full-bleed black video stage. */
  mainWidth: number;
  /** Width of the subtitle studio pane. */
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

/** Subtitle column width in side mode (portrait): 46% clamped to 360..560, never exceeding 50%. */
export function portraitSubtitleWidth(width: number): number {
  const half = Math.floor(width * 0.5);
  return Math.min(half, Math.round(clamp(width * 0.46, Math.min(360, half), 560)));
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
    const subtitleWidth = isPortraitMedia(mediaAspect)
      ? Math.min(portraitSubtitleWidth(w), w)
      : Math.min(sideSubtitleWidth(w), w);
    const mainWidth = Math.max(0, w - subtitleWidth);
    return { mode, mainWidth, subtitleWidth, videoWidth: mainWidth, videoHeight: availH };
  }

  // Stacked: video takes up to 52% of height (or 16:9 width), leaving ~48% for the dual-zone studio.
  const videoHeight = Math.floor(Math.min((w * 9) / 16, availH * 0.52));
  return { mode, mainWidth: w, subtitleWidth: w, videoWidth: w, videoHeight };
}

/** One of 3 subtitle text sizes, picked from the subtitle column width. */
export function subtitleTextSize(columnWidth: number): SubtitleTextSize {
  if (columnWidth < 460) return "sm";
  if (columnWidth < 760) return "md";
  return "lg";
}
