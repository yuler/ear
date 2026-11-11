import { expect, test } from "nsh/test";
import {
  checkForUpdates,
  compareSemVer,
  isRunnerCompatible,
  parseSemVer,
  resolvePlatformKey,
  type UpdateManifest,
} from "./updater";

test("parseSemVer parses major, minor, patch and strips v prefix", () => {
  expect(parseSemVer("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  expect(parseSemVer("2.0.4-beta.1")).toEqual({ major: 2, minor: 0, patch: 4 });
  expect(parseSemVer("invalid")).toEqual({ major: 0, minor: 0, patch: 0 });
});

test("compareSemVer correctly orders versions", () => {
  expect(compareSemVer("1.0.1", "1.0.0")).toBe(1);
  expect(compareSemVer("1.0.0", "1.0.1")).toBe(-1);
  expect(compareSemVer("v1.2.0", "1.2.0")).toBe(0);
  expect(compareSemVer("2.0.0", "1.9.9")).toBe(1);
  expect(compareSemVer("1.10.0", "1.9.0")).toBe(1);
});

test("isRunnerCompatible verifies against minRunnerVersion", () => {
  expect(isRunnerCompatible("1.0.0")).toBe(true);
  expect(isRunnerCompatible("1.2.0", "1.0.0")).toBe(true);
  expect(isRunnerCompatible("1.0.0", "1.0.0")).toBe(true);
  expect(isRunnerCompatible("0.9.0", "1.0.0")).toBe(false);
});

test("resolvePlatformKey maps to expected identifier", () => {
  const key = resolvePlatformKey();
  expect(["linux-x86_64", "darwin-arm64", "windows-x86_64"]).toContain(key);
});

test("checkForUpdates detects incremental update when runner is compatible", async () => {
  const mockManifest: UpdateManifest = {
    version: "1.1.0",
    build: 2,
    minRunnerVersion: "1.0.0",
    changelog: "New features and fixes",
    bundleUrl: "https://example.com/bundle.nshc",
    platforms: {
      "linux-x86_64": { fileName: "Ear-linux.tar.gz", url: "https://example.com/linux.tar.gz" },
    },
  };

  const res = await checkForUpdates({
    currentVersion: "1.0.0",
    currentBuild: 1,
    fetchFn: async () => mockManifest,
  });

  expect(res.hasUpdate).toBe(true);
  expect(res.isIncremental).toBe(true);
  expect(res.latestVersion).toBe("1.1.0");
  expect(res.bundleUrl).toBe("https://example.com/bundle.nshc");
  expect(res.changelog).toBe("New features and fixes");
});

test("checkForUpdates requires full package when runner is incompatible", async () => {
  const mockManifest: UpdateManifest = {
    version: "2.0.0",
    build: 10,
    minRunnerVersion: "2.0.0",
    changelog: "Major engine upgrade",
    bundleUrl: "https://example.com/bundle.nshc",
    platforms: {
      "linux-x86_64": { fileName: "Ear-linux.tar.gz", url: "https://example.com/linux.tar.gz" },
    },
  };

  const res = await checkForUpdates({
    currentVersion: "1.0.0",
    currentBuild: 1,
    fetchFn: async () => mockManifest,
  });

  expect(res.hasUpdate).toBe(true);
  expect(res.isIncremental).toBe(false);
  expect(res.latestVersion).toBe("2.0.0");
});

test("checkForUpdates reports no update when version is current", async () => {
  const mockManifest: UpdateManifest = {
    version: "1.0.0",
    build: 1,
    changelog: "Current version",
  };

  const res = await checkForUpdates({
    currentVersion: "1.0.0",
    currentBuild: 1,
    fetchFn: async () => mockManifest,
  });

  expect(res.hasUpdate).toBe(false);
  expect(res.isIncremental).toBe(false);
});

test("checkForUpdates handles fetch failure gracefully", async () => {
  const res = await checkForUpdates({
    currentVersion: "1.0.0",
    currentBuild: 1,
    fetchFn: async () => {
      throw new Error("Network unreachable");
    },
  });

  expect(res.hasUpdate).toBe(false);
  expect(res.error).toContain("Network unreachable");
});
