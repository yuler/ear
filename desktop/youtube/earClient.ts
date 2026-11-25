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
  libraryDir?: string | null;
  noLibrarySync?: boolean;
  noCaptions?: boolean;
  signal?: AbortSignal;
  onProgress?: (ev: DownloadProgressEvent) => void;
};

export type SpawnChildLike = {
  on(event: string, handler: (arg: any) => void): any;
};

export type SpawnHook = (
  bin: string,
  args: string[],
) => SpawnChildLike;

let currentSpawnHook: SpawnHook | null = null;

export function setEarSpawnHook(hook: SpawnHook | null): void {
  currentSpawnHook = hook;
}

let candidatesOverride: string[] | null = null;

export function setEarBinaryCandidates(candidates: string[] | null): void {
  candidatesOverride = candidates;
}

export function earBinaryCandidates(
  platform: string | undefined = (() => {
    try {
      return typeof process !== "undefined" ? process?.platform : undefined;
    } catch {
      return undefined;
    }
  })(),
  home: string | undefined = (() => {
    try {
      return typeof process !== "undefined" ? process?.env?.HOME : undefined;
    } catch {
      return undefined;
    }
  })(),
): string[] {
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
  if (platform === "macos") {
    list.push("/Applications/Ear.app/Contents/Helpers/ear");
    if (home) {
      list.push(`${home}/Applications/Ear.app/Contents/Helpers/ear`);
    }
  }
  if (home) {
    list.push(`${home}/.local/bin/ear`);
  }
  return list;
}

class EarApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EarApplicationError";
  }
}

/**
 * Resolves the effective `library` directory passed via `--library-dir` to `ear download`
 * so CLI metadata writes match the host app's Dev/Prod isolation without relying on `spawn` env.
 */
export function resolveEarLibraryDir(
  baseDataDir?: string,
  env: EnvMap = process.env ?? {},
): string | null {
  const dataDir = resolveDataDirOrNull(baseDataDir, env);
  return dataDir ? `${dataDir}/library` : null;
}

export function spawnEar(bin: string, args: string[]): SpawnChildLike | null {
  if (currentSpawnHook) {
    return currentSpawnHook(bin, args);
  }
  try {
    if (isNativeHost() && typeof process.spawn === "function") {
      return process.spawn(bin, args, {
        lines: true,
        timeoutMs: 600_000,
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
          } else if (errMsg) {
            reject(new EarApplicationError(errMsg));
          } else {
            reject(
              new Error(
                res.error ||
                  `ear parse exited with code ${res.code ?? -1}`,
              ),
            );
          }
        });
      });
    } catch (e) {
      if (e instanceof EarApplicationError) throw e;
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
          } else if (errMsg) {
            reject(new EarApplicationError(errMsg));
          } else {
            reject(
              new Error(
                res.error ||
                  `ear captions exited with code ${res.code ?? -1}`,
              ),
            );
          }
        });
      });
    } catch (e) {
      if (e instanceof EarApplicationError) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(lastErr);
}

export type DiskSpaceInfo = {
  path: string;
  availableBytes: number;
  totalBytes: number;
};

export async function earStorage(dirPath: string): Promise<DiskSpaceInfo | null> {
  const bins = earBinaryCandidates();
  for (const bin of bins) {
    try {
      const info = await new Promise<DiskSpaceInfo | null>((resolve, reject) => {
        let result: DiskSpaceInfo | null = null;
        const child = spawnEar(bin, ["storage", dirPath]);
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
              path?: string;
              availableBytes?: number;
              totalBytes?: number;
            };
            if (
              msg.type === "storage" &&
              typeof msg.availableBytes === "number" &&
              typeof msg.totalBytes === "number" &&
              msg.totalBytes > 0
            ) {
              result = {
                path: msg.path ?? dirPath,
                availableBytes: msg.availableBytes,
                totalBytes: msg.totalBytes,
              };
            }
          } catch {
            // ignore non-json
          }
        });
        child.on("exit", (res: { code: number }) => {
          if (result) resolve(result);
          else if (res.code === 0) resolve(null);
          else reject(new Error(`ear storage exited with code ${res.code ?? -1}`));
        });
      });
      if (info) return info;
    } catch {
      // try next candidate binary
    }
  }
  return null;
}

export type VideoDimensions = {
  width: number;
  height: number;
};

export async function earProbe(
  paths: readonly string[],
): Promise<Record<string, VideoDimensions>> {
  const clean = paths.filter((p) => typeof p === "string" && p.trim().length > 0);
  if (clean.length === 0) return {};

  const bins = earBinaryCandidates();
  for (const bin of bins) {
    try {
      const map = await new Promise<Record<string, VideoDimensions>>((resolve, reject) => {
        let out: Record<string, VideoDimensions> | null = null;
        const child = spawnEar(bin, ["probe", ...clean]);
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
              results?: Array<{ path?: string; width?: number | null; height?: number | null }>;
            };
            if (msg.type === "probe" && Array.isArray(msg.results)) {
              const found: Record<string, VideoDimensions> = {};
              for (const item of msg.results) {
                if (
                  typeof item.path === "string" &&
                  typeof item.width === "number" &&
                  typeof item.height === "number" &&
                  item.width > 0 &&
                  item.height > 0
                ) {
                  found[item.path] = { width: item.width, height: item.height };
                }
              }
              out = found;
            }
          } catch {
            // ignore non-json
          }
        });
        child.on("exit", (res: { code: number }) => {
          if (out) resolve(out);
          else if (res.code === 0) resolve({});
          else reject(new Error(`ear probe exited with code ${res.code ?? -1}`));
        });
      });
      return map;
    } catch {
      // try next candidate binary
    }
  }
  return {};
}

export async function earDownload(
  params: EarDownloadParams,
): Promise<{
  path: string;
  sizeBytes: number;
  videoWidth?: number | null;
  videoHeight?: number | null;
}> {
  if (params.signal?.aborted) {
    throw new Error("Download paused by user");
  }

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
  const libraryDir =
    params.libraryDir !== undefined
      ? params.libraryDir
      : resolveEarLibraryDir();
  if (libraryDir) args.push("--library-dir", libraryDir);

  const noLibrarySync = params.noLibrarySync ?? true;
  if (noLibrarySync) args.push("--no-library-sync");
  const noCaptions = params.noCaptions ?? true;
  if (noCaptions) args.push("--no-captions");

  let lastErr = "ear binary not available";

  for (const bin of bins) {
    if (params.signal?.aborted) {
      throw new Error("Download paused by user");
    }
    try {
      return await new Promise<{
        path: string;
        sizeBytes: number;
        videoWidth?: number | null;
        videoHeight?: number | null;
      }>(
        (resolve, reject) => {
          let donePath = params.outputPath;
          let doneSize = 0;
          let doneWidth: number | null = null;
          let doneHeight: number | null = null;
          let errMsg: string | null = null;
          let settled = false;

          const child = spawnEar(bin, args);
          if (!child) {
            reject(
              new Error("process.spawn not supported in current environment"),
            );
            return;
          }

          const onAbort = () => {
            if (settled) return;
            settled = true;
            try {
              (child as any).kill?.();
            } catch {
              // ignore
            }
            reject(new EarApplicationError("Download paused by user"));
          };

          if (params.signal) {
            params.signal.addEventListener("abort", onAbort, { once: true });
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
                videoWidth?: number | null;
                videoHeight?: number | null;
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
              } else if (msg.type === "done" || msg.type === "result") {
                donePath = msg.path ?? params.outputPath;
                doneSize = msg.sizeBytes ?? 0;
                if (typeof msg.videoWidth === "number" && msg.videoWidth > 0) {
                  doneWidth = msg.videoWidth;
                }
                if (typeof msg.videoHeight === "number" && msg.videoHeight > 0) {
                  doneHeight = msg.videoHeight;
                }
              } else if (msg.type === "error") {
                errMsg = msg.message ?? "ear download error";
              }
            } catch {
              // ignore non-json
            }
          });

          child.on("exit", (res: { code: number; error?: string }) => {
            if (params.signal) {
              params.signal.removeEventListener("abort", onAbort);
            }
            if (settled) return;
            settled = true;
            if (res.code === 0) {
              resolve({
                path: donePath,
                sizeBytes: doneSize,
                ...(doneWidth && doneHeight
                  ? { videoWidth: doneWidth, videoHeight: doneHeight }
                  : {}),
              });
            } else if (errMsg) {
              reject(new EarApplicationError(errMsg));
            } else {
              reject(
                new Error(
                  res.error ||
                    `ear download exited with code ${res.code ?? -1}`,
                ),
              );
            }
          });
        },
      );
    } catch (e) {
      if (e instanceof EarApplicationError) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(lastErr);
}
