import { Storage } from "nsh";
import type { SubtitleBlockerRect } from "../store";

const BLOCKER_INTENSITY_KEY = "ear.blockerIntensity";
export const DEFAULT_BLOCKER_INTENSITY = 80;
let cachedIntensity = DEFAULT_BLOCKER_INTENSITY;

export function clampBlockerIntensity(val: number): number {
  if (!Number.isFinite(val)) return DEFAULT_BLOCKER_INTENSITY;
  return Math.max(10, Math.min(100, Math.round(val)));
}

export function getBlockerIntensity(): number {
  return cachedIntensity;
}

export function saveBlockerIntensity(val: number): number {
  cachedIntensity = clampBlockerIntensity(val);
  void Storage.setItem(BLOCKER_INTENSITY_KEY, String(cachedIntensity)).catch(() => {});
  return cachedIntensity;
}

export async function hydrateBlockerIntensity(): Promise<number> {
  try {
    const raw = await Storage.getItem(BLOCKER_INTENSITY_KEY);
    if (raw) cachedIntensity = clampBlockerIntensity(Number(raw));
  } catch {
    // ignore storage errors
  }
  return cachedIntensity;
}

export type DragMode =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se";

export interface Point {
  x: number;
  y: number;
}

/**
 * Robustly extract global/page-level coordinates from pointer / mouse / press events.
 * Prefers page-level coordinates (`pageX` / `pageY`, `clientX` / `clientY`, `pagePosition`)
 * over local `position` to ensure tracking doesn't drift or freeze when views move.
 */
export function getPoint(e: any): Point | null {
  if (typeof e?.pageX === "number" && typeof e.pageY === "number") {
    return { x: e.pageX, y: e.pageY };
  }
  if (typeof e?.clientX === "number" && typeof e.clientY === "number") {
    return { x: e.clientX, y: e.clientY };
  }
  if (e?.pagePosition && typeof e.pagePosition.x === "number" && typeof e.pagePosition.y === "number") {
    return e.pagePosition;
  }
  if (typeof e?.screenX === "number" && typeof e.screenY === "number") {
    return { x: e.screenX, y: e.screenY };
  }
  if (e?.position && typeof e.position.x === "number" && typeof e.position.y === "number") {
    return e.position;
  }
  return null;
}

/**
 * Compute the new SubtitleBlockerRect given delta points along X and Y axes.
 */
export function computeDeltaRect(
  mode: DragMode,
  init: SubtitleBlockerRect,
  dxPoints: number,
  dyPoints: number,
  containerWidth: number,
  containerHeight: number,
): SubtitleBlockerRect {
  const cw = Math.max(100, containerWidth);
  const ch = Math.max(50, containerHeight);
  const dx = (dxPoints / cw) * 100;
  const dy = (dyPoints / ch) * 100;

  const MIN_W = 6;
  const MIN_H = 2;

  let nx = init.x;
  let ny = init.y;
  let nw = init.width;
  let nh = init.height;

  if (mode === "move") {
    nx = Math.max(0, Math.min(100 - nw, init.x + dx));
    ny = Math.max(0, Math.min(100 - nh, init.y + dy));
  } else {
    if (mode.includes("w")) {
      const potentialX = Math.max(
        0,
        Math.min(init.x + init.width - MIN_W, init.x + dx),
      );
      nw = init.width - (potentialX - init.x);
      nx = potentialX;
    }
    if (mode.includes("e")) {
      nw = Math.max(MIN_W, Math.min(100 - init.x, init.width + dx));
    }
    if (mode.includes("n")) {
      const potentialY = Math.max(
        0,
        Math.min(init.y + init.height - MIN_H, init.y + dy),
      );
      nh = init.height - (potentialY - init.y);
      ny = potentialY;
    }
    if (mode.includes("s")) {
      nh = Math.max(MIN_H, Math.min(100 - init.y, init.height + dy));
    }
  }

  return {
    x: Math.round(nx * 10) / 10,
    y: Math.round(ny * 10) / 10,
    width: Math.round(nw * 10) / 10,
    height: Math.round(nh * 10) / 10,
  };
}

/**
 * Calculate the new SubtitleBlockerRect given drag delta from initial anchor.
 */
export function computeDragRect(
  mode: DragMode,
  init: SubtitleBlockerRect,
  startPt: Point,
  curPt: Point,
  containerWidth: number,
  containerHeight: number,
): SubtitleBlockerRect {
  return computeDeltaRect(
    mode,
    init,
    curPt.x - startPt.x,
    curPt.y - startPt.y,
    containerWidth,
    containerHeight,
  );
}

/**
 * Shift blocker vertically by `delta` percentage points.
 */
export function nudgeRect(
  cur: SubtitleBlockerRect,
  direction: "up" | "down",
  delta = 2,
): SubtitleBlockerRect {
  const nextY =
    direction === "up"
      ? Math.max(0, Math.round((cur.y - delta) * 10) / 10)
      : Math.min(100 - cur.height, Math.round((cur.y + delta) * 10) / 10);
  return { ...cur, y: nextY };
}

export type CursorType =
  | "default"
  | "grabbing"
  | "ns-resize"
  | "ew-resize"
  | "nwse-resize"
  | "nesw-resize";

/**
 * Returns cursor string corresponding to current DragMode.
 */
export function cursorForDrag(mode: DragMode | null): CursorType {
  if (!mode) return "default";
  if (mode === "move") return "grabbing";
  if (mode === "n" || mode === "s") return "ns-resize";
  if (mode === "w" || mode === "e") return "ew-resize";
  if (mode === "nw" || mode === "se") return "nwse-resize";
  return "nesw-resize";
}

/** The blocker's fallback blur filter. */
export const BLOCKER_BACKDROP_FILTER = "blur(28px)";

const MOSAIC_DARK_SHADES = ["#141414", "#1c1c1c", "#242424", "#2e2e2e"] as const;
const MOSAIC_LIGHT_SHADES = ["#404040", "#525252", "#686868", "#808080"] as const;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Real-time GPU pixelated mosaic shader (WGSL) with 9-tap Gaussian area filter
 * across each cell to dissolve sharp subtitle letter strokes while tracking
 * live underlying video colors.
 */
export const MOSAIC_SHADER = `
fn shade(uv: vec2f) -> vec4f {
    let size = nsh.size;
    let progress = clamp(nsh.progress, 0.1, 1.0);
    let ps = max(8.0 + progress * 28.0, 4.0);

    let cell_index = floor(uv * size / ps);
    let sample_pos = (cell_index * ps + vec2f(ps * 0.5)) / size;

    let d = (ps * 0.25) / size;
    let s0 = sample_backdrop(clamp(sample_pos, vec2f(0.001), vec2f(0.999)));
    let s1 = sample_backdrop(clamp(sample_pos + vec2f(-d.x, -d.y), vec2f(0.001), vec2f(0.999)));
    let s2 = sample_backdrop(clamp(sample_pos + vec2f( d.x, -d.y), vec2f(0.001), vec2f(0.999)));
    let s3 = sample_backdrop(clamp(sample_pos + vec2f(-d.x,  d.y), vec2f(0.001), vec2f(0.999)));
    let s4 = sample_backdrop(clamp(sample_pos + vec2f( d.x,  d.y), vec2f(0.001), vec2f(0.999)));
    let s5 = sample_backdrop(clamp(sample_pos + vec2f( 0.0, -d.y * 1.4), vec2f(0.001), vec2f(0.999)));
    let s6 = sample_backdrop(clamp(sample_pos + vec2f( 0.0,  d.y * 1.4), vec2f(0.001), vec2f(0.999)));
    let s7 = sample_backdrop(clamp(sample_pos + vec2f(-d.x * 1.4, 0.0), vec2f(0.001), vec2f(0.999)));
    let s8 = sample_backdrop(clamp(sample_pos + vec2f( d.x * 1.4, 0.0), vec2f(0.001), vec2f(0.999)));
    let bg = (s0 * 2.0 + (s1 + s2 + s3 + s4) * 1.0 + (s5 + s6 + s7 + s8) * 1.0) / 10.0;

    if (bg.a > 0.02) {
        let alpha = 0.88 + progress * 0.10;
        return vec4f(bg.rgb, bg.a * alpha);
    } else {
        let ix = u32(max(cell_index.x, 0.0));
        let iy = u32(max(cell_index.y, 0.0));
        let is_alt = f32((ix + iy) % 2u);
        let fallback_shade = mix(vec3f(0.12), vec3f(0.24), is_alt);
        return vec4f(fallback_shade, 0.85);
    }
}
`;

/** Draw pixelated mosaic onto a 2D canvas context when shaders are unavailable. */
export function drawMosaicCanvas(
  cx: any,
  size: { width: number; height: number },
  intensity: number = DEFAULT_BLOCKER_INTENSITY,
) {
  const w = size.width;
  const h = size.height;
  if (w <= 0 || h <= 0) return;

  if (typeof cx.clearRect === "function") {
    cx.clearRect(0, 0, w, h);
  }

  const p = clampBlockerIntensity(intensity);
  const t = (p - 10) / 90;
  const tileSize = Math.round(8 + t * 24);
  const alpha = Math.round((0.35 + t * 0.35) * 100) / 100;

  const cols = Math.ceil(w / tileSize);
  const rows = Math.ceil(h / tileSize);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isDark = (c + r) % 2 === 0;
      const palette = isDark ? MOSAIC_DARK_SHADES : MOSAIC_LIGHT_SHADES;
      const hash = (c * 374761393 + r * 668265263) ^ 1274126177;
      const normalized = Math.abs((hash ^ (hash >> 13)) * 1274126177);
      const color = palette[normalized % palette.length];

      const x = c * tileSize;
      const y = r * tileSize;
      const tw = Math.min(tileSize, w - x);
      const th = Math.min(tileSize, h - y);

      cx.fillStyle = hexToRgba(color, alpha);
      cx.fillRect(x, y, tw, th);
    }
  }
}
