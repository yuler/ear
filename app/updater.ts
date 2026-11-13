import { platform, signal } from "nsh";
import {
  checkForPackage,
  downloadPackage,
  restartToPackage,
  checkForUpdate,
  downloadUpdate,
  installAndRestart,
  runningPackage,
  shellInfo,
  type AppUpdate,
  type PackageUpdate,
  type UpdateProgress,
} from "nsh/updater";
import nshConfig from "./nsh.json";
import { fetchMergedReleaseNotes, type GitHubReleaseItem } from "./updaterNotes";
import { isNativeHost } from "./youtube/host";

export type { AppUpdate, PackageUpdate, UpdateProgress };

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
  | "restarting"
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
  changelogItems?: string[];
  bundleUrl?: string;
  downloadUrl?: string;
  packageUpdate?: PackageUpdate | null;
  appUpdate?: AppUpdate | null;
  error?: string;
}

export const GITHUB_REPO = "yuler/ear";
export const DEFAULT_MANIFEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/latest.json`;
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

export const CURRENT_APP_VERSION = nshConfig.version;
export const CURRENT_APP_BUILD = nshConfig.build ?? 1;

export const globalUpdateAvailable = signal<boolean>(false);
export const globalUpdateResult = signal<UpdateCheckResult | null>(null);
export const globalUpdateModalOpen = signal<boolean>(false);
export const globalUpdateStatus = signal<UpdateStatus>("idle");
export const globalUpdateProgress = signal<number>(0);
export const globalUpdateChecking = signal<boolean>(false);
export const globalUpdateApplying = signal<boolean>(false);
export const globalUpdateError = signal<string | null>(null);

/**
 * Run a global update check (manual or background), enrich merged release notes across
 * intermediate versions, and open the global update modal when a new version is available.
 */
export async function runGlobalUpdateCheck(options?: {
  silent?: boolean;
  checkFn?: () => Promise<UpdateCheckResult>;
  fetchReleasesFn?: () => Promise<GitHubReleaseItem[]>;
}): Promise<UpdateCheckResult | null> {
  if (globalUpdateChecking()) return globalUpdateResult();
  globalUpdateChecking.set(true);
  globalUpdateStatus.set("checking");
  globalUpdateError.set(null);

  try {
    const res = options?.checkFn ? await options.checkFn() : await checkForUpdates();
    if (res.hasUpdate) {
      const items = await fetchMergedReleaseNotes(
        res.currentVersion,
        res.latestVersion,
        res.changelog,
        options?.fetchReleasesFn ? { fetchReleasesFn: options.fetchReleasesFn } : undefined,
      );
      const enriched: UpdateCheckResult = {
        ...res,
        changelogItems: items,
        changelog: items.length > 0 ? items.join("\n") : res.changelog,
      };
      globalUpdateResult.set(enriched);
      globalUpdateAvailable.set(true);
      globalUpdateStatus.set("available");
      globalUpdateModalOpen.set(true);
      return enriched;
    }

    globalUpdateResult.set(res);
    globalUpdateAvailable.set(false);
    if (res.error) {
      globalUpdateStatus.set("error");
      globalUpdateError.set(res.error);
    } else {
      globalUpdateStatus.set("up_to_date");
    }
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!options?.silent) {
      globalUpdateStatus.set("error");
      globalUpdateError.set(msg);
    } else {
      globalUpdateStatus.set("idle");
    }
    return null;
  } finally {
    globalUpdateChecking.set(false);
  }
}

/**
 * Apply the currently discovered global update with progress tracking.
 */
export async function runGlobalApplyUpdate(): Promise<void> {
  const res = globalUpdateResult();
  if (!res || !res.hasUpdate || globalUpdateApplying()) return;
  globalUpdateApplying.set(true);
  globalUpdateStatus.set("downloading");
  globalUpdateProgress.set(0);
  globalUpdateError.set(null);

  try {
    await applyUpdate(res, ({ received, total }) => {
      if (total && total > 0) {
        globalUpdateProgress.set(Math.min(1, received / total));
      }
    });
    globalUpdateStatus.set("restarting");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    globalUpdateStatus.set("error");
    globalUpdateError.set(`更新失败: ${msg}`);
  } finally {
    globalUpdateApplying.set(false);
  }
}

export function dismissGlobalUpdateModal(): void {
  if (globalUpdateApplying() || globalUpdateStatus() === "restarting") return;
  globalUpdateModalOpen.set(false);
}

/**
 * Trigger a background update check silently (opens global modal if update is found).
 */
export async function checkUpdateInBackground(): Promise<void> {
  try {
    await runGlobalUpdateCheck({ silent: true });
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
 * Fetch and parse latest.json release manifest (fallback/compatibility helper).
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
 * Check if an update is available (prefers OTA signed package, then full app update).
 */
export async function checkForUpdates(options?: {
  currentVersion?: string;
  currentBuild?: number;
  manifestUrl?: string;
  fetchFn?: (url: string) => Promise<UpdateManifest>;
  checkPackageFn?: () => Promise<PackageUpdate | null>;
  checkAppFn?: () => Promise<AppUpdate | null>;
}): Promise<UpdateCheckResult> {
  const running = runningPackage();
  const shell = shellInfo();

  const currentVer = options?.currentVersion ?? running?.version ?? shell.version ?? CURRENT_APP_VERSION;
  const currentBld = options?.currentBuild ?? running?.build ?? shell.build ?? CURRENT_APP_BUILD;

  // Skip OTA/release checks in local dev builds ("0.0.0") unless explicitly mocked in tests
  const isMocked = Boolean(options?.fetchFn || options?.checkPackageFn || options?.checkAppFn);
  if (currentVer === "0.0.0" && !isMocked) {
    return {
      hasUpdate: false,
      isIncremental: false,
      currentVersion: currentVer,
      latestVersion: currentVer,
      currentBuild: currentBld,
      latestBuild: currentBld,
      changelog: "",
    };
  }

  // 1. If explicit fetchFn provided (e.g. in legacy unit tests), run compatibility path
  if (options?.fetchFn) {
    try {
      const manifest = await options.fetchFn(options.manifestUrl ?? DEFAULT_MANIFEST_URL);
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

  // 2. Native NSH updater integration
  try {
    // 2.1 First check for OTA signed package update (.nshpkg)
    const packageCheck = options?.checkPackageFn ? await options.checkPackageFn() : await checkForPackage();
    if (packageCheck) {
      return {
        hasUpdate: true,
        isIncremental: true,
        currentVersion: currentVer,
        latestVersion: packageCheck.version,
        currentBuild: currentBld,
        latestBuild: packageCheck.build,
        changelog: packageCheck.notes ?? "",
        packageUpdate: packageCheck,
      };
    }

    // 2.2 If no OTA package, check for full app update
    const appCheck = options?.checkAppFn ? await options.checkAppFn() : await checkForUpdate();
    if (appCheck) {
      return {
        hasUpdate: true,
        isIncremental: false,
        currentVersion: currentVer,
        latestVersion: appCheck.version,
        currentBuild: currentBld,
        latestBuild: currentBld,
        changelog: appCheck.notes ?? "",
        downloadUrl: appCheck.url,
        appUpdate: appCheck,
      };
    }

    return {
      hasUpdate: false,
      isIncremental: false,
      currentVersion: currentVer,
      latestVersion: currentVer,
      currentBuild: currentBld,
      latestBuild: currentBld,
      changelog: "",
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
 * Apply the update: downloads the package/archive and triggers immediate restart.
 */
export async function applyUpdate(
  checkResult: UpdateCheckResult,
  onProgress?: (progress: UpdateProgress) => void,
  hooks?: {
    downloadPackageFn?: (cb?: (p: UpdateProgress) => void) => Promise<void>;
    restartToPackageFn?: () => Promise<void>;
    downloadUpdateFn?: (cb?: (p: UpdateProgress) => void) => Promise<void>;
    installAndRestartFn?: () => Promise<void>;
  },
): Promise<void> {
  if (checkResult.isIncremental) {
    const dlPkg = hooks?.downloadPackageFn ?? downloadPackage;
    const rstPkg = hooks?.restartToPackageFn ?? restartToPackage;
    await dlPkg(onProgress);
    await rstPkg();
    return;
  }

  if (checkResult.appUpdate?.canInstall) {
    const dlUp = hooks?.downloadUpdateFn ?? downloadUpdate;
    const instRst = hooks?.installAndRestartFn ?? installAndRestart;
    await dlUp(onProgress);
    await instRst();
    return;
  }

  if (checkResult.downloadUrl) {
    await openExternalUrl(checkResult.downloadUrl);
  }
}

/**
 * Open external URL in browser using OS default handler.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!url.startsWith("https://") && !url.startsWith("http://")) return false;
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
      const res = await process.run("ear", ["open", url]);
      if (res.code === 0) return true;
    } catch {
      // fallback to explorer
    }

    try {
      const res = await process.run("explorer", [url]);
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
    if (res.code === 0) return true;
  } catch {
    return false;
  }

  return false;
}
