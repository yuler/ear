import { signal } from "nsh";
import process, { type ChildProcess } from "process";
import { libraryRoot } from "../library/paths";
import { earBinaryCandidates } from "../youtube/earClient";
import { isNativeHost } from "../youtube/host";

export interface MirrorDevice {
  id: string;
  name: string;
  pairedAt: number;
  lastSeenAt: number;
  syncedCount: number;
  totalCount: number;
  background: boolean;
  online: boolean;
}

export interface MirrorServerSnapshot {
  serverId: string;
  serverName: string;
  shortName: string;
  host: string;
  port: number;
  code: string;
  codeExpiresAt: number;
  pairUrl: string;
  libraryCount: number;
  devices: MirrorDevice[];
}

export type ServeEvent =
  | { type: "ready"; state: MirrorServerSnapshot }
  | { type: "state"; state: MirrorServerSnapshot }
  | { type: "error"; message: string };

export const mirrorRunning = signal(false);
export const mirrorStarting = signal(false);
export const mirrorSnapshot = signal<MirrorServerSnapshot | null>(null);
export const mirrorError = signal<string | null>(null);

let activeChild: ChildProcess | null = null;

/** Parse a single NDJSON line emitted by `ear serve`. */
export function parseServeEventLine(line: string): ServeEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      type?: string;
      state?: MirrorServerSnapshot;
      message?: string;
    };
    if ((parsed.type === "ready" || parsed.type === "state") && parsed.state) {
      return { type: parsed.type, state: parsed.state };
    }
    if (parsed.type === "error" && typeof parsed.message === "string") {
      return { type: "error", message: parsed.message };
    }
  } catch {
    // ignore non-JSON log lines
  }
  return null;
}

function sendControlCommand(payload: Record<string, unknown>): void {
  if (!activeChild) return;
  try {
    activeChild.write(`${JSON.stringify(payload)}\n`);
  } catch {
    // child may have exited
  }
}

export function startMirrorServer(port = 7890): void {
  if (mirrorRunning() || mirrorStarting()) return;
  if (!isNativeHost() || typeof process.spawn !== "function") {
    mirrorError.set("LAN mirror service is only available in the native desktop app.");
    return;
  }

  mirrorError.set(null);
  mirrorStarting.set(true);

  let libDir: string | null = null;
  try {
    libDir = libraryRoot();
  } catch {
    libDir = null;
  }

  const args = ["serve", "--control-stdin", "--port", String(port)];
  if (libDir) {
    args.push("--library-dir", libDir);
  }

  const candidates = earBinaryCandidates();
  let launched: ChildProcess | null = null;
  let lastErr: unknown = null;

  for (const bin of candidates) {
    try {
      launched = process.spawn(bin, args, { stdin: "pipe", lines: true });
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!launched) {
    mirrorStarting.set(false);
    mirrorError.set(
      lastErr instanceof Error ? lastErr.message : "Failed to launch ear serve",
    );
    return;
  }

  const child = launched;
  activeChild = child;

  child.on("stdout", (line) => {
    const ev = parseServeEventLine(line);
    if (!ev) return;
    if (ev.type === "ready" || ev.type === "state") {
      mirrorSnapshot.set(ev.state);
      mirrorStarting.set(false);
      mirrorRunning.set(true);
      mirrorError.set(null);
    } else if (ev.type === "error") {
      mirrorError.set(ev.message);
    }
  });

  child.on("stderr", (line) => {
    const trimmed = line.trim();
    if (trimmed && !mirrorRunning()) {
      mirrorError.set(trimmed);
    }
  });

  child.on("exit", (res) => {
    if (activeChild === child) {
      activeChild = null;
    }
    mirrorStarting.set(false);
    mirrorRunning.set(false);
    if (res.code && res.code !== 0 && !mirrorError()) {
      mirrorError.set(res.error || `ear serve exited with code ${res.code}`);
    }
  });
}

export function stopMirrorServer(): void {
  if (!activeChild) {
    mirrorRunning.set(false);
    mirrorStarting.set(false);
    return;
  }
  const child = activeChild;
  activeChild = null;
  try {
    child.write(`${JSON.stringify({ cmd: "stop" })}\n`);
  } catch {
    // ignore
  }
  try {
    child.kill();
  } catch {
    // ignore
  }
  mirrorRunning.set(false);
  mirrorStarting.set(false);
}

export function refreshMirrorCode(): void {
  sendControlCommand({ cmd: "refresh_code" });
}

export function removeMirrorDevice(deviceId: string): void {
  sendControlCommand({ cmd: "remove_device", deviceId });
}
