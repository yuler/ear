import { LayoutAnimation } from "nsh";

/**
 * View Transition geometry and animation helpers.
 *
 * Provides shared element transition calculation similar to music player apps (Apple Music / Spotify),
 * calculating origin thumbnail bounds to destination hero player bounds,
 * computing delta transforms, and managing transition phases.
 */

export interface ViewTransitionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

export type TransitionPhase =
  | "initial"
  | "entering"
  | "settled"
  | "closing";

export interface ViewNodeMeasureTarget {
  measure(): Promise<{
    bounds: { size: { width: number; height: number } };
    pagePosition: { x: number; y: number };
  } | null>;
}

/**
 * Capture an element's bounding rect and window page coordinates via ViewRef.measure().
 */
export async function captureElementRect(
  node: ViewNodeMeasureTarget | null,
  defaultRadius = 8,
): Promise<ViewTransitionRect | null> {
  if (!node) return null;
  try {
    const m = await node.measure();
    if (!m || !m.bounds || !m.pagePosition) return null;
    return {
      x: Math.round(m.pagePosition.x),
      y: Math.round(m.pagePosition.y),
      width: Math.round(m.bounds.size.width),
      height: Math.round(m.bounds.size.height),
      borderRadius: defaultRadius,
    };
  } catch {
    return null;
  }
}

/**
 * Coordinate entering transition timers and target measurement on mount.
 */
export function setupViewTransitionEnter(
  targetBoxRef: ViewNodeMeasureTarget | null,
  onMeasured: (rect: ViewTransitionRect) => void,
  onPhaseChange: (phase: TransitionPhase) => void,
): () => void {
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  const startEnter = () => {
    enterTimer = setTimeout(() => {
      try {
        LayoutAnimation.easeInEaseOut();
      } catch {
        // ignore
      }
      onPhaseChange("entering");
    }, 16);

    settleTimer = setTimeout(() => {
      onPhaseChange("settled");
    }, 440);
  };

  if (targetBoxRef) {
    void captureElementRect(targetBoxRef, 0)
      .then((rect) => {
        if (rect) onMeasured(rect);
        startEnter();
      })
      .catch(() => {
        startEnter();
      });
  } else {
    startEnter();
  }

  return () => {
    if (enterTimer) clearTimeout(enterTimer);
    if (settleTimer) clearTimeout(settleTimer);
  };
}

/**
 * Calculate expected target hero player rect (100% full-width video player).
 */
export function calculateTargetRect(
  viewportWidth = 1024,
  viewportHeight = 768,
): ViewTransitionRect {
  const g = typeof globalThis !== "undefined" ? (globalThis as { innerWidth?: number }) : null;
  const vw = g?.innerWidth ?? viewportWidth;
  // Video width is 100% of viewport width
  const targetWidth = Math.max(320, vw);
  const targetHeight = Math.round((targetWidth * 9) / 16);
  const targetX = 0;
  // Immersive hero player docks to top edge
  const targetY = 0;

  return {
    x: targetX,
    y: targetY,
    width: targetWidth,
    height: targetHeight,
    borderRadius: 0,
  };
}

/**
 * Fallback origin rect (bottom mini-player) when opened without a clicked card.
 */
export function calculateFallbackOriginRect(
  viewportWidth = 1024,
  viewportHeight = 768,
): ViewTransitionRect {
  const g = typeof globalThis !== "undefined" ? (globalThis as { innerWidth?: number; innerHeight?: number }) : null;
  const vw = g?.innerWidth ?? viewportWidth;
  const vh = g?.innerHeight ?? viewportHeight;
  const width = 144;
  const height = 81;
  return {
    x: Math.round((vw - width) / 2),
    y: Math.max(100, vh - height - 32),
    width,
    height,
    borderRadius: 8,
  };
}

/**
 * Compute delta and scale for FLIP transforms between origin and target.
 */
export function computeFlipTransform(
  origin: ViewTransitionRect,
  target: ViewTransitionRect,
) {
  const dx = origin.x - target.x;
  const dy = origin.y - target.y;
  const scaleX = target.width > 0 ? origin.width / target.width : 1;
  const scaleY = target.height > 0 ? origin.height / target.height : 1;

  return {
    dx,
    dy,
    scaleX,
    scaleY,
    transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`,
  };
}

/**
 * Compute the style object for the floating shared element hero view.
 */
export function getViewTransitionHeroStyle(
  phase: TransitionPhase,
  origin: ViewTransitionRect,
  target: ViewTransitionRect,
) {
  const isTarget = phase === "entering" || phase === "settled";
  const curRect = isTarget ? target : origin;
  const isMoving = phase === "entering" || phase === "closing";
  const duration: "340ms" | "420ms" = phase === "closing" ? "340ms" : "420ms";

  return {
    position: "fixed" as const,
    left: curRect.x,
    top: curRect.y,
    width: curRect.width,
    height: curRect.height,
    borderRadius: isTarget ? (target.borderRadius ?? 0) : (origin.borderRadius ?? 8),
    opacity: phase === "settled" ? 0 : 1,
    zIndex: 70,
    pointerEvents: "none" as const,
    overflow: "hidden" as const,
    transitionProperty: isMoving
      ? "all, left, top, width, height, border-radius, opacity, box-shadow"
      : "none",
    transitionDuration: duration,
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" as const,
    boxShadow: isTarget
      ? "0 25px 50px -12px rgba(0, 0, 0, 0.85)"
      : "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
  };
}
