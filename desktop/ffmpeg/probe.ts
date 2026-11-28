import { exists } from "fs/promises";
import process from "process";
import { earBinaryCandidates } from "../youtube/earClient";
import { isNativeHost } from "../youtube/host";
import {
  appleScriptTerminalCommand,
  parseFfmpegReport,
  windowsTerminalLaunch,
  type FfmpegReport,
} from "./plan";

async function fileExists(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

function reportFromStdout(stdout: string | undefined): FfmpegReport | null {
  if (!stdout) return null;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const report = parseFfmpegReport(JSON.parse(trimmed));
      if (report) return report;
    } catch {
      // keep scanning
    }
  }
  return null;
}

export async function probeFfmpeg(): Promise<FfmpegReport | null> {
  if (!isNativeHost() || typeof process.run !== "function") return null;
  for (const bin of earBinaryCandidates()) {
    try {
      const res = await process.run(bin, ["doctor", "--json"], { timeoutMs: 15_000 });
      const report = reportFromStdout(res.stdout);
      if (report) return report;
    } catch {
      // try the next ear binary
    }
  }
  return null;
}

export async function brewIsAvailable(): Promise<boolean> {
  if (await fileExists("/opt/homebrew/bin/brew")) return true;
  if (await fileExists("/usr/local/bin/brew")) return true;
  if (!isNativeHost() || typeof process.run !== "function") return false;
  try {
    const res = await process.run("which", ["brew"], { timeoutMs: 3_000 });
    return res.code === 0 && Boolean(res.stdout?.trim());
  } catch {
    return false;
  }
}

export async function wingetIsAvailable(): Promise<boolean> {
  if (!isNativeHost() || typeof process.run !== "function") return false;
  try {
    const res = await process.run("where", ["winget"], { timeoutMs: 3_000 });
    return res.code === 0 && Boolean(res.stdout?.trim());
  } catch {
    return false;
  }
}

/** Opens Terminal / cmd and runs the install command. False when the launch fails. */
export async function launchInstall(os: string, command: string): Promise<boolean> {
  if (!isNativeHost() || typeof process.run !== "function") return false;
  try {
    if (os === "macos") {
      const res = await process.run(
        "osascript",
        ["-e", appleScriptTerminalCommand(command)],
        { timeoutMs: 15_000 },
      );
      return res.code === 0;
    }
    if (os === "windows") {
      const launch = windowsTerminalLaunch(command);
      const res = await process.run(launch.bin, launch.args, { timeoutMs: 15_000 });
      return res.code === 0;
    }
  } catch {
    return false;
  }
  return false;
}
