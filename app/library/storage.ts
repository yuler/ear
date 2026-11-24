import { homedir } from "os";
import { earStorage, type DiskSpaceInfo } from "../youtube/earClient";

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

/** Query available & total bytes on the disk volume containing `dirPath`. */
export async function queryDiskSpace(
  dirPath: string,
): Promise<DiskSpaceInfo | null> {
  if (!dirPath.trim()) return null;
  try {
    return await earStorage(dirPath);
  } catch {
    return null;
  }
}
