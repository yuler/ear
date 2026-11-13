import process from "process";
import nshConfig from "./nsh.json";

export type EnvMap = Record<string, string | undefined>;

/**
 * Returns true when running in local development mode.
 *
 * Production CI builds inject the release semver into `app/nsh.json`,
 * whereas local development keeps `"0.0.0"`. `EAR_ENV` can override this
 * explicitly (`"dev"` or `"prod"`).
 */
export function isDevMode(env: EnvMap = process.env ?? {}): boolean {
  const override = env.EAR_ENV?.trim().toLowerCase();
  if (override === "dev") return true;
  if (override === "prod") return false;
  return (nshConfig.version ?? "0.0.0") === "0.0.0";
}

/**
 * Resolves the effective app data directory.
 *
 * - Honors `EAR_DATA_DIR` when explicitly provided (e.g. to mount Production data in Dev).
 * - In Dev mode, isolates data under `<dataDir>/dev` so it never mutates Production library data.
 * - Throws if `process.dataDir` is unavailable (non-native host).
 */
export function resolveDataDir(
  baseDataDir?: string,
  env: EnvMap = process.env ?? {},
): string {
  const override = env.EAR_DATA_DIR?.trim();
  if (override) return override;

  const dataDir = baseDataDir ?? process.dataDir;
  if (!dataDir) {
    throw new Error("No app dataDir — library needs a native host");
  }
  return isDevMode(env) ? `${dataDir}/dev` : dataDir;
}

/** Non-throwing variant of `resolveDataDir()` for optional media path lookups. */
export function resolveDataDirOrNull(
  baseDataDir?: string,
  env: EnvMap = process.env ?? {},
): string | null {
  try {
    return resolveDataDir(baseDataDir, env);
  } catch {
    return null;
  }
}
