import { expect, test } from "nsh/test";
import {
  DEFAULT_GSTREAMER_COMMAND,
  GSTREAMER_DISTRO_HINTS,
  isGStreamerPluginError,
  MediaErrorNotice,
} from "./MediaErrorNotice";

test("isGStreamerPluginError detects GStreamer codec error variants", () => {
  // Issue #7 primary error message
  const msg1 =
    "您的 GStreamer 安装缺少插件。No installed GStreamer plug-in can play this format (H.264 / AAC need gst-libav or gst-plugins-ugly / -bad).";
  expect(isGStreamerPluginError(msg1)).toBe(true);

  // Issue #7 comment: missing quicktime demuxer
  const msg2 =
    "Missing decoder: Quicktime (video/quicktime, variant=(string)iso)";
  expect(isGStreamerPluginError(msg2)).toBe(true);

  // General GStreamer keywords
  expect(isGStreamerPluginError("gst-plugins-good is required")).toBe(true);
  expect(isGStreamerPluginError("Could not find qtdemux")).toBe(true);
  expect(isGStreamerPluginError("No decoder available for H.264")).toBe(true);
  expect(isGStreamerPluginError("Missing decoder for AAC")).toBe(true);
  expect(isGStreamerPluginError("系统缺少插件，无法播放视频")).toBe(true);

  // Non-GStreamer errors
  expect(isGStreamerPluginError("Network timeout: 504")).toBe(false);
  expect(isGStreamerPluginError("File not found: /tmp/missing.mp4")).toBe(false);
  expect(isGStreamerPluginError(null)).toBe(false);
  expect(isGStreamerPluginError(undefined)).toBe(false);
  expect(isGStreamerPluginError("")).toBe(false);
});

test("GStreamer command presets cover major Linux distributions", () => {
  expect(DEFAULT_GSTREAMER_COMMAND).toContain("pacman -S");
  expect(DEFAULT_GSTREAMER_COMMAND).toContain("gst-plugins-good");
  expect(DEFAULT_GSTREAMER_COMMAND).toContain("gst-libav");

  expect(GSTREAMER_DISTRO_HINTS.length).toBeGreaterThanOrEqual(3);

  const archHint = GSTREAMER_DISTRO_HINTS.find((h) => h.distro.includes("Arch"));
  expect(archHint).toBeDefined();
  expect(archHint?.cmd).toContain("pacman -S");

  const debianHint = GSTREAMER_DISTRO_HINTS.find((h) =>
    h.distro.includes("Ubuntu"),
  );
  expect(debianHint).toBeDefined();
  expect(debianHint?.cmd).toContain("apt install");

  const fedoraHint = GSTREAMER_DISTRO_HINTS.find((h) =>
    h.distro.includes("Fedora"),
  );
  expect(fedoraHint).toBeDefined();
  expect(fedoraHint?.cmd).toContain("dnf install");
});

test("MediaErrorNotice exports valid component function", () => {
  expect(typeof MediaErrorNotice).toBe("function");
});
