export type FfmpegReport = {
  ok: boolean;
  path: string | null;
  installCommand: string;
};

export type FfmpegInstallPlan =
  | { kind: "run"; command: string }
  | { kind: "copy"; command: string; needsHomebrew: boolean };

export function parseFfmpegReport(value: unknown): FfmpegReport | null {
  if (!value || typeof value !== "object") return null;
  const deps = (value as { dependencies?: { ffmpeg?: unknown } }).dependencies?.ffmpeg;
  if (!deps || typeof deps !== "object") return null;
  const ffmpeg = deps as {
    ok?: unknown;
    path?: unknown;
    installCommand?: unknown;
  };
  return {
    ok: ffmpeg.ok === true,
    path: typeof ffmpeg.path === "string" ? ffmpeg.path : null,
    installCommand: typeof ffmpeg.installCommand === "string" ? ffmpeg.installCommand : "",
  };
}

export function ffmpegInstallPlan(input: {
  os: string;
  brewAvailable: boolean;
  wingetAvailable: boolean;
  installCommand: string;
}): FfmpegInstallPlan {
  if (input.os === "macos" && input.brewAvailable) {
    return { kind: "run", command: input.installCommand };
  }
  if (input.os === "macos") {
    return { kind: "copy", command: input.installCommand, needsHomebrew: true };
  }
  if (input.os === "windows" && input.wingetAvailable) {
    return { kind: "run", command: input.installCommand };
  }
  return { kind: "copy", command: input.installCommand, needsHomebrew: false };
}

export function ffmpegBannerVisible(input: {
  missing: boolean;
  dismissed: boolean;
  mergeBlocked: boolean;
}): boolean {
  if (!input.missing) return false;
  if (input.mergeBlocked) return true;
  return !input.dismissed;
}

export function isFfmpegMissingError(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.toLowerCase().includes("ffmpeg not found");
}

export function appleScriptTerminalCommand(shellCommand: string): string {
  const escaped = shellCommand.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `tell application "Terminal" to do script "${escaped}"`;
}

export function windowsTerminalLaunch(shellCommand: string): { bin: string; args: string[] } {
  return {
    bin: "cmd.exe",
    args: ["/c", "start", "Ear", "cmd", "/k", shellCommand],
  };
}
