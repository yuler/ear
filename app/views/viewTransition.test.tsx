import { expect, test } from "nsh/test";
import { computePlayerLayout, resolveAutoLayoutMode } from "./playerLayout";
import {
  calculateFallbackOriginRect,
  calculateTargetRect,
  captureElementRect,
  CLOSE_DURATION_MS,
  computeFlipTransform,
  ENTER_DURATION_MS,
  getViewTransitionHeroStyle,
  layoutTargetRect,
  SETTLE_FADE_MS,
} from "./viewTransition";

test("calculateTargetRect calculates 100% full-width hero player with 16:9 ratio", () => {
  const target = calculateTargetRect(1200, 800);
  expect(target.width).toBe(1200);
  expect(target.height).toBe(Math.round((1200 * 9) / 16));
  expect(target.x).toBe(0);
  expect(target.borderRadius).toBe(0);
});

test("calculateFallbackOriginRect provides centered mini-player position", () => {
  const origin = calculateFallbackOriginRect(1024, 768);
  expect(origin.width).toBe(144);
  expect(origin.height).toBe(81);
  expect(origin.x).toBe(Math.round((1024 - 144) / 2));
  expect(origin.y).toBe(768 - 81 - 32);
});

test("computeFlipTransform calculates dx, dy, and scale correctly", () => {
  const origin = { x: 50, y: 300, width: 120, height: 68, borderRadius: 8 };
  const target = { x: 200, y: 136, width: 800, height: 450, borderRadius: 12 };

  const flip = computeFlipTransform(origin, target);
  expect(flip.dx).toBe(-150);
  expect(flip.dy).toBe(164);
  expect(Math.round(flip.scaleX * 1000)).toBe(Math.round((120 / 800) * 1000));
  expect(Math.round(flip.scaleY * 1000)).toBe(Math.round((68 / 450) * 1000));
  expect(flip.transform).toContain("scale(");
});

test("captureElementRect safely extracts bounds from mock node", async () => {
  const mockNode = {
    measure: async () => ({
      bounds: { size: { width: 128, height: 96 } },
      pagePosition: { x: 42, y: 108 },
    }),
  };

  const rect = await captureElementRect(mockNode, 6);
  expect(rect).toEqual({
    x: 42,
    y: 108,
    width: 128,
    height: 96,
    borderRadius: 6,
  });

  const nullResult = await captureElementRect(null);
  expect(nullResult).toBeNull();
});

test("getViewTransitionHeroStyle manages position, opacity, and transition properties by phase", () => {
  const origin = { x: 50, y: 300, width: 120, height: 68, borderRadius: 8 };
  const target = { x: 200, y: 136, width: 800, height: 450, borderRadius: 12 };

  // Phase 1: initial (snapped to origin with no animation)
  const initialStyle = getViewTransitionHeroStyle("initial", origin, target);
  expect(initialStyle.left).toBe(50);
  expect(initialStyle.top).toBe(300);
  expect(initialStyle.width).toBe(120);
  expect(initialStyle.height).toBe(68);
  expect(initialStyle.borderRadius).toBe(8);
  expect(initialStyle.opacity).toBe(1);
  expect(initialStyle.transitionProperty).toBe("none");

  // Phase 2: entering (animating to target)
  const enteringStyle = getViewTransitionHeroStyle("entering", origin, target);
  expect(enteringStyle.left).toBe(200);
  expect(enteringStyle.top).toBe(136);
  expect(enteringStyle.width).toBe(800);
  expect(enteringStyle.height).toBe(450);
  expect(enteringStyle.borderRadius).toBe(12);
  expect(enteringStyle.opacity).toBe(1);
  expect(enteringStyle.transitionProperty).toBe("all");
  expect(enteringStyle.transitionDuration).toBe(`${ENTER_DURATION_MS}ms`);

  // Phase 3: settled (cross-dissolves opacity smoothly at target into the live player)
  const settledStyle = getViewTransitionHeroStyle("settled", origin, target);
  expect(settledStyle.opacity).toBe(0);
  expect(settledStyle.transitionProperty).toBe("opacity");
  expect(settledStyle.transitionDuration).toBe(`${SETTLE_FADE_MS}ms`);

  // Phase 4: closing (glides smoothly back to origin)
  const closingStyle = getViewTransitionHeroStyle("closing", origin, target);
  expect(closingStyle.left).toBe(50);
  expect(closingStyle.top).toBe(300);
  expect(closingStyle.width).toBe(120);
  expect(closingStyle.height).toBe(68);
  expect(closingStyle.opacity).toBe(1);
  expect(closingStyle.transitionProperty).toBe("all");
  expect(closingStyle.transitionDuration).toBe(`${CLOSE_DURATION_MS}ms`);
});

test("layoutTargetRect targets portrait side-by-side stage immediately when aspect is portrait", () => {
  const portraitMode = resolveAutoLayoutMode("stacked", 1200, 800, 720 / 1280);
  expect(portraitMode).toBe("side");
  const portraitLayout = computePlayerLayout(portraitMode, 1200, 800, 720 / 1280);
  const portraitTarget = layoutTargetRect(portraitLayout);
  expect(portraitTarget).toEqual({
    x: 0,
    y: 0,
    width: 1200 - 552,
    height: 800,
    borderRadius: 0,
  });

  const landscapeMode = resolveAutoLayoutMode("stacked", 1200, 800, 1920 / 1080);
  expect(landscapeMode).toBe("stacked");
  const landscapeLayout = computePlayerLayout(landscapeMode, 1200, 800, 1920 / 1080);
  const landscapeTarget = layoutTargetRect(landscapeLayout);
  expect(landscapeTarget).toEqual({
    x: 0,
    y: 0,
    width: 1200,
    height: Math.floor(800 * 0.52),
    borderRadius: 0,
  });
});

test("FLIP scale calculation creates scale big transform from origin to target", () => {
  const origin = { x: 100, y: 400, width: 160, height: 90, borderRadius: 8 };
  const target = { x: 32, y: 120, width: 960, height: 540, borderRadius: 12 };

  const flip = computeFlipTransform(origin, target);
  // dx = 100 - 32 = 68, dy = 400 - 120 = 280
  expect(flip.dx).toBe(68);
  expect(flip.dy).toBe(280);
  // Scale factor from 960x540 down to 160x90 is 1/6 (~0.1667)
  expect(Math.round(flip.scaleX * 1000)).toBe(Math.round((160 / 960) * 1000));
  expect(Math.round(flip.scaleY * 1000)).toBe(Math.round((90 / 540) * 1000));
  expect(flip.transform).toContain("translate(68px, 280px)");
});
