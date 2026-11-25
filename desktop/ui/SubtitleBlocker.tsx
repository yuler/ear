// Sibling logic, pure math & geometry helpers: desktop/ui/subtitleBlockerLogic.ts
import {
  Canvas,
  effect,
  PanResponder,
  ShaderEffect,
  shadersAvailable,
  signal,
  Text,
  View,
  type ViewRef,
} from "nsh";
import { Button, Slider } from "nsh/base";
import {
  getBlockerRect,
  resetBlockerRect,
  saveBlockerRect,
  type EarLocale,
  type SubtitleBlockerRect,
} from "../store";
import { Icon } from "./Icon";
import { t } from "./i18n";
import {
  computeDeltaRect,
  cursorForDrag,
  DEFAULT_BLOCKER_INTENSITY,
  drawMosaicCanvas,
  getBlockerIntensity,
  hydrateBlockerIntensity,
  MOSAIC_SHADER,
  saveBlockerIntensity,
  type DragMode,
} from "./subtitleBlockerLogic";

export type { DragMode } from "./subtitleBlockerLogic";

function MiniSlider(props: {
  value: () => number;
  min: number;
  max: number;
  step?: number;
  width?: number;
  label: string;
  unit?: string;
  onChange: (val: number) => void;
}) {
  return (
    <View class="flex-row items-center gap-1.5 select-none">
      <Text class="font-mono text-[10px] text-white/75 select-none">
        {props.label}
      </Text>
      <View style={{ width: props.width ?? 76 }} class="justify-center">
        <Slider
          value={props.value()}
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          onChange={(e) => {
            if (typeof e.value === "number") props.onChange(e.value);
          }}
          trackClass="h-5 justify-center cursor-pointer select-none"
          indicatorClass="h-1.5 w-full rounded-full bg-white/20 overflow-hidden"
          rangeClass="h-full rounded-full bg-brand"
          thumbClass="size-3.5 rounded-full border border-black/40 bg-brand shadow-md transition-transform hover:scale-125"
        />
      </View>
      <Text class="min-w-[28px] font-mono text-[10px] text-white/90 select-none tabular-nums">
        {Math.round(props.value())}
        {props.unit ?? ""}
      </Text>
    </View>
  );
}

export function SubtitleBlocker(props: {
  videoId?: () => string | undefined;
  enabled: () => boolean;
  language?: () => EarLocale;
  onToggleEnabled?: () => void;
}) {
  const videoId = () => props.videoId?.();
  const lang = () => props.language?.() ?? "en";
  const m = () => t(lang());

  const rect = signal<SubtitleBlockerRect>(getBlockerRect(videoId()));
  const intensity = signal<number>(getBlockerIntensity());

  const isHovered = signal(false);
  const dragMode = signal<DragMode | null>(null);

  let containerRef: ViewRef | null = null;
  const containerSize = signal({ width: 1000, height: 562 });

  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  void hydrateBlockerIntensity().then((val) => {
    intensity.set(val);
  });

  // Sync rect when videoId changes
  effect(() => {
    const id = videoId();
    rect.set(getBlockerRect(id));
  });

  const updateContainerSize = () => {
    if (containerRef) {
      void containerRef.measure().then((measured) => {
        if (
          measured &&
          measured.bounds.size.width > 0 &&
          measured.bounds.size.height > 0
        ) {
          containerSize.set({
            width: measured.bounds.size.width,
            height: measured.bounds.size.height,
          });
        }
      });
    }
  };

  const handleMouseEnter = () => {
    if (idleTimer) clearTimeout(idleTimer);
    isHovered.set(true);
  };

  const handleMouseLeave = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (dragMode() !== null) return;
    idleTimer = setTimeout(() => {
      if (!dragMode()) {
        isHovered.set(false);
      }
    }, 2000);
  };

  const handleReset = () => {
    const defaultR = resetBlockerRect(videoId());
    rect.set({ ...defaultR });
    intensity.set(saveBlockerIntensity(DEFAULT_BLOCKER_INTENSITY));
    handleMouseEnter();
  };

  const handleIntensityChange = (val: number) => {
    intensity.set(saveBlockerIntensity(val));
    handleMouseEnter();
  };

  const createPanHandler = (mode: DragMode) => {
    let startRect = { ...rect() };
    let startW = 1000;
    let startH = 562;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragMode.set(mode);
        isHovered.set(true);
        if (idleTimer) clearTimeout(idleTimer);
        updateContainerSize();
        startRect = { ...rect() };
        startW = Math.max(100, containerSize().width);
        startH = Math.max(50, containerSize().height);
      },
      onPanResponderMove: (_e, gestureState) => {
        const next = computeDeltaRect(
          mode,
          startRect,
          gestureState.dx,
          gestureState.dy,
          startW,
          startH,
        );
        rect.set(next);
      },
      onPanResponderRelease: () => {
        const cur = rect();
        const rounded: SubtitleBlockerRect = {
          x: Math.round(cur.x * 10) / 10,
          y: Math.round(cur.y * 10) / 10,
          width: Math.round(cur.width * 10) / 10,
          height: Math.round(cur.height * 10) / 10,
        };
        rect.set(rounded);
        saveBlockerRect(rounded, videoId());
        dragMode.set(null);
        handleMouseLeave();
      },
      onPanResponderTerminate: () => {
        dragMode.set(null);
        handleMouseLeave();
      },
    });
  };

  const moveHandler = createPanHandler("move");
  const nHandler = createPanHandler("n");
  const sHandler = createPanHandler("s");
  const wHandler = createPanHandler("w");
  const eHandler = createPanHandler("e");
  const nwHandler = createPanHandler("nw");
  const neHandler = createPanHandler("ne");
  const swHandler = createPanHandler("sw");
  const seHandler = createPanHandler("se");

  const isNearTop = () => rect().y < 12;
  const TOOLBAR_WIDTH = 250;
  const getToolbarWidth = () =>
    Math.min(TOOLBAR_WIDTH, (rect().width / 100) * containerSize().width);

  return (
    <If when={props.enabled()}>
      <View
        ref={(node) => {
          containerRef = node;
          updateContainerSize();
        }}
        class="absolute inset-0 z-10"
        style={{
          pointerEvents: "box-none",
          cursor: cursorForDrag(dragMode()) as any,
        }}
        onLayout={(e) => {
          if (e.bounds.size.width > 0 && e.bounds.size.height > 0) {
            containerSize.set({
              width: e.bounds.size.width,
              height: e.bounds.size.height,
            });
          }
        }}
      >
        {/* The Blocker Box Container */}
        <View
          class={`pointer-events-auto absolute items-center justify-center select-none transition-colors ${
            isHovered() || dragMode() !== null
              ? `border-l border-r border-brand/80 ${
                  isNearTop()
                    ? "border-t border-b-0 rounded-t-lg rounded-bl-lg rounded-br-none"
                    : "border-b border-t-0 rounded-b-lg rounded-tl-lg rounded-tr-none"
                }`
              : "border border-transparent rounded-lg"
          }`}
          style={{
            left: `${rect().x}%`,
            top: `${rect().y}%`,
            width: `${rect().width}%`,
            height: `${rect().height}%`,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Visual Background Layer: Real-time dynamic video pixelated mosaic */}
          <If when={shadersAvailable()}>
            <View class="pointer-events-none absolute inset-0 overflow-hidden rounded-lg bg-black/20 backdrop-blur-xl">
              <ShaderEffect
                class="h-full w-full"
                progress={intensity() / 100}
                source={MOSAIC_SHADER}
              >
                <View class="h-full w-full" />
              </ShaderEffect>
            </View>
          </If>
          <If when={!shadersAvailable()}>
            <View class="pointer-events-none absolute inset-0 overflow-hidden rounded-lg bg-black/20 backdrop-blur-xl">
              <Canvas
                class="h-full w-full"
                draw={(cx, size) => {
                  drawMosaicCanvas(cx, size, intensity());
                }}
              />
            </View>
          </If>

          {/* Draggable Surface Layer */}
          <View
            class="pointer-events-auto absolute inset-0 rounded-lg select-none"
            style={{
              cursor: dragMode() === "move" ? "grabbing" : "grab",
            }}
            accessibilityLabel={m().holdToDrag}
            {...moveHandler.panHandlers}
          />

          {/* Controls & Handles: shown on hover or drag */}
          <If when={isHovered() || dragMode() !== null}>
            {/* Center Reference / Placeholder Hint Badge */}
            <View class="pointer-events-none absolute inset-0 items-center justify-center select-none">
              <View
                class={`pointer-events-none flex-row items-center gap-1.5 rounded-full px-3 py-1 select-none backdrop-blur-sm transition-all ${
                  dragMode() === "move"
                    ? "scale-105 border border-brand/90 bg-black/80 text-brand shadow-lg"
                    : "border border-white/20 bg-black/40 text-white/75"
                }`}
              >
                <Icon
                  name="move"
                  size={12}
                  tone={dragMode() === "move" ? "brand" : "faint"}
                />
                <Text
                  class={`font-mono text-[11px] tracking-wide select-none ${
                    dragMode() === "move"
                      ? "font-semibold text-brand"
                      : "text-white/75"
                  }`}
                >
                  {dragMode() === "move"
                    ? `${Math.round(rect().x)}%, ${Math.round(rect().y)}%`
                    : m().holdToDrag}
                </Text>
              </View>
            </View>

            {/* Blocker border segment stopping cleanly at the toolbar junction */}
            <If when={!isNearTop()}>
              <View
                class="pointer-events-none absolute top-0 left-0 rounded-tl-lg border-t border-brand/80"
                style={{ right: getToolbarWidth() }}
              />
            </If>
            <If when={isNearTop()}>
              <View
                class="pointer-events-none absolute bottom-0 left-0 rounded-bl-lg border-b border-brand/80"
                style={{ right: getToolbarWidth() }}
              />
            </If>

            {/* Seamless tab handle toolbar: intensity slider + reset + close */}
            <View
              class={`pointer-events-auto absolute z-40 flex-row items-center justify-between gap-2 px-3 py-1.5 backdrop-blur-md select-none ${
                isNearTop()
                  ? "rounded-b-xl rounded-t-none border-l border-r border-b border-t-0 border-brand/80 bg-black/85"
                  : "rounded-t-xl rounded-b-none border-l border-r border-t border-b-0 border-brand/80 bg-black/85"
              }`}
              style={{
                right: 0,
                width: getToolbarWidth(),
                ...(isNearTop()
                  ? { top: "100%" }
                  : { bottom: "100%" }),
              }}
              onPressDown={(e: any) => {
                e?.stopPropagation?.();
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <MiniSlider
                value={intensity}
                min={10}
                max={100}
                step={5}
                width={72}
                unit="%"
                label={m().blockerIntensity}
                onChange={handleIntensityChange}
              />

              <View class="shrink-0 flex-row items-center gap-1">
                <Button
                  onPress={handleReset}
                  class="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 hover:bg-white/15 active:scale-95"
                  accessibilityLabel={m().resetBlocker}
                >
                  <Icon name="repeat" size={11} tone="faint" />
                </Button>

                <If when={props.onToggleEnabled}>
                  <Button
                    onPress={props.onToggleEnabled}
                    class="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 hover:bg-white/15 active:scale-95"
                    accessibilityLabel={m().toggleSubtitleBlocker}
                  >
                    <Icon name="x" size={11} tone="faint" />
                  </Button>
                </If>
              </View>
            </View>

            {/* Resize Handles (8 directions, clearing the toolbar) */}
            <View
              class="pointer-events-auto group absolute z-20 items-center justify-center"
              style={
                isNearTop()
                  ? { top: -8, left: 24, right: 24, height: 16, cursor: "ns-resize" }
                  : { top: -8, left: 24, right: getToolbarWidth() + 12, height: 16, cursor: "ns-resize" }
              }
              {...nHandler.panHandlers}
            >
              <View class="h-1.5 w-14 rounded-full border border-black/50 bg-brand shadow-md transition-all group-hover:h-2 group-hover:scale-110" />
            </View>

            <View
              class="pointer-events-auto group absolute z-20 items-center justify-center"
              style={
                isNearTop()
                  ? { bottom: -8, left: 24, right: getToolbarWidth() + 12, height: 16, cursor: "ns-resize" }
                  : { bottom: -8, left: 24, right: 24, height: 16, cursor: "ns-resize" }
              }
              {...sHandler.panHandlers}
            >
              <View class="h-1.5 w-14 rounded-full border border-black/50 bg-brand shadow-md transition-all group-hover:h-2 group-hover:scale-110" />
            </View>

            <View
              class="pointer-events-auto group absolute z-20 items-center justify-center"
              style={{ left: -10, top: 12, bottom: 12, width: 20, cursor: "ew-resize" }}
              {...wHandler.panHandlers}
            >
              <View class="h-12 w-1.5 rounded-full border border-black/50 bg-brand shadow-md transition-all group-hover:w-2 group-hover:scale-110" />
            </View>

            <View
              class="pointer-events-auto group absolute z-20 items-center justify-center"
              style={{ right: -10, top: 12, bottom: 12, width: 20, cursor: "ew-resize" }}
              {...eHandler.panHandlers}
            >
              <View class="h-12 w-1.5 rounded-full border border-black/50 bg-brand shadow-md transition-all group-hover:w-2 group-hover:scale-110" />
            </View>

            <View
              class="pointer-events-auto group absolute z-20 items-center justify-center"
              style={{ top: -10, left: -10, width: 22, height: 22, cursor: "nwse-resize" }}
              {...nwHandler.panHandlers}
            >
              <View class="size-3.5 rounded-full border border-black/50 bg-brand shadow-md transition-transform group-hover:scale-125" />
            </View>

            <If when={isNearTop()}>
              <View
                class="pointer-events-auto group absolute z-20 items-center justify-center"
                style={{ top: -10, right: -10, width: 22, height: 22, cursor: "nesw-resize" }}
                {...neHandler.panHandlers}
              >
                <View class="size-3.5 rounded-full border border-black/50 bg-brand shadow-md transition-transform group-hover:scale-125" />
              </View>
            </If>

            <View
              class="pointer-events-auto group absolute z-20 items-center justify-center"
              style={{ bottom: -10, left: -10, width: 22, height: 22, cursor: "nesw-resize" }}
              {...swHandler.panHandlers}
            >
              <View class="size-3.5 rounded-full border border-black/50 bg-brand shadow-md transition-transform group-hover:scale-125" />
            </View>

            <If when={!isNearTop()}>
              <View
                class="pointer-events-auto group absolute z-20 items-center justify-center"
                style={{ bottom: -10, right: -10, width: 22, height: 22, cursor: "nwse-resize" }}
                {...seHandler.panHandlers}
              >
                <View class="size-3.5 rounded-full border border-black/50 bg-brand shadow-md transition-transform group-hover:scale-125" />
              </View>
            </If>
          </If>
        </View>
      </View>
    </If>
  );
}
