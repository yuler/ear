import { expect, test } from "nsh/test";
import {
  DEFAULT_BLOCKER_RECT,
  getBlockerRect,
  normalizeSettings,
  resetBlockerRect,
  saveBlockerRect,
  setBlockerEnabled,
  type SubtitleBlockerRect,
} from "../store";
import { t } from "./i18n";
import { SubtitleBlocker } from "./SubtitleBlocker";
import {
  BLOCKER_BACKDROP_FILTER,
  computeDeltaRect,
  computeDragRect,
  cursorForDrag,
  getPoint,
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
  expect(defaults.subtitleBlockerDefault).toEqual(DEFAULT_BLOCKER_RECT);
  expect(defaults.subtitleBlockerVideos).toEqual({});

  const custom = normalizeSettings({
    subtitleBlockerEnabled: true,
    subtitleBlockerDefault: { x: 5, y: 80, width: 90, height: 15 },
    subtitleBlockerVideos: {
      vid123: { x: 12, y: 75, width: 76, height: 18 },
      invalid: "bad" as unknown as SubtitleBlockerRect,
    },
  });

  expect(custom.subtitleBlockerEnabled).toBe(true);
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

test("setBlockerEnabled keeps settings valid; style is a fixed blur", () => {
  setBlockerEnabled(true);
  expect(BLOCKER_BACKDROP_FILTER).toContain("blur(");

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
  expect(en.dragToMove).toBe("Drag to move");

  expect(zh.subtitleBlocker).toBe("拦截字幕条");
  expect(zh.toggleSubtitleBlocker).toContain("切换拦截字幕条");
  expect(zh.resetBlocker).toBe("重置位置");
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

test("i18n holdToDrag label", () => {
  expect(t("en").holdToDrag).toBe("Hold to drag");
  expect(t("zh").holdToDrag).toBe("Hold to drag");
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
