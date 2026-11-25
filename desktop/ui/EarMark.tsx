import {
  Canvas,
  cleanup,
  colorScheme,
  createAnimatedValue,
  effect,
  reduceMotion,
  token,
  View,
  type AnimatedNode,
  type CanvasRenderingContext2D,
  type CanvasSize,
} from "nsh";

/** ViewBox & Loop Resonance geometry matching `web/public/index.html` and `style.css`. */
const VIEWBOX = 24;
/** Extra canvas margin in viewBox units so the 1.3x ripple arc never clips. */
const PAD = 4;
const TOTAL_VIEWBOX = VIEWBOX + PAD * 2;

const LOOP_LENGTH = 12 + 6 * ((7 * Math.PI) / 4);
const PATH_SCALE = LOOP_LENGTH / 100;

export const EAR_MARK_CYCLE_MS = 3200;
export const EAR_MARK_FLOW_DASH = 14 * PATH_SCALE;
export const EAR_MARK_FLOW_GAP = 140 * PATH_SCALE;
export const EAR_MARK_FLOW_START = 16 * PATH_SCALE;
export const EAR_MARK_FLOW_END = -102 * PATH_SCALE;

const ARC_ORIGIN_X = 11;
const ARC_ORIGIN_Y = 12;
const ARC_RADIUS = 10;
const ARC_HALF_ANGLE = Math.atan2(5.74, 8.19);
const EASE_RESONANCE: [number, number, number, number] = [0.45, 0, 0.55, 1];

export interface EarMarkDrawValues {
  loopColor: string;
  accentColor: string;
  arcColor: string;
  flowOffset: number | AnimatedNode;
  flowOpacity: number | AnimatedNode;
  arcOpacity: number | AnimatedNode;
  arcScale: number | AnimatedNode;
  ghostOpacity: number | AnimatedNode;
  ghostScale: number | AnimatedNode;
}

function traceLoopPath(cx: CanvasRenderingContext2D) {
  cx.beginPath();
  cx.moveTo(5, 12);
  cx.lineTo(17, 12);
  cx.arc(ARC_ORIGIN_X, ARC_ORIGIN_Y, 6, 0, Math.PI / 4, true);
}

function traceArcPath(cx: CanvasRenderingContext2D) {
  cx.beginPath();
  cx.arc(ARC_ORIGIN_X, ARC_ORIGIN_Y, ARC_RADIUS, -ARC_HALF_ANGLE, ARC_HALF_ANGLE, false);
}

/** Draw all four layers of the Loop Resonance ("e)") mark onto a 2D canvas. */
export function drawEarMark(
  cx: CanvasRenderingContext2D,
  canvasSize: CanvasSize,
  values: EarMarkDrawValues,
) {
  const w = canvasSize.width;
  const h = canvasSize.height;
  if (w <= 0 || h <= 0) return;

  const unit = Math.min(w, h) / TOTAL_VIEWBOX;
  cx.clearRect(0, 0, w, h);

  cx.save();
  cx.scale(unit, unit);
  cx.translate(PAD, PAD);
  cx.lineWidth = 2;
  cx.lineCap = "round";
  cx.lineJoin = "round";

  // 1. Base "e" loop in foreground color.
  cx.strokeStyle = values.loopColor;
  traceLoopPath(cx);
  cx.stroke();

  // 2. Traveling accent pulse along the "e" loop (`earFlow`).
  cx.save();
  cx.strokeStyle = values.accentColor;
  cx.globalAlpha = values.flowOpacity;
  cx.setLineDash([EAR_MARK_FLOW_DASH, EAR_MARK_FLOW_GAP]);
  cx.lineDashOffset = values.flowOffset;
  traceLoopPath(cx);
  cx.stroke();
  cx.restore();

  // 3. Expanding ripple ghost arc (`earRip`).
  cx.save();
  cx.strokeStyle = values.accentColor;
  cx.globalAlpha = values.ghostOpacity;
  cx.translate(ARC_ORIGIN_X, ARC_ORIGIN_Y);
  cx.scale(values.ghostScale, values.ghostScale);
  cx.translate(-ARC_ORIGIN_X, -ARC_ORIGIN_Y);
  traceArcPath(cx);
  cx.stroke();
  cx.restore();

  // 4. Resonating outer arc (`earRes`).
  cx.save();
  cx.strokeStyle = values.arcColor;
  cx.globalAlpha = values.arcOpacity;
  cx.translate(ARC_ORIGIN_X, ARC_ORIGIN_Y);
  cx.scale(values.arcScale, values.arcScale);
  cx.translate(-ARC_ORIGIN_X, -ARC_ORIGIN_Y);
  traceArcPath(cx);
  cx.stroke();
  cx.restore();

  cx.restore();
}

/**
 * Two-tone Loop Resonance ("e)") brand mark adapting to light and dark modes.
 * Static at rest; when `animated` is true (e.g. on hover), plays the web
 * Loop Resonance pulse + ripple cycle natively on the UI thread.
 */
export function EarMark(props: { size?: number; animated?: boolean | (() => boolean) }) {
  const size = props.size ?? 18;
  const padPx = (size * PAD) / VIEWBOX;
  const canvasDim = (size * TOTAL_VIEWBOX) / VIEWBOX;

  const isRequested = () =>
    typeof props.animated === "function" ? props.animated() : Boolean(props.animated);
  const isAnimating = () => isRequested() && !reduceMotion();

  const flowOffset = createAnimatedValue(EAR_MARK_FLOW_START);
  const flowOpacity = createAnimatedValue(0);
  const arcOpacity = createAnimatedValue(1);
  const arcScale = createAnimatedValue(1);
  const ghostOpacity = createAnimatedValue(0);
  const ghostScale = createAnimatedValue(1);

  const resetToIdle = () => {
    flowOffset.set(EAR_MARK_FLOW_START);
    flowOpacity.set(0);
    arcOpacity.set(1);
    arcScale.set(1);
    ghostOpacity.set(0);
    ghostScale.set(1);
  };

  effect(() => {
    if (!isAnimating()) {
      resetToIdle();
      return;
    }

    flowOpacity.set(1);
    void flowOffset.keyframes([EAR_MARK_FLOW_START, EAR_MARK_FLOW_END], {
      duration: EAR_MARK_CYCLE_MS,
      easing: EASE_RESONANCE,
      iterations: "infinite",
    });
    void arcOpacity.keyframes(
      [
        { offset: 0, value: 0.45 },
        { offset: 0.64, value: 0.45 },
        { offset: 0.88, value: 1 },
        { offset: 1, value: 0.45 },
      ],
      {
        duration: EAR_MARK_CYCLE_MS,
        easing: EASE_RESONANCE,
        iterations: "infinite",
      },
    );
    void arcScale.keyframes(
      [
        { offset: 0, value: 1 },
        { offset: 0.64, value: 1 },
        { offset: 0.88, value: 1.04 },
        { offset: 1, value: 1 },
      ],
      {
        duration: EAR_MARK_CYCLE_MS,
        easing: EASE_RESONANCE,
        iterations: "infinite",
      },
    );
    void ghostOpacity.keyframes(
      [
        { offset: 0, value: 0 },
        { offset: 0.8, value: 0 },
        { offset: 0.85, value: 0.45 },
        { offset: 1, value: 0 },
      ],
      {
        duration: EAR_MARK_CYCLE_MS,
        easing: "easeOut",
        iterations: "infinite",
      },
    );
    void ghostScale.keyframes(
      [
        { offset: 0, value: 1 },
        { offset: 0.8, value: 1 },
        { offset: 1, value: 1.3 },
      ],
      {
        duration: EAR_MARK_CYCLE_MS,
        easing: "easeOut",
        iterations: "infinite",
      },
    );
  });

  cleanup(resetToIdle);

  const accentColor = () => (colorScheme() === "dark" ? "#2f7cf6" : "#2563eb");
  const hoverAccentColor = () => (colorScheme() === "dark" ? "#3b82f6" : "#1d4ed8");

  return (
    <View style={{ width: size, height: size }} class="pointer-events-none relative">
      <Canvas
        style={{
          position: "absolute",
          left: -padPx,
          top: -padPx,
          width: canvasDim,
          height: canvasDim,
        }}
        class="pointer-events-none"
        draw={(cx, canvasSize) => {
          const dark = colorScheme() === "dark";
          const loopColor = String(token("foreground") || (dark ? "#fafafa" : "#0a0a0a"));
          const accent = accentColor();
          const arcColor = isRequested() ? hoverAccentColor() : accent;
          drawEarMark(cx, canvasSize, {
            loopColor,
            accentColor: accent,
            arcColor,
            flowOffset,
            flowOpacity,
            arcOpacity,
            arcScale,
            ghostOpacity,
            ghostScale,
          });
        }}
      />
    </View>
  );
}
