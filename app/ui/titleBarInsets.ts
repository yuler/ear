import { platform } from "nsh";
import { titleBar, windowState, type TitleBarArea, type WindowState } from "nsh/desktop";

export const MAC_HIDDEN_TITLEBAR_HEIGHT = 44;
export const MAC_TRAFFIC_LIGHTS_DEFAULT_LEFT = 70;

export type MacTitleBarInsets = {
  top: number;
  left: number;
};

/**
 * Computes safe-area insets for macOS hidden title bar traffic lights.
 * Falls back to the configured 44pt bar height on initial mount before AppKit
 * finishes populating `titleBar()`, and collapses to 0 in fullscreen or off macOS.
 */
export function resolveMacTitleBarInsets(
  os: string,
  area: TitleBarArea,
  state: Pick<WindowState, "mode"> | null,
): MacTitleBarInsets {
  if (os !== "macos") return { top: 0, left: 0 };
  if (state?.mode === "fullScreen") return { top: 0, left: 0 };
  return {
    top: Math.max(area.height, MAC_HIDDEN_TITLEBAR_HEIGHT),
    left: area.left > 0 ? area.left : MAC_TRAFFIC_LIGHTS_DEFAULT_LEFT,
  };
}

/** Reactive helper reading the current window's macOS traffic-light safe-area insets. */
export function macTitleBarInsets(): MacTitleBarInsets {
  if (platform.os !== "macos") return { top: 0, left: 0 };
  try {
    return resolveMacTitleBarInsets(platform.os, titleBar(), windowState());
  } catch {
    return { top: MAC_HIDDEN_TITLEBAR_HEIGHT, left: MAC_TRAFFIC_LIGHTS_DEFAULT_LEFT };
  }
}
