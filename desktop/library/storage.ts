import { homedir } from "os";
import process from "process";
import { earStorage, type DiskSpaceInfo } from "../youtube/earClient";
import { isNativeHost } from "../youtube/host";

export type { DiskSpaceInfo };

/** Shorten the user's home prefix to `~` for compact display. */
export function displayDownloadPath(
  fullPath: string,
  home: string = safeHomedir(),
): string {
  const trimmed = fullPath.trim();
  if (!trimmed) return "";
  const normHome = home.replace(/[\\/]+$/, "");
  if (!normHome) return trimmed;
  if (trimmed === normHome) return "~";
  if (trimmed.startsWith(`${normHome}/`) || trimmed.startsWith(`${normHome}\\`)) {
    return `~${trimmed.slice(normHome.length)}`;
  }
  return trimmed;
}

function safeHomedir(): string {
  try {
    return homedir();
  } catch {
    return "";
  }
}

/** Format volume capacity bytes into clean TB / GB / MB labels. */
export function formatDiskSize(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  const tb = 1024 ** 4;
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (bytes >= tb) {
    const val = bytes / tb;
    return `${val >= 10 ? val.toFixed(1) : val.toFixed(2)} TB`;
  }
  if (bytes >= gb) {
    const val = bytes / gb;
    return `${val >= 100 ? Math.round(val) : val.toFixed(1)} GB`;
  }
  if (bytes >= mb) {
    return `${Math.round(bytes / mb)} MB`;
  }
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

/**
 * Parse POSIX `df -Pk <path>` output into available & total bytes.
 * Anchors on the percentage (`NN%`) column so filesystem names or mount points
 * containing spaces still parse cleanly.
 */
export function parseDfPkOutput(
  stdout: string,
  dirPath: string,
): DiskSpaceInfo | null {
  const lines = stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
  const dataLine = lines[0];
  if (!dataLine) return null;
  const tokens = dataLine.split(/\s+/);
  for (let i = 3; i < tokens.length; i++) {
    if (/^\d+%$/.test(tokens[i]!)) {
      const availKb = Number(tokens[i - 1]);
      const totalKb = Number(tokens[i - 3]);
      if (Number.isFinite(availKb) && Number.isFinite(totalKb) && totalKb > 0) {
        return {
          path: dirPath,
          availableBytes: availKb * 1024,
          totalBytes: totalKb * 1024,
        };
      }
      return null;
    }
  }
  return null;
}

async function queryDiskSpaceWithDf(dirPath: string): Promise<DiskSpaceInfo | null> {
  if (!isNativeHost() || typeof process.run !== "function") return null;
  if (process.platform === "windows") return null;

  const candidates = [dirPath];
  const home = safeHomedir();
  if (home && home !== dirPath) candidates.push(home);

  for (const target of candidates) {
    try {
      const res = await process.run("df", ["-Pk", "--", target], { timeoutMs: 5000 });
      if (res.code === 0 && res.stdout) {
        const parsed = parseDfPkOutput(res.stdout, dirPath);
        if (parsed) return parsed;
      }
    } catch {
      // try next fallback target
    }
  }
  return null;
}

/** Query available & total bytes on the disk volume containing `dirPath`. */
export async function queryDiskSpace(
  dirPath: string,
): Promise<DiskSpaceInfo | null> {
  const trimmed = dirPath.trim();
  if (!trimmed) return null;
  try {
    const viaCli = await earStorage(trimmed);
    if (viaCli) return viaCli;
  } catch {
    // fall through to POSIX df fallback
  }
  return queryDiskSpaceWithDf(trimmed);
}
