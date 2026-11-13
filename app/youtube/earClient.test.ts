import { expect, test } from "nsh/test";
import {
  earBinaryCandidates,
  earDownload,
  resolveEarLibraryDir,
  setEarBinaryCandidates,
  setEarSpawnHook,
} from "./earClient";

test("resolveEarLibraryDir isolates Dev under <dataDir>/dev/library and preserves overrides", () => {
  expect(resolveEarLibraryDir("/tmp/ear-prod", {})).toBe(
    "/tmp/ear-prod/dev/library",
  );

  expect(
    resolveEarLibraryDir("/tmp/ear-prod", {
      EAR_DATA_DIR: "/tmp/ear-override",
    }),
  ).toBe("/tmp/ear-override/library");

  expect(
    resolveEarLibraryDir("/tmp/ear-prod", {
      EAR_ENV: "prod",
    }),
  ).toBe("/tmp/ear-prod/library");

  expect(resolveEarLibraryDir(undefined, {})).toBe(null);
});

test("earDownload passes --library-dir in argv to isolate CLI writes", async () => {
  let capturedBin = "";
  let capturedArgs: string[] = [];

  setEarBinaryCandidates(["./ear"]);
  setEarSpawnHook((bin, args) => {
    capturedBin = bin;
    capturedArgs = args;
    const handlers: Record<string, (arg: any) => void> = {};
    setTimeout(() => {
      handlers.stdout?.(
        JSON.stringify({
          type: "result",
          path: "/tmp/out.mp4",
          sizeBytes: 1234,
        }),
      );
      handlers.exit?.({ code: 0 });
    }, 0);
    return {
      on(event: string, handler: (arg: any) => void) {
        handlers[event] = handler;
      },
    };
  });

  try {
    const res = await earDownload({
      videoId: "abc123",
      qualityId: "720p",
      outputPath: "/tmp/out.mp4",
      libraryDir: "/tmp/ear-prod/dev/library",
    });
    expect(capturedBin).toBe("./ear");
    expect(capturedArgs).toContain("download");
    expect(capturedArgs).toContain("abc123");
    const libFlagIdx = capturedArgs.indexOf("--library-dir");
    expect(libFlagIdx).toBeGreaterThan(-1);
    expect(capturedArgs[libFlagIdx + 1]).toBe("/tmp/ear-prod/dev/library");
    expect(res).toEqual({ path: "/tmp/out.mp4", sizeBytes: 1234 });
  } finally {
    setEarSpawnHook(null);
    setEarBinaryCandidates(null);
  }
});

test("earDownload preserves Dev argv isolation while stopping on application errors", async () => {
  const calls: string[][] = [];
  setEarBinaryCandidates(["ear-primary", "ear-fallback"]);
  setEarSpawnHook((_bin, args) => {
    calls.push([...args]);
    const handlers: Record<string, (arg: any) => void> = {};
    setTimeout(() => {
      handlers.stdout?.(JSON.stringify({ type: "error", message: "Download rejected" }));
      handlers.exit?.({ code: 1 });
    }, 0);
    return {
      on(event: string, handler: (arg: any) => void) {
        handlers[event] = handler;
      },
    };
  });

  try {
    let error: Error | null = null;
    try {
      await earDownload({
        videoId: "abc123",
        qualityId: "720p",
        outputPath: "/tmp/ear-prod/dev/library/out.mp4",
        libraryDir: resolveEarLibraryDir("/tmp/ear-prod", {}),
      });
    } catch (e) {
      error = e as Error;
    }
    expect(error?.name).toBe("EarApplicationError");
    expect(error?.message).toBe("Download rejected");
    expect(calls.length).toBe(1);
    const args = calls[0]!;
    expect(args.indexOf("--library-dir")).toBeGreaterThan(-1);
    expect(args[args.indexOf("--library-dir") + 1]).toBe("/tmp/ear-prod/dev/library");
  } finally {
    setEarSpawnHook(null);
    setEarBinaryCandidates(null);
  }
});

test("earBinaryCandidates includes macOS app bundle Helpers/ear paths on macos only", () => {
  const macCandidates = earBinaryCandidates("macos", "/Users/alice");
  expect(macCandidates).toContain("ear");
  expect(macCandidates).toContain("/Applications/Ear.app/Contents/Helpers/ear");
  expect(macCandidates).toContain("/Users/alice/Applications/Ear.app/Contents/Helpers/ear");
  expect(macCandidates).toContain("/Users/alice/.local/bin/ear");
  expect(macCandidates.indexOf("ear")).toBeLessThan(
    macCandidates.indexOf("/Applications/Ear.app/Contents/Helpers/ear"),
  );

  const linuxCandidates = earBinaryCandidates("linux", "/home/alice");
  expect(linuxCandidates).toContain("ear");
  expect(linuxCandidates).toContain("/home/alice/.local/bin/ear");
  expect(linuxCandidates).not.toContain("/Applications/Ear.app/Contents/Helpers/ear");
});
