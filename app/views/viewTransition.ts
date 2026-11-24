import { LayoutAnimation } from "nsh";
import type { PlayerLayout } from "./playerLayout";

/**
 * View Transition geometry and animation helpers.
 *
 * Provides shared element transition calculation similar to music/video apps,
 * mapping origin thumbnail bounds directly to the destination video stage bounds
 * (portrait side-by-side, landscape side-by-side, or stacked) with lockstep
 * layout + visual timing and a flicker-free opacity cross-dissolve on settle.
 */

export const ENTER_DURATION_MS = 320;
export const SETTLE_FADE_MS = 160;
export const CLOSE_DURATION_MS = 260;

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
 * Configure a synchronized native layout animation for the next commit.
 */
export function animateLayoutTransition(durationMs: number): void {
  try {
    if (typeof LayoutAnimation.configureNext === "function") {
      LayoutAnimation.configureNext({
        duration: durationMs,
        update: { type: "easeOut" },
      });
      return;
    }
    LayoutAnimation.easeInEaseOut();
  } catch {
    // ignore on test host
  }
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
    const m = (await node.measure()) as any;
    if (!m) return null;
    const bounds = m.bounds;
    const pagePos = m.pagePosition;
    const width = bounds?.size?.width ?? bounds?.width ?? 0;
    const height = bounds?.size?.height ?? bounds?.height ?? 0;
    const x = pagePos?.x ?? bounds?.origin?.x ?? bounds?.x ?? 0;
    const y = pagePos?.y ?? bounds?.origin?.y ?? bounds?.y ?? 0;
    if (width <= 0 || height <= 0) return null;
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      borderRadius: defaultRadius,
    };
  } catch {
    return null;
  }
}

/**
 * Derive the exact destination hero rect from the computed player layout.
 * The video stage is always docked at (0, 0) inside the full-screen detail overlay.
 */
export function layoutTargetRect(
  layout: Pick<PlayerLayout, "videoWidth" | "videoHeight">,
): ViewTransitionRect {
  return {
    x: 0,
    y: 0,
    width: Math.max(1, Math.round(layout.videoWidth)),
    height: Math.max(1, Math.round(layout.videoHeight)),
    borderRadius: 0,
  };
}

/**
 * Coordinate entering transition timers and optional target measurement on mount.
 * When target geometry is already known from layout, pass `null` for `targetBoxRef`
 * so the enter animation begins on the very next frame with zero measurement delay.
 */
export function setupViewTransitionEnter(
  targetBoxRef: ViewNodeMeasureTarget | null,
  onMeasured: (rect: ViewTransitionRect) => void,
  onPhaseChange: (phase: TransitionPhase) => void,
): () => void {
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const startEnter = () => {
    if (cancelled) return;
    enterTimer = setTimeout(() => {
      if (cancelled) return;
      animateLayoutTransition(ENTER_DURATION_MS);
      onPhaseChange("entering");
    }, 16);

    settleTimer = setTimeout(() => {
      if (cancelled) return;
      onPhaseChange("settled");
    }, ENTER_DURATION_MS + 16);
  };

  if (targetBoxRef) {
    void captureElementRect(targetBoxRef, 0)
      .then((rect) => {
        if (!cancelled && rect) onMeasured(rect);
        startEnter();
      })
      .catch(() => {
        startEnter();
      });
  } else {
    startEnter();
  }

  return () => {
    cancelled = true;
    if (enterTimer) clearTimeout(enterTimer);
    if (settleTimer) clearTimeout(settleTimer);
  };
}

/**
 * Calculate expected target hero player rect (100% full-width video player).
 */
export function calculateTargetRect(
  viewportWidth = 1024,
  _viewportHeight = 768,
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
 *
 * - `initial`: snapped to origin card bounds with no transition.
 * - `entering`: expands smoothly to target video stage bounds (320ms).
 * - `settled`: stays at target and dissolves opacity 1 → 0 (160ms) into the live video.
 * - `closing`: cross-fades back to opacity 1 and glides smoothly to origin (260ms).
 */
export function getViewTransitionHeroStyle(
  phase: TransitionPhase,
  origin: ViewTransitionRect,
  target: ViewTransitionRect,
) {
  const isTarget = phase === "entering" || phase === "settled";
  const curRect = isTarget ? target : origin;

  let transitionProperty = "none";
  let transitionDuration: `${number}ms` = `${ENTER_DURATION_MS}ms`;
  let transitionTimingFunction:
    | "ease-out"
    | "cubic-bezier(0.22, 1, 0.36, 1)" = "cubic-bezier(0.22, 1, 0.36, 1)";

  if (phase === "entering") {
    transitionProperty = "all";
    transitionDuration = `${ENTER_DURATION_MS}ms`;
  } else if (phase === "settled") {
    transitionProperty = "opacity";
    transitionDuration = `${SETTLE_FADE_MS}ms`;
    transitionTimingFunction = "ease-out";
  } else if (phase === "closing") {
    transitionProperty = "all";
    transitionDuration = `${CLOSE_DURATION_MS}ms`;
  }

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
    transitionProperty,
    transitionDuration,
    transitionTimingFunction,
    boxShadow: isTarget
      ? "0 20px 40px -12px rgba(0, 0, 0, 0.75)"
      : "0 8px 16px -4px rgba(0, 0, 0, 0.28)",
  };
}
