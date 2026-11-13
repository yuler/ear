import process from "process";
import { resolveDataDirOrNull, type EnvMap } from "../env";
import { isNativeHost } from "./host";
import type { CaptionCue, ParsedVideo } from "./types";

export type ParseProgressEvent = {
  stage: string;
  progress: number;
  message?: string;
};

export type DownloadProgressEvent = {
  stage: string;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
  sizeBytes?: number;
};

export type EarDownloadParams = {
  videoId: string;
  qualityId: string;
  outputPath: string;
  videoUrl?: string | null;
  audioUrl?: string | null;
  signal?: AbortSignal;
  onProgress?: (ev: DownloadProgressEvent) => void;
};

export type SpawnChildLike = {
  on(event: string, handler: (arg: any) => void): any;
};

export type SpawnHook = (
  bin: string,
  args: string[],
  options?: { env?: Record<string, string> },
) => SpawnChildLike;

let currentSpawnHook: SpawnHook | null = null;

export function setEarSpawnHook(hook: SpawnHook | null): void {
  currentSpawnHook = hook;
}

let candidatesOverride: string[] | null = null;

export function setEarBinaryCandidates(candidates: string[] | null): void {
  candidatesOverride = candidates;
}

export function earBinaryCandidates(): string[] {
  if (candidatesOverride) return candidatesOverride;
  const list = [
    "./ear",
    "./ear.exe",
    "cli/target/debug/ear",
    "cli/target/release/ear",
    "../cli/target/debug/ear",
    "../cli/target/release/ear",
    "ear",
  ];
  try {
    if (typeof process !== "undefined" && process?.env?.HOME) {
      list.push(`${process.env.HOME}/.local/bin/ear`);
    }
  } catch {
    // ignore
  }
  return list;
}

/**
 * Resolves child environment overrides so `ear` CLI writes to the same
 * data directory as the host app (isolating Dev under `<dataDir>/dev`
 * while preserving explicit `EAR_DATA_DIR` overrides).
 */
export function resolveEarChildEnv(
  baseDataDir?: string,
  env: EnvMap = process.env ?? {},
): Record<string, string> | undefined {
  const dataDir = resolveDataDirOrNull(baseDataDir, env);
  if (!dataDir) return undefined;
  return { EAR_DATA_DIR: dataDir };
}

export function spawnEar(
  bin: string,
  args: string[],
  baseDataDir?: string,
  env?: EnvMap,
): SpawnChildLike | null {
  const childEnv = resolveEarChildEnv(baseDataDir, env);
  const spawnOpts = childEnv ? { env: childEnv } : undefined;
  if (currentSpawnHook) {
    return currentSpawnHook(bin, args, spawnOpts);
  }
  try {
    if (isNativeHost() && typeof process.spawn === "function") {
      return process.spawn(bin, args, {
        lines: true,
        timeoutMs: 600_000,
        ...(spawnOpts ?? {}),
      }) as unknown as SpawnChildLike;
    }
  } catch {
    return null;
  }
  return null;
}

export async function earParse(
  input: string,
  onProgress?: (ev: ParseProgressEvent) => void,
): Promise<ParsedVideo> {
  const bins = earBinaryCandidates();
  let lastErr = "ear binary not available";

  for (const bin of bins) {
    try {
      return await new Promise<ParsedVideo>((resolve, reject) => {
        let resultVideo: ParsedVideo | null = null;
        let errMsg: string | null = null;
        const child = spawnEar(bin, ["parse", input]);
        if (!child) {
          reject(new Error("process.spawn not supported in current environment"));
          return;
        }

        child.on("stdout", (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const msg = JSON.parse(trimmed) as {
              type?: string;
              stage?: string;
              progress?: number;
              message?: string;
              video?: ParsedVideo;
            };
            if (msg.type === "progress") {
              onProgress?.({
                stage: msg.stage ?? "parsing",
                progress: msg.progress ?? 50,
                message: msg.message ?? "Parsing YouTube link…",
              });
            } else if (msg.type === "result" && msg.video) {
              resultVideo = {
                ...msg.video,
                playerResponse: msg.video.playerResponse ?? null,
              };
            } else if (msg.type === "error") {
              errMsg = msg.message ?? "ear parse error";
            }
          } catch {
            // ignore non-json
          }
        });

        child.on("exit", (res: { code: number; error?: string }) => {
          if (resultVideo) {
            resolve(resultVideo);
          } else {
            reject(
              new Error(
                errMsg ||
                  res.error ||
                  `ear parse exited with code ${res.code ?? -1}`,
              ),
            );
          }
        });
      });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(lastErr);
}

export async function earCaptions(url: string): Promise<CaptionCue[]> {
  const bins = earBinaryCandidates();
  let lastErr = "ear binary not available";

  for (const bin of bins) {
    try {
      return await new Promise<CaptionCue[]>((resolve, reject) => {
        let cues: CaptionCue[] | null = null;
        let errMsg: string | null = null;
        const child = spawnEar(bin, ["captions", url]);
        if (!child) {
          reject(new Error("process.spawn not supported in current environment"));
          return;
        }

        child.on("stdout", (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const msg = JSON.parse(trimmed) as {
              type?: string;
              cues?: CaptionCue[];
              message?: string;
            };
            if (msg.type === "captions" && msg.cues) {
              cues = msg.cues;
            } else if (msg.type === "error") {
              errMsg = msg.message ?? "ear captions error";
            }
          } catch {
            // ignore non-json
          }
        });

        child.on("exit", (res: { code: number; error?: string }) => {
          if (cues) {
            resolve(cues);
          } else {
            reject(
              new Error(
                errMsg ||
                  res.error ||
                  `ear captions exited with code ${res.code ?? -1}`,
              ),
            );
          }
        });
      });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(lastErr);
}

export async function earDownload(
  params: EarDownloadParams,
): Promise<{ path: string; sizeBytes: number }> {
  const bins = earBinaryCandidates();
  const args = [
    "download",
    "--video-id",
    params.videoId,
    "--quality",
    params.qualityId,
    "--output",
    params.outputPath,
  ];
  if (params.videoUrl) args.push("--video-url", params.videoUrl);
  if (params.audioUrl) args.push("--audio-url", params.audioUrl);

  let lastErr = "ear binary not available";

  for (const bin of bins) {
    try {
      return await new Promise<{ path: string; sizeBytes: number }>(
        (resolve, reject) => {
          let donePath = params.outputPath;
          let doneSize = 0;
          let errMsg: string | null = null;

          const child = spawnEar(bin, args);
          if (!child) {
            reject(
              new Error("process.spawn not supported in current environment"),
            );
            return;
          }

          if (params.signal) {
            params.signal.addEventListener("abort", () => {
              try {
                (child as any).kill?.();
              } catch {
                // ignore
              }
              reject(new Error("Download paused by user"));
            });
          }

          child.on("stdout", (line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            try {
              const msg = JSON.parse(trimmed) as {
                type?: string;
                stage?: string;
                percent?: number;
                downloadedBytes?: number;
                totalBytes?: number;
                speedBps?: number;
                etaSeconds?: number | null;
                sizeBytes?: number;
                path?: string;
                message?: string;
              };
              if (msg.type === "progress") {
                params.onProgress?.({
                  stage: msg.stage ?? "downloading",
                  percent: msg.percent ?? 0,
                  downloadedBytes: msg.downloadedBytes ?? 0,
                  totalBytes: msg.totalBytes ?? 0,
                  speedBps: msg.speedBps ?? 0,
                  etaSeconds: msg.etaSeconds ?? null,
                  sizeBytes: msg.sizeBytes,
                });
              } else if (msg.type === "result") {
                donePath = msg.path ?? params.outputPath;
                doneSize = msg.sizeBytes ?? 0;
              } else if (msg.type === "error") {
                errMsg = msg.message ?? "ear download error";
              }
            } catch {
              // ignore non-json
            }
          });

          child.on("exit", (res: { code: number; error?: string }) => {
            if (res.code === 0) {
              resolve({ path: donePath, sizeBytes: doneSize });
            } else {
              reject(
                new Error(
                  errMsg ||
                    res.error ||
                    `ear download exited with code ${res.code ?? -1}`,
                ),
              );
            }
          });
        },
      );
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(lastErr);
}
