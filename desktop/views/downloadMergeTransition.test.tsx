import { signal } from "nsh";
import { expect, test } from "nsh/test";
import { libraryCardChrome } from "./LibraryCards";
import {
  createDownloadMergeCoordinator,
  createStaggerScheduler,
  getDownloadMergeFlightStyle,
  isRectVisibleInViewport,
  MERGE_FLIGHT_MS,
  MERGE_SETTLE_FADE_MS,
  MERGE_STAGGER_MS,
  type DownloadMergeFlight,
} from "./downloadMergeTransition";
import type { ViewTransitionRect } from "./viewTransition";

const ORIGIN_RECT: ViewTransitionRect = {
  x: 32,
  y: 120,
  width: 160,
  height: 90,
  borderRadius: 8,
};

const TARGET_RECT: ViewTransitionRect = {
  x: 24,
  y: 112,
  width: 240,
  height: 135,
  borderRadius: 8,
};

function mockNode(rect: ViewTransitionRect) {
  return {
    measure: async () => ({
      bounds: { size: { width: rect.width, height: rect.height } },
      pagePosition: { x: rect.x, y: rect.y },
    }),
  } as any;
}

test("createStaggerScheduler staggers simultaneous completions by MERGE_STAGGER_MS", () => {
  const scheduler = createStaggerScheduler(MERGE_STAGGER_MS);
  expect(scheduler.reserveDelayMs(1000)).toBe(0);
  expect(scheduler.reserveDelayMs(1000)).toBe(MERGE_STAGGER_MS);
  expect(scheduler.reserveDelayMs(1020)).toBe(MERGE_STAGGER_MS * 2 - 20);
  // Once past the reserved window, delay resets to 0.
  expect(scheduler.reserveDelayMs(2000)).toBe(0);
});

test("isRectVisibleInViewport detects visible, offscreen, and empty rects", () => {
  expect(isRectVisibleInViewport(ORIGIN_RECT, 800)).toBe(true);
  expect(
    isRectVisibleInViewport({ x: 0, y: -120, width: 160, height: 90 }, 800),
  ).toBe(false);
  expect(
    isRectVisibleInViewport({ x: 0, y: 810, width: 160, height: 90 }, 800),
  ).toBe(false);
  expect(
    isRectVisibleInViewport({ x: 0, y: 100, width: 0, height: 90 }, 800),
  ).toBe(false);
  expect(isRectVisibleInViewport(null, 800)).toBe(false);
});

test("getDownloadMergeFlightStyle maps origin, flying, and settling phases", () => {
  const base: DownloadMergeFlight = {
    videoId: "vid-1",
    thumbnailUrl: "https://example.com/thumb.jpg",
    origin: ORIGIN_RECT,
    target: TARGET_RECT,
    phase: "origin",
  };

  const originStyle = getDownloadMergeFlightStyle(base);
  expect(originStyle.left).toBe(ORIGIN_RECT.x);
  expect(originStyle.top).toBe(ORIGIN_RECT.y);
  expect(originStyle.width).toBe(ORIGIN_RECT.width);
  expect(originStyle.transitionProperty).toBe("none");
  expect(originStyle.opacity).toBe(1);

  const flyingStyle = getDownloadMergeFlightStyle({ ...base, phase: "flying" });
  expect(flyingStyle.left).toBe(TARGET_RECT.x);
  expect(flyingStyle.top).toBe(TARGET_RECT.y);
  expect(flyingStyle.width).toBe(TARGET_RECT.width);
  expect(flyingStyle.transitionProperty).toBe("all");
  expect(flyingStyle.transitionDuration).toBe(`${MERGE_FLIGHT_MS}ms`);
  expect(flyingStyle.opacity).toBe(1);

  const settlingStyle = getDownloadMergeFlightStyle({
    ...base,
    phase: "settling",
  });
  expect(settlingStyle.left).toBe(TARGET_RECT.x);
  expect(settlingStyle.transitionProperty).toBe("opacity");
  expect(settlingStyle.transitionDuration).toBe(`${MERGE_SETTLE_FADE_MS}ms`);
  expect(settlingStyle.opacity).toBe(0);
});

test("libraryCardChrome adds soft brand landing highlight without overriding selection or focus", () => {
  const landing = libraryCardChrome(false, false, true);
  expect(landing).toContain("ring-brand/45");
  expect(landing).toContain("bg-brand-soft/35");

  const focusedLanding = libraryCardChrome(false, true, true);
  expect(focusedLanding).toContain("ring-foreground");
  expect(focusedLanding).not.toContain("ring-brand/45");

  const checkedLanding = libraryCardChrome(true, false, true);
  expect(checkedLanding).toContain("bg-brand-soft/70");
});

test("createDownloadMergeCoordinator skips flight when view is disabled", async () => {
  let beforeMerge:
    | ((videoId: string, thumbnailUrl: string) => Promise<void>)
    | null = null;
  const entries = signal<{ videoId: string }[]>([]);
  const coordinator = createDownloadMergeCoordinator({
    entries,
    isDisabled: () => true,
    registerBeforeMerge: (fn) => {
      beforeMerge = fn;
    },
  });

  coordinator.setDownloadThumbRef("vid-disabled", mockNode(ORIGIN_RECT));
  const capture = beforeMerge as
    | ((videoId: string, thumbnailUrl: string) => Promise<void>)
    | null;
  await capture?.("vid-disabled", "https://example.com/t.jpg");
  expect(coordinator.cardMergePhase("vid-disabled")).toBe(null);
  expect(coordinator.flights().length).toBe(0);
  coordinator.dispose();
});

test("createDownloadMergeCoordinator prepares flying phase and launches when entry appears", async () => {
  let beforeMerge:
    | ((videoId: string, thumbnailUrl: string) => Promise<void>)
    | null = null;
  const entries = signal<{ videoId: string }[]>([]);
  const coordinator = createDownloadMergeCoordinator({
    entries,
    isDisabled: () => false,
    registerBeforeMerge: (fn) => {
      beforeMerge = fn;
    },
  });

  coordinator.setDownloadThumbRef("vid-fly", mockNode(ORIGIN_RECT));
  coordinator.setCardPosterRef("vid-fly", mockNode(TARGET_RECT));

  const capture = beforeMerge as
    | ((videoId: string, thumbnailUrl: string) => Promise<void>)
    | null;
  await capture?.("vid-fly", "https://example.com/fly.jpg");
  expect(coordinator.cardMergePhase("vid-fly")).toBe("flying");

  entries.set([{ videoId: "vid-fly" }]);
  await new Promise((r) => setTimeout(r, 60));

  expect(coordinator.flights().length).toBe(1);
  expect(coordinator.flights()[0]?.videoId).toBe("vid-fly");
  expect(coordinator.flights()[0]?.target.width).toBe(TARGET_RECT.width);
  coordinator.dispose();
});
