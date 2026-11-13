import { expect, test } from "nsh/test";
import {
  MAC_HIDDEN_TITLEBAR_HEIGHT,
  MAC_TRAFFIC_LIGHTS_DEFAULT_LEFT,
  resolveMacTitleBarInsets,
} from "./titleBarInsets";

test("resolveMacTitleBarInsets reserves 44pt top and default left on macOS initial frame before titleBar populates", () => {
  const insets = resolveMacTitleBarInsets(
    "macos",
    { height: 0, left: 0, right: 0 },
    null,
  );
  expect(insets).toEqual({
    top: MAC_HIDDEN_TITLEBAR_HEIGHT,
    left: MAC_TRAFFIC_LIGHTS_DEFAULT_LEFT,
  });
});

test("resolveMacTitleBarInsets honors measured AppKit titleBar metrics on macOS", () => {
  const insets = resolveMacTitleBarInsets(
    "macos",
    { height: 44, left: 69, right: 0 },
    { mode: "normal" },
  );
  expect(insets).toEqual({ top: 44, left: 69 });
});

test("resolveMacTitleBarInsets collapses insets in macOS fullScreen mode", () => {
  const insets = resolveMacTitleBarInsets(
    "macos",
    { height: 0, left: 0, right: 0 },
    { mode: "fullScreen" },
  );
  expect(insets).toEqual({ top: 0, left: 0 });
});

test("resolveMacTitleBarInsets returns zero insets on non-macOS platforms", () => {
  expect(
    resolveMacTitleBarInsets("linux", { height: 40, left: 0, right: 90 }, { mode: "normal" }),
  ).toEqual({ top: 0, left: 0 });
  expect(
    resolveMacTitleBarInsets("windows", { height: 40, left: 0, right: 120 }, { mode: "normal" }),
  ).toEqual({ top: 0, left: 0 });
});
