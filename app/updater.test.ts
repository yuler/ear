import { expect, test } from "nsh/test";
import {
  applyUpdate,
  checkForUpdates,
  compareSemVer,
  isRunnerCompatible,
  parseSemVer,
  resolvePlatformKey,
  type AppUpdate,
  type PackageUpdate,
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

test("checkForUpdates detects OTA package update via checkPackageFn", async () => {
  const mockPkg: PackageUpdate = {
    version: "0.2.0",
    build: 5,
    notes: "OTA instant bytecode update",
    size: 204800,
  };

  const res = await checkForUpdates({
    currentVersion: "0.1.0",
    currentBuild: 1,
    checkPackageFn: async () => mockPkg,
  });

  expect(res.hasUpdate).toBe(true);
  expect(res.isIncremental).toBe(true);
  expect(res.latestVersion).toBe("0.2.0");
  expect(res.latestBuild).toBe(5);
  expect(res.changelog).toBe("OTA instant bytecode update");
  expect(res.packageUpdate).toEqual(mockPkg);
});

test("checkForUpdates falls back to full app update when no package is found", async () => {
  const mockApp: AppUpdate = {
    version: "1.0.0",
    notes: "Full runtime package upgrade",
    url: "https://example.com/Ear-1.0.0.tar.gz",
    canInstall: true,
  };

  const res = await checkForUpdates({
    currentVersion: "0.1.0",
    currentBuild: 1,
    checkPackageFn: async () => null,
    checkAppFn: async () => mockApp,
  });

  expect(res.hasUpdate).toBe(true);
  expect(res.isIncremental).toBe(false);
  expect(res.latestVersion).toBe("1.0.0");
  expect(res.downloadUrl).toBe("https://example.com/Ear-1.0.0.tar.gz");
  expect(res.appUpdate).toEqual(mockApp);
});

test("applyUpdate triggers downloadPackage and restartToPackage for incremental updates", async () => {
  let downloaded = false;
  let restarted = false;

  const checkResult = {
    hasUpdate: true,
    isIncremental: true,
    currentVersion: "0.1.0",
    latestVersion: "0.2.0",
    currentBuild: 1,
    latestBuild: 2,
    changelog: "test",
  };

  await applyUpdate(checkResult, undefined, {
    downloadPackageFn: async () => {
      downloaded = true;
    },
    restartToPackageFn: async () => {
      restarted = true;
    },
  });

  expect(downloaded).toBe(true);
  expect(restarted).toBe(true);
});

test("applyUpdate triggers downloadUpdate and installAndRestart for full app updates", async () => {
  let downloaded = false;
  let installed = false;

  const checkResult = {
    hasUpdate: true,
    isIncremental: false,
    currentVersion: "0.1.0",
    latestVersion: "1.0.0",
    currentBuild: 1,
    latestBuild: 1,
    changelog: "test",
    appUpdate: {
      version: "1.0.0",
      url: "https://example.com/archive.tar.gz",
      canInstall: true,
    },
  };

  await applyUpdate(checkResult, undefined, {
    downloadUpdateFn: async () => {
      downloaded = true;
    },
    installAndRestartFn: async () => {
      installed = true;
    },
  });

  expect(downloaded).toBe(true);
  expect(installed).toBe(true);
});
