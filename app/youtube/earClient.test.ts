import { expect, test } from "nsh/test";
import {
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
