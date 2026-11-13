import { expect, test } from "nsh/test";
import {
  earDownload,
  resolveEarChildEnv,
  setEarBinaryCandidates,
  setEarSpawnHook,
  spawnEar,
} from "./earClient";

test("resolveEarChildEnv isolates Dev under <dataDir>/dev and preserves overrides", () => {
  expect(resolveEarChildEnv("/tmp/ear-prod", {})).toEqual({
    EAR_DATA_DIR: "/tmp/ear-prod/dev",
  });

  expect(
    resolveEarChildEnv("/tmp/ear-prod", {
      EAR_DATA_DIR: "/tmp/ear-override",
    }),
  ).toEqual({
    EAR_DATA_DIR: "/tmp/ear-override",
  });

  expect(
    resolveEarChildEnv("/tmp/ear-prod", {
      EAR_ENV: "prod",
    }),
  ).toEqual({
    EAR_DATA_DIR: "/tmp/ear-prod",
  });

  expect(resolveEarChildEnv(undefined, {})).toBeUndefined();
});

test("spawnEar forwards resolved Dev EAR_DATA_DIR to child process", () => {
  let capturedOptions: { env?: Record<string, string> } | undefined;
  setEarSpawnHook((_bin, _args, options) => {
    capturedOptions = options;
    return { on: () => {} };
  });

  try {
    spawnEar("ear", ["download"], "/tmp/ear-prod", {});
    expect(capturedOptions?.env?.EAR_DATA_DIR).toBe("/tmp/ear-prod/dev");

    spawnEar("ear", ["download"], "/tmp/ear-prod", {
      EAR_DATA_DIR: "/tmp/ear-explicit",
    });
    expect(capturedOptions?.env?.EAR_DATA_DIR).toBe("/tmp/ear-explicit");
  } finally {
    setEarSpawnHook(null);
  }
});

test("earDownload invokes spawnEar with download args and returns result", async () => {
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
    });
    expect(capturedBin).toBe("./ear");
    expect(capturedArgs).toContain("download");
    expect(capturedArgs).toContain("abc123");
    expect(res).toEqual({ path: "/tmp/out.mp4", sizeBytes: 1234 });
  } finally {
    setEarSpawnHook(null);
    setEarBinaryCandidates(null);
  }
});
