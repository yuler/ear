import type { SubtitleBlockerRect } from "../store";

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

/**
 * Visual background styling specification for blocker surface.
 */
export interface BlockerVisualProps {
  backgroundColor: string;
  backgroundImage: string;
  backdropFilter: string;
}

/**
 * Generate unified visual styles combining enlarged mosaic, deep frosted blur,
 * and dark background tint controlled by a single intensity progress (10..100).
 */
export function createBlockerVisual(
  intensityOrStyle: string | number = 80,
  legacyOpacity?: number,
  legacyParam?: number,
): BlockerVisualProps {
  let progress = 80;
  if (typeof intensityOrStyle === "number") {
    progress = intensityOrStyle;
  } else if (typeof legacyOpacity === "number") {
    progress = legacyOpacity;
  }

  const p = Math.max(10, Math.min(100, Math.round(progress)));
  const t = (p - 10) / 90; // 0.0 to 1.0

  // 1. 大像素马赛克块 (Large pixel mosaic blocks): 22px up to 48px
  const s = Math.round(22 + t * 26);
  const half = Math.round(s / 2);

  // 2. 深度高斯虚化 (Gaussian blur): 24px up to 52px
  const blur = Math.round(24 + t * 28);

  // 3. 半透明打码背景 (Translucent censorship background): 0.45 ~ 0.84
  // 保持透明看得到底层视频画面动态，但足以彻底虚化遮盖字幕文字
  const bgAlpha = Math.round((0.45 + t * 0.39) * 100) / 100;
  const bg = `rgba(12, 12, 18, ${bgAlpha})`;

  // 4. 大像素马赛克块处理 (Checkerboard pixel shading + 3D bevel borders)
  const bandDark = `rgba(0, 0, 0, ${Math.round((0.14 + t * 0.18) * 100) / 100})`;
  const bandLight = `rgba(255, 255, 255, ${Math.round((0.05 + t * 0.06) * 100) / 100})`;
  const lineLight = `rgba(255, 255, 255, ${Math.round((0.14 + t * 0.10) * 100) / 100})`;
  const lineDark = `rgba(0, 0, 0, ${Math.round((0.36 + t * 0.24) * 100) / 100})`;

  const bgImage = [
    // 3D 棱镜微光感边框 (Top & Left highlights)
    `repeating-linear-gradient(0deg, ${lineLight} 0px, ${lineLight} 1px, transparent 1px, transparent ${s}px)`,
    `repeating-linear-gradient(90deg, ${lineLight} 0px, ${lineLight} 1px, transparent 1px, transparent ${s}px)`,
    // 3D 棱镜凹暗部边框 (Bottom & Right shadows)
    `repeating-linear-gradient(180deg, ${lineDark} 0px, ${lineDark} 1px, transparent 1px, transparent ${s}px)`,
    `repeating-linear-gradient(270deg, ${lineDark} 0px, ${lineDark} 1px, transparent 1px, transparent ${s}px)`,
    // 错落大像素块填充 (Alternating vertical and horizontal pixel bands)
    `repeating-linear-gradient(90deg, ${bandLight} 0px, ${bandLight} ${half}px, transparent ${half}px, transparent ${s}px)`,
    `repeating-linear-gradient(0deg, ${bandDark} 0px, ${bandDark} ${half}px, transparent ${half}px, transparent ${s}px)`,
  ].join(", ");

  return {
    backgroundColor: bg,
    backgroundImage: bgImage,
    backdropFilter: `blur(${blur}px)`,
  };
}

/**
 * Generate vertical linear gradient for soft edge feathering (legacy).
 */
export function createFeatherGradient(feather: number, opacity: number): string {
  const f = Math.max(5, Math.min(45, feather));
  const op = opacity / 100;
  const dark = `rgba(16, 16, 20, ${op})`;
  const transparent = "rgba(16, 16, 20, 0)";
  return `linear-gradient(to bottom, ${transparent} 0%, ${dark} ${f}%, ${dark} ${100 - f}%, ${transparent} 100%)`;
}

/**
 * Authentic video censor pixel mosaic palette: Black, White, and Grey.
 * Low color count, strictly monochrome, interleaved in a checkerboard pattern.
 */
export const MOSAIC_DARK_SHADES = [
  "#0a0b0e", // Deep Black
  "#181a20", // Dark Charcoal
  "#282b34", // Deep Slate
];

export const MOSAIC_LIGHT_SHADES = [
  "#64748b", // Slate Grey
  "#94a3b8", // Mid Grey
  "#cbd5e1", // Silver / Light Grey
  "#ffffff", // Pure White
];

export const MOSAIC_PALETTE = [...MOSAIC_DARK_SHADES, ...MOSAIC_LIGHT_SHADES];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Real-time GPU pixelated mosaic shader (WGSL) with Option 2 Gaussian Area Filter.
 * Dynamically samples the underlying live video backdrop (`sample_backdrop`)
 * with a 9-tap Gaussian area box filter across each cell to thoroughly dissolve
 * sharp subtitle letter strokes into the background before pixelation.
 * Preserves authentic live-color dynamic video tracking while eliminating text legibility.
 */
export const MOSAIC_SHADER = `
fn shade(uv: vec2f) -> vec4f {
    let size = nsh.size;
    let progress = clamp(nsh.progress, 0.1, 1.0);
    // Mosaic tile size scales with intensity progress: 8px to 36px
    let ps = max(8.0 + progress * 28.0, 4.0);

    // 1. Quantize coordinates to mosaic blocks (Pixelate Effect)
    let cell_index = floor(uv * size / ps);
    let sample_pos = (cell_index * ps + vec2f(ps * 0.5)) / size;

    // 2. 9-tap Gaussian area filter across cell: dissolves sharp letter edges
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

    // When backdrop has live video content:
    if (bg.a > 0.02) {
        // High opacity with subtle diffusion: 0.88 ~ 0.98 opacity
        let alpha = 0.88 + progress * 0.10;
        return vec4f(bg.rgb, bg.a * alpha);
    } else {
        // Fallback when backdrop texture is unavailable (smooth translucent monochrome)
        let ix = u32(max(cell_index.x, 0.0));
        let iy = u32(max(cell_index.y, 0.0));
        let is_alt = f32((ix + iy) % 2u);
        let fallback_shade = mix(vec3f(0.12), vec3f(0.24), is_alt);
        return vec4f(fallback_shade, 0.85);
    }
}
`;

/**
 * Draw authentic video censor pixel mosaic onto a 2D canvas context.
 * Interleaves dark and light/white tiles in a checkerboard pattern ((c + r) % 2).
 * Uses a deterministic hash per tile coordinate so tiles remain completely solid and stable.
 * Supports subtle transparency so video motion and lighting faintly passes through.
 */
export function drawMosaicCanvas(
  cx: any,
  size: { width: number; height: number },
  intensity: number = 80,
) {
  const w = size.width;
  const h = size.height;
  if (w <= 0 || h <= 0) return;

  if (typeof cx.clearRect === "function") {
    cx.clearRect(0, 0, w, h);
  }

  // Intensity (10..100) controls tile size: 8px up to 32px
  const p = Math.max(10, Math.min(100, Math.round(intensity)));
  const t = (p - 10) / 90;
  const tileSize = Math.round(8 + t * 24); // 8px ~ 32px

  // Transparent video mosaic: 0.35 ~ 0.70 opacity so underlying video's motion, lighting, and colors
  // dynamically shine through the mosaic grid
  const alpha = Math.round((0.35 + t * 0.35) * 100) / 100;

  const cols = Math.ceil(w / tileSize);
  const rows = Math.ceil(h / tileSize);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 交错模式 (Checkerboard interleaving): 偶数格取黑/暗灰，奇数格取中灰/浅灰/白
      const isDark = (c + r) % 2 === 0;
      const palette = isDark ? MOSAIC_DARK_SHADES : MOSAIC_LIGHT_SHADES;

      // Deterministic hash based on tile coordinate
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

