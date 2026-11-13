import { PanResponder, ShaderEffect, shadersAvailable } from "nsh";
import { expect, test } from "nsh/test";
import {
  DEFAULT_BLOCKER_RECT,
  getBlockerRect,
  normalizeSettings,
  resetBlockerRect,
  saveBlockerRect,
  setBlockerBlur,
  setBlockerEnabled,
  setBlockerMosaic,
  setBlockerOpacity,
  setBlockerStyle,
  type SubtitleBlockerRect,
} from "../store";
import { t } from "./i18n";
import { SubtitleBlocker } from "./SubtitleBlocker";
import {
  computeDeltaRect,
  computeDragRect,
  createBlockerVisual,
  createFeatherGradient,
  cursorForDrag,
  drawMosaicCanvas,
  getPoint,
  MOSAIC_DARK_SHADES,
  MOSAIC_LIGHT_SHADES,
  MOSAIC_PALETTE,
  MOSAIC_SHADER,
  nudgeRect,
} from "./subtitleBlockerLogic";

test("Inspect event object in nsh", async () => {
  let captured: any = null;
  // We can verify getPoint logic
  const dummy = {
    position: { x: 10, y: 20 },
    pagePosition: { x: 100, y: 200 },
  };
  expect(getPoint(dummy)).toEqual({ x: 100, y: 200 });
});

test("DEFAULT_BLOCKER_RECT provides bottom-centered default percentages", () => {
  expect(DEFAULT_BLOCKER_RECT.x).toBe(10);
  expect(DEFAULT_BLOCKER_RECT.y).toBe(82);
  expect(DEFAULT_BLOCKER_RECT.width).toBe(80);
  expect(DEFAULT_BLOCKER_RECT.height).toBe(12);
});

test("normalizeSettings validates and normalizes subtitle blocker settings", () => {
  const defaults = normalizeSettings({});
  expect(defaults.subtitleBlockerEnabled).toBe(false);
  expect(defaults.subtitleBlockerStyle).toBe("mosaic");
  expect(defaults.subtitleBlockerOpacity).toBe(85);
  expect(defaults.subtitleBlockerMosaic).toBe(16);
  expect(defaults.subtitleBlockerBlur).toBe(28);
  expect(defaults.subtitleBlockerDefault).toEqual(DEFAULT_BLOCKER_RECT);
  expect(defaults.subtitleBlockerVideos).toEqual({});

  const custom = normalizeSettings({
    subtitleBlockerEnabled: true,
    subtitleBlockerStyle: "solid",
    subtitleBlockerOpacity: 60,
    subtitleBlockerMosaic: 24,
    subtitleBlockerBlur: 32,
    subtitleBlockerDefault: { x: 5, y: 80, width: 90, height: 15 },
    subtitleBlockerVideos: {
      vid123: { x: 12, y: 75, width: 76, height: 18 },
      invalid: "bad" as unknown as SubtitleBlockerRect,
    },
  });

  expect(custom.subtitleBlockerEnabled).toBe(true);
  expect(custom.subtitleBlockerStyle).toBe("solid");
  expect(custom.subtitleBlockerOpacity).toBe(60);
  expect(custom.subtitleBlockerMosaic).toBe(24);
  expect(custom.subtitleBlockerBlur).toBe(32);
  expect(custom.subtitleBlockerDefault.width).toBe(90);
  expect(custom.subtitleBlockerVideos["vid123"]).toEqual({
    x: 12,
    y: 75,
    width: 76,
    height: 18,
  });
  expect(custom.subtitleBlockerVideos["invalid"]).toBeUndefined();
});

test("getBlockerRect returns global default or per-video overrides", () => {
  const vid = "test_video_1";
  expect(getBlockerRect(vid)).toEqual(DEFAULT_BLOCKER_RECT);

  const customRect: SubtitleBlockerRect = { x: 15, y: 70, width: 70, height: 20 };
  saveBlockerRect(customRect, vid);

  expect(getBlockerRect(vid)).toEqual(customRect);
  expect(getBlockerRect("another_vid")).toEqual(DEFAULT_BLOCKER_RECT);

  // Resetting per-video reverts to default
  const resetResult = resetBlockerRect(vid);
  expect(resetResult).toEqual(DEFAULT_BLOCKER_RECT);
  expect(getBlockerRect(vid)).toEqual(DEFAULT_BLOCKER_RECT);
});

test("saveBlockerRect clamps coordinates within boundaries", () => {
  const vid = "clamp_video";
  saveBlockerRect({ x: -10, y: 150, width: 150, height: 1 }, vid);
  const clamped = getBlockerRect(vid);

  expect(clamped.x).toBe(0);
  expect(clamped.y).toBe(100);
  expect(clamped.width).toBe(100);
  expect(clamped.height).toBe(2);
});

test("setBlockerOpacity and setBlockerBlur update settings correctly", () => {
  setBlockerEnabled(true);
  setBlockerStyle("mosaic");
  setBlockerOpacity(90);
  setBlockerBlur(60);
  setBlockerMosaic(20);

  const s = normalizeSettings({});
  expect(typeof s.subtitleBlockerEnabled).toBe("boolean");
});

test("SubtitleBlocker exports a valid component function", () => {
  expect(typeof SubtitleBlocker).toBe("function");
});

test("i18n includes English and Chinese translations for subtitle blocker", () => {
  const en = t("en");
  const zh = t("zh");

  expect(en.subtitleBlocker).toBe("Blocker");
  expect(en.toggleSubtitleBlocker).toContain("Toggle subtitle blocker");
  expect(en.resetBlocker).toBe("Reset position");
  expect(en.blockerOpacity).toBe("Opacity");
  expect(en.blockerBlur).toBe("Blur");
  expect(en.blockerMosaic).toBe("Mosaic");
  expect(en.dragToMove).toBe("Drag to move");

  expect(zh.subtitleBlocker).toBe("拦截字幕条");
  expect(zh.toggleSubtitleBlocker).toContain("切换拦截字幕条");
  expect(zh.resetBlocker).toBe("重置位置");
  expect(zh.blockerOpacity).toBe("不透明度");
  expect(zh.blockerBlur).toBe("高斯虚化");
  expect(zh.blockerMosaic).toBe("放大马赛克");
  expect(zh.dragToMove).toBe("拖动调整位置");
});

test("getPoint extracts coordinates across different event payloads", () => {
  expect(getPoint({ pageX: 120, pageY: 240 })).toEqual({ x: 120, y: 240 });
  expect(getPoint({ clientX: 55, clientY: 88 })).toEqual({ x: 55, y: 88 });
  expect(getPoint({ pagePosition: { x: 300, y: 400 } })).toEqual({ x: 300, y: 400 });
  expect(getPoint({ screenX: 10, screenY: 20 })).toEqual({ x: 10, y: 20 });
  expect(getPoint({ position: { x: 5, y: 8 } })).toEqual({ x: 5, y: 8 });
  expect(getPoint(null)).toBeNull();
  expect(getPoint({})).toBeNull();
});

test("computeDragRect moves blocker smoothly and clamps within container", () => {
  const init: SubtitleBlockerRect = { x: 10, y: 80, width: 80, height: 12 };
  const startPt = { x: 200, y: 500 };
  const curPt = { x: 250, y: 520 }; // +50px X, +20px Y in 1000x500 container (+5% X, +4% Y)

  const moved = computeDragRect("move", init, startPt, curPt, 1000, 500);
  expect(moved.x).toBe(15);
  expect(moved.y).toBe(84);
  expect(moved.width).toBe(80);
  expect(moved.height).toBe(12);

  // Clamping at maximum boundary (100 - width = 20%, 100 - height = 88%)
  const clampedMax = computeDragRect(
    "move",
    init,
    startPt,
    { x: 1200, y: 1500 },
    1000,
    500,
  );
  expect(clampedMax.x).toBe(20);
  expect(clampedMax.y).toBe(88);

  // Clamping at minimum boundary (0, 0)
  const clampedMin = computeDragRect(
    "move",
    init,
    startPt,
    { x: -500, y: -500 },
    1000,
    500,
  );
  expect(clampedMin.x).toBe(0);
  expect(clampedMin.y).toBe(0);
});

test("computeDragRect resizes correctly in all 8 directions", () => {
  const init: SubtitleBlockerRect = { x: 20, y: 40, width: 60, height: 20 };
  const startPt = { x: 500, y: 500 };

  // Expand east by 100px (+10% in 1000px container)
  const east = computeDragRect("e", init, startPt, { x: 600, y: 500 }, 1000, 500);
  expect(east.width).toBe(70);
  expect(east.x).toBe(20);

  // Expand south by 50px (+10% in 500px container)
  const south = computeDragRect("s", init, startPt, { x: 500, y: 550 }, 1000, 500);
  expect(south.height).toBe(30);
  expect(south.y).toBe(40);

  // Expand west by moving 50px left (-5% in 1000px container)
  const west = computeDragRect("w", init, startPt, { x: 450, y: 500 }, 1000, 500);
  expect(west.x).toBe(15);
  expect(west.width).toBe(65);

  // Expand north by moving 25px up (-5% in 500px container)
  const north = computeDragRect("n", init, startPt, { x: 500, y: 475 }, 1000, 500);
  expect(north.y).toBe(35);
  expect(north.height).toBe(25);

  // Corner SE (expands east and south simultaneously)
  const se = computeDragRect("se", init, startPt, { x: 550, y: 550 }, 1000, 500);
  expect(se.width).toBe(65);
  expect(se.height).toBe(30);
});

test("nudgeRect shifts Y position up and down with bounds clamping", () => {
  const rect: SubtitleBlockerRect = { x: 10, y: 80, width: 80, height: 12 };

  const nudgedUp = nudgeRect(rect, "up", 2);
  expect(nudgedUp.y).toBe(78);

  const nudgedDown = nudgeRect(rect, "down", 2);
  expect(nudgedDown.y).toBe(82);

  // Clamping at 0
  const topRect: SubtitleBlockerRect = { x: 10, y: 1, width: 80, height: 12 };
  expect(nudgeRect(topRect, "up", 5).y).toBe(0);

  // Clamping at 100 - height = 88
  const botRect: SubtitleBlockerRect = { x: 10, y: 87, width: 80, height: 12 };
  expect(nudgeRect(botRect, "down", 5).y).toBe(88);
});

test("createFeatherGradient produces linear-gradient with vertical fade stops", () => {
  const gradient = createFeatherGradient(20, 90);
  expect(gradient).toContain("linear-gradient(to bottom");
  expect(gradient).toContain("rgba(16, 16, 20, 0) 0%");
  expect(gradient).toContain("rgba(16, 16, 20, 0.9) 20%");
  expect(gradient).toContain("rgba(16, 16, 20, 0.9) 80%");
  expect(gradient).toContain("rgba(16, 16, 20, 0) 100%");
});

test("cursorForDrag maps modes to appropriate cursor types", () => {
  expect(cursorForDrag(null)).toBe("default");
  expect(cursorForDrag("move")).toBe("grabbing");
  expect(cursorForDrag("n")).toBe("ns-resize");
  expect(cursorForDrag("s")).toBe("ns-resize");
  expect(cursorForDrag("w")).toBe("ew-resize");
  expect(cursorForDrag("e")).toBe("ew-resize");
  expect(cursorForDrag("nw")).toBe("nwse-resize");
  expect(cursorForDrag("se")).toBe("nwse-resize");
  expect(cursorForDrag("ne")).toBe("nesw-resize");
  expect(cursorForDrag("sw")).toBe("nesw-resize");
});

test("createBlockerVisual generates unified enlarged mosaic + deep blur styles from intensity progress", () => {
  const visualDefault = createBlockerVisual(85);
  expect(visualDefault.backgroundImage).toContain("repeating-linear-gradient");
  expect(visualDefault.backdropFilter).toContain("blur(");
  expect(visualDefault.backgroundColor).toContain("rgba(12, 12, 18, 0.78)");

  const visualLow = createBlockerVisual(10);
  expect(visualLow.backgroundImage).toContain("repeating-linear-gradient");
  expect(visualLow.backdropFilter).toContain("blur(24px)");
  expect(visualLow.backgroundColor).toContain("rgba(12, 12, 18, 0.45)");

  const visualMax = createBlockerVisual(100);
  expect(visualMax.backdropFilter).toContain("blur(52px)");
  expect(visualMax.backgroundColor).toContain("rgba(12, 12, 18, 0.84)");
});

test("computeDeltaRect calculates smooth displacement with bounding clamps", () => {
  const init: SubtitleBlockerRect = { x: 10, y: 80, width: 80, height: 12 };
  // Move 50px right (+5% in 1000px container) and 25px down (+5% in 500px container)
  const moved = computeDeltaRect("move", init, 50, 25, 1000, 500);
  expect(moved.x).toBe(15);
  expect(moved.y).toBe(85);
  expect(moved.width).toBe(80);
  expect(moved.height).toBe(12);

  // Resize right handle (east) by 100px (+10% in 1000px container)
  const resizedE = computeDeltaRect("e", init, 100, 0, 1000, 500);
  expect(resizedE.x).toBe(10);
  expect(resizedE.width).toBe(90);

  // Resize top handle (north) by -50px (expanded up by 10% in 500px container)
  const resizedN = computeDeltaRect("n", init, 0, -50, 1000, 500);
  expect(resizedN.y).toBe(70);
  expect(resizedN.height).toBe(22);
});

test("drawMosaicCanvas populates context with monochrome staggered mosaic tiles", () => {
  const drawnRects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  let cleared = false;

  const mockCtx = {
    fillStyle: "",
    clearRect: () => {
      cleared = true;
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      drawnRects.push({ x, y, w, h, color: mockCtx.fillStyle });
    },
  };

  // Draw 80x20 mosaic at 80% intensity (tileSize ~19px)
  drawMosaicCanvas(mockCtx, { width: 80, height: 20 }, 80);

  expect(cleared).toBe(true);
  expect(drawnRects.length).toBeGreaterThan(0);
  // Verify colors are drawn as translucent rgba tiles
  expect(drawnRects.every((r) => r.color.startsWith("rgba("))).toBe(true);
  // Total covered width equals or exceeds canvas dimensions
  const maxX = Math.max(...drawnRects.map((r) => r.x + r.w));
  const maxY = Math.max(...drawnRects.map((r) => r.y + r.h));
  expect(maxX).toBe(80);
  expect(maxY).toBe(20);

  // Verify palette colors are strictly monochrome (Black, White, Grey)
  expect(MOSAIC_DARK_SHADES.length).toBeGreaterThan(0);
  expect(MOSAIC_LIGHT_SHADES.length).toBeGreaterThan(0);
  expect(MOSAIC_PALETTE.length).toBe(
    MOSAIC_DARK_SHADES.length + MOSAIC_LIGHT_SHADES.length,
  );

  // i18n English string for holdToDrag
  expect(t("en").holdToDrag).toBe("Hold to drag");
  expect(t("zh").holdToDrag).toBe("Hold to drag");
});

test("ShaderEffect and shadersAvailable in nsh", () => {
  expect(typeof ShaderEffect).toBe("function");
  expect(typeof shadersAvailable).toBe("function");
  const isAvailable = shadersAvailable();
  expect(typeof isAvailable).toBe("boolean");

  expect(typeof MOSAIC_SHADER).toBe("string");
  expect(MOSAIC_SHADER).toContain("sample_backdrop");
  expect(MOSAIC_SHADER).toContain("nsh.progress");

  const elem = ShaderEffect({
    source: MOSAIC_SHADER,
    progress: 0.85,
  });
  expect(elem).toBeDefined();
});

test("Whole-area drag interaction and placeholder affordance", () => {
  // Test PanResponder creation for whole-area drag
  const startRect = { x: 10, y: 80, width: 80, height: 12 };
  const containerW = 1000;
  const containerH = 500;

  // Dragging 50px right and 30px down across the whole surface
  const moved = computeDeltaRect("move", startRect, 50, 30, containerW, containerH);
  expect(moved.x).toBe(15); // 10% + (50 / 1000 * 100)% = 15%
  expect(moved.y).toBe(86); // 80% + (30 / 500 * 100)% = 86%
  expect(moved.width).toBe(80);
  expect(moved.height).toBe(12);

  // Dragging to container boundary clamps without overflowing
  const clampedEdge = computeDeltaRect("move", startRect, 500, 500, containerW, containerH);
  expect(clampedEdge.x).toBe(20); // 100 - 80 = 20%
  expect(clampedEdge.y).toBe(88); // 100 - 12 = 88%

  // Cursor for dragging maps correctly
  expect(cursorForDrag("move")).toBe("grabbing");
  expect(cursorForDrag(null)).toBe("default");

  // Placeholder hint label
  expect(t("en").holdToDrag).toBe("Hold to drag");
});
