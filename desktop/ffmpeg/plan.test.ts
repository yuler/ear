import { expect, test } from "nsh/test";
import {
  appleScriptTerminalCommand,
  ffmpegBannerVisible,
  ffmpegInstallPlan,
  isFfmpegMissingError,
  parseFfmpegReport,
  windowsTerminalLaunch,
} from "./plan";

test("parseFfmpegReport reads the doctor json dependency", () => {
  const report = parseFfmpegReport({
    dependencies: {
      ffmpeg: {
        ok: false,
        path: null,
        installCommand: "brew install ffmpeg",
      },
    },
  });
  expect(report).toEqual({
    ok: false,
    path: null,
    installCommand: "brew install ffmpeg",
  });
});

test("install plan runs brew on macos when Homebrew exists", () => {
  expect(
    ffmpegInstallPlan({
      os: "macos",
      brewAvailable: true,
      wingetAvailable: false,
      installCommand: "brew install ffmpeg",
    }),
  ).toEqual({ kind: "run", command: "brew install ffmpeg" });
});

test("install plan copies the brew command when Homebrew is missing", () => {
  expect(
    ffmpegInstallPlan({
      os: "macos",
      brewAvailable: false,
      wingetAvailable: false,
      installCommand: "brew install ffmpeg",
    }),
  ).toEqual({
    kind: "copy",
    command: "brew install ffmpeg",
    needsHomebrew: true,
  });
});

test("install plan copies the distro command on linux", () => {
  expect(
    ffmpegInstallPlan({
      os: "linux",
      brewAvailable: false,
      wingetAvailable: false,
      installCommand: "sudo pacman -S ffmpeg",
    }),
  ).toEqual({
    kind: "copy",
    command: "sudo pacman -S ffmpeg",
    needsHomebrew: false,
  });
});

test("install plan runs winget on windows when winget exists", () => {
  expect(
    ffmpegInstallPlan({
      os: "windows",
      brewAvailable: false,
      wingetAvailable: true,
      installCommand: "winget install -e --id Gyan.FFmpeg",
    }),
  ).toEqual({
    kind: "run",
    command: "winget install -e --id Gyan.FFmpeg",
  });
});

test("install plan copies the winget command when winget is missing", () => {
  expect(
    ffmpegInstallPlan({
      os: "windows",
      brewAvailable: false,
      wingetAvailable: false,
      installCommand: "winget install -e --id Gyan.FFmpeg",
    }),
  ).toEqual({
    kind: "copy",
    command: "winget install -e --id Gyan.FFmpeg",
    needsHomebrew: false,
  });
});

test("banner stays up at merge time even after dismiss, and hides once ffmpeg is found", () => {
  expect(ffmpegBannerVisible({ missing: true, dismissed: false, mergeBlocked: false })).toBe(
    true,
  );
  expect(ffmpegBannerVisible({ missing: true, dismissed: true, mergeBlocked: false })).toBe(
    false,
  );
  expect(ffmpegBannerVisible({ missing: true, dismissed: true, mergeBlocked: true })).toBe(
    true,
  );
  expect(ffmpegBannerVisible({ missing: false, dismissed: false, mergeBlocked: true })).toBe(
    false,
  );
});

test("only a missing ffmpeg error reopens the install prompt", () => {
  expect(isFfmpegMissingError("ffmpeg not found")).toBe(true);
  expect(isFfmpegMissingError("ffmpeg failed to mux video and audio")).toBe(false);
});

test("terminal launch quotes the install command", () => {
  expect(appleScriptTerminalCommand("brew install ffmpeg")).toBe(
    'tell application "Terminal" to do script "brew install ffmpeg"',
  );
  expect(windowsTerminalLaunch("winget install -e --id Gyan.FFmpeg")).toEqual({
    bin: "cmd.exe",
    args: ["/c", "start", "Ear", "cmd", "/k", "winget install -e --id Gyan.FFmpeg"],
  });
});
