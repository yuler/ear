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

/** The blocker's only style: a blur of the video behind it. */
export const BLOCKER_BACKDROP_FILTER = "blur(28px)";
