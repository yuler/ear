import { platform, signal } from "nsh";
import nshConfig from "./nsh.json";
import { isNativeHost } from "./youtube/host";

export interface PlatformAsset {
  fileName: string;
  url: string;
  sha256?: string;
  size?: number;
}

export interface UpdateManifest {
  version: string;
  build: number;
  minRunnerVersion?: string;
  releaseDate?: string;
  changelog?: string;
  bundleUrl?: string;
  bundleSha256?: string;
  platforms?: Record<string, PlatformAsset>;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up_to_date"
  | "downloading"
  | "ready"
  | "error";

export interface UpdateCheckResult {
  hasUpdate: boolean;
  isIncremental: boolean;
  currentVersion: string;
  latestVersion: string;
  currentBuild: number;
  latestBuild: number;
  changelog: string;
  bundleUrl?: string;
  downloadUrl?: string;
  error?: string;
}

export const GITHUB_REPO = "yuler/ear";
export const DEFAULT_MANIFEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/latest.json`;
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

export const CURRENT_APP_VERSION = nshConfig.version;
export const CURRENT_APP_BUILD = nshConfig.build ?? 1;

export const globalUpdateAvailable = signal<boolean>(false);
export const globalUpdateResult = signal<UpdateCheckResult | null>(null);

/**
 * Trigger a background update check silently.
 */
export async function checkUpdateInBackground(): Promise<void> {
  try {
    const res = await checkForUpdates();
    globalUpdateResult.set(res);
    if (res.hasUpdate) {
      globalUpdateAvailable.set(true);
    }
  } catch {
    // silent in background
  }
}

/**
 * Parse a semver string (e.g. "v1.2.3", "1.2.0-beta.1") into numeric components.
 */
export function parseSemVer(v: string): { major: number; minor: number; patch: number } {
  const cleaned = v.trim().replace(/^v/, "");
  const core = cleaned.split("-")[0];
  const parts = core.split(".").map((p) => parseInt(p, 10) || 0);
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
  };
}

/**
 * Compare two semver strings.
 * Returns:
 *   1 if a > b
 *  -1 if a < b
 *   0 if a == b
 */
export function compareSemVer(a: string, b: string): number {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

/**
 * Check if the current native runner version satisfies the required minimum runner version.
 */
export function isRunnerCompatible(currentRunner: string, minRunner?: string): boolean {
  if (!minRunner) return true;
  return compareSemVer(currentRunner, minRunner) >= 0;
}

/**
 * Resolve the platform asset key based on the current OS.
 */
export function resolvePlatformKey(): string {
  if (platform.os === "macos") {
    return "darwin-arm64";
  }
  if (platform.os === "windows") {
    return "windows-x86_64";
  }
  return "linux-x86_64";
}

/**
 * Fetch and parse latest.json release manifest.
 */
export async function fetchUpdateManifest(
  manifestUrl: string = DEFAULT_MANIFEST_URL,
): Promise<UpdateManifest> {
  const res = await fetch(manifestUrl, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch update manifest: HTTP ${res.status}`);
  }
  const data = (await res.json()) as UpdateManifest;
  return data;
}

/**
 * Check if an update is available compared to the current version.
 */
export async function checkForUpdates(options?: {
  currentVersion?: string;
  currentBuild?: number;
  manifestUrl?: string;
  fetchFn?: (url: string) => Promise<UpdateManifest>;
}): Promise<UpdateCheckResult> {
  const currentVer = options?.currentVersion ?? CURRENT_APP_VERSION;
  const currentBld = options?.currentBuild ?? CURRENT_APP_BUILD;
  const manifestUrl = options?.manifestUrl ?? DEFAULT_MANIFEST_URL;
  const fetcher = options?.fetchFn ?? fetchUpdateManifest;

  try {
    const manifest = await fetcher(manifestUrl);
    const verCompare = compareSemVer(manifest.version, currentVer);
    const hasNewerVersion = verCompare > 0 || (verCompare === 0 && manifest.build > currentBld);

    if (!hasNewerVersion) {
      return {
        hasUpdate: false,
        isIncremental: false,
        currentVersion: currentVer,
        latestVersion: manifest.version,
        currentBuild: currentBld,
        latestBuild: manifest.build,
        changelog: manifest.changelog ?? "",
      };
    }

    const runnerCompatible = isRunnerCompatible(currentVer, manifest.minRunnerVersion);
    const isIncremental = runnerCompatible && Boolean(manifest.bundleUrl);

    const platformKey = resolvePlatformKey();
    const platformAsset = manifest.platforms?.[platformKey];
    const downloadUrl = platformAsset?.url ?? RELEASES_PAGE_URL;

    return {
      hasUpdate: true,
      isIncremental,
      currentVersion: currentVer,
      latestVersion: manifest.version,
      currentBuild: currentBld,
      latestBuild: manifest.build,
      changelog: manifest.changelog ?? "",
      bundleUrl: manifest.bundleUrl,
      downloadUrl,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      hasUpdate: false,
      isIncremental: false,
      currentVersion: currentVer,
      latestVersion: currentVer,
      currentBuild: currentBld,
      latestBuild: currentBld,
      changelog: "",
      error: errMsg,
    };
  }
}

/**
 * Open external URL in browser using OS default handler.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!isNativeHost() || typeof process.run !== "function") return false;

  if (process.platform === "macos") {
    try {
      const res = await process.run("open", [url]);
      return res.code === 0;
    } catch {
      return false;
    }
  }

  if (process.platform === "windows") {
    try {
      const res = await process.run("cmd", ["/c", "start", "", url]);
      return res.code === 0;
    } catch {
      return false;
    }
  }

  try {
    const res = await process.run("xdg-open", [url]);
    if (res.code === 0) return true;
  } catch {
    // try gio
  }

  try {
    const res = await process.run("gio", ["open", url]);
    return res.code === 0;
  } catch {
    return false;
  }
}
