import { expect, test } from "nsh/test";
import {
  calculateFallbackOriginRect,
  calculateTargetRect,
  captureElementRect,
  computeFlipTransform,
  getViewTransitionHeroStyle,
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
  expect(enteringStyle.transitionProperty).toContain("left");

  // Phase 3: settled (hidden at target, native player takes over)
  const settledStyle = getViewTransitionHeroStyle("settled", origin, target);
  expect(settledStyle.opacity).toBe(0);

  // Phase 4: closing (animating back to origin)
  const closingStyle = getViewTransitionHeroStyle("closing", origin, target);
  expect(closingStyle.left).toBe(50);
  expect(closingStyle.top).toBe(300);
  expect(closingStyle.width).toBe(120);
  expect(closingStyle.height).toBe(68);
  expect(closingStyle.opacity).toBe(1);
  expect(closingStyle.transitionProperty).toContain("left");
  expect(closingStyle.transitionDuration).toBe("340ms");
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
