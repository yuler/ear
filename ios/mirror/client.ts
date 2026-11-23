import { createTransport } from "./transport";
import type { PairedMac, RemoteCatalogItem, TransportKind } from "./types";

export type MirrorApiErrorCode =
  | "invalid_code"
  | "code_expired"
  | "unpaired"
  | "unreachable"
  | "http_error";

export class MirrorApiError extends Error {
  readonly code: MirrorApiErrorCode;
  readonly status?: number;

  constructor(code: MirrorApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = "MirrorApiError";
    this.code = code;
    this.status = status;
  }
}

export interface PairResponse {
  serverId: string;
  serverName: string;
  shortName: string;
  deviceId: string;
  token: string;
  transport: TransportKind;
}

export interface CatalogResponse {
  serverId: string;
  serverName: string;
  shortName: string;
  items: RemoteCatalogItem[];
}

export interface MirrorApiClient {
  pair(
    host: string,
    port: number,
    code: string,
    deviceName: string,
    deviceId?: string,
  ): Promise<PairResponse>;
  fetchLibrary(mac: PairedMac, signal?: AbortSignal): Promise<CatalogResponse>;
  fetchMediaRange(
    mac: PairedMac,
    videoId: string,
    start: number,
    end: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array>;
  fetchCaptions(
    mac: PairedMac,
    videoId: string,
    signal?: AbortSignal,
  ): Promise<string | null>;
  reportStatus(
    mac: PairedMac,
    syncedCount: number,
    totalCount: number,
    background: boolean,
  ): Promise<void>;
  unpair(mac: PairedMac): Promise<void>;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 6000, signal: outerSignal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", onOuterAbort);
  }
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (outerSignal?.aborted) throw err;
    throw new MirrorApiError(
      "unreachable",
      err instanceof Error ? err.message : "Network request failed",
    );
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
  }
}

async function parseErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: string };
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

/** Real HTTP LAN mirror client backed by NSH's `fetch`. */
export function createHttpMirrorClient(): MirrorApiClient {
  return {
    async pair(host, port, code, deviceName, deviceId) {
      const t = createTransport("lan", host, port);
      const res = await fetchWithTimeout(`${t.baseUrl()}/v1/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceName, deviceId }),
        timeoutMs: 6000,
      });
      if (!res.ok) {
        const errCode = await parseErrorCode(res);
        if (errCode === "code_expired") {
          throw new MirrorApiError("code_expired", "Pairing code expired", res.status);
        }
        if (errCode === "invalid_code" || res.status === 401) {
          throw new MirrorApiError("invalid_code", "Invalid pairing code", res.status);
        }
        throw new MirrorApiError("http_error", `Pair failed (${res.status})`, res.status);
      }
      return (await res.json()) as PairResponse;
    },

    async fetchLibrary(mac, signal) {
      const t = createTransport(mac.transport, mac.host, mac.port);
      const res = await fetchWithTimeout(`${t.baseUrl()}/v1/library`, {
        method: "GET",
        headers: { Authorization: `Bearer ${mac.token}` },
        signal,
        timeoutMs: 5000,
      });
      if (res.status === 401) {
        throw new MirrorApiError("unpaired", "Device was unpaired by computer", 401);
      }
      if (!res.ok) {
        throw new MirrorApiError("http_error", `Catalog failed (${res.status})`, res.status);
      }
      return (await res.json()) as CatalogResponse;
    },

    async fetchMediaRange(mac, videoId, start, end, signal) {
      const t = createTransport(mac.transport, mac.host, mac.port);
      const res = await fetchWithTimeout(
        `${t.baseUrl()}/v1/videos/${encodeURIComponent(videoId)}/media`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${mac.token}`,
            Range: `bytes=${start}-${end}`,
          },
          signal,
          timeoutMs: 30000,
        },
      );
      if (res.status === 401) {
        throw new MirrorApiError("unpaired", "Device was unpaired by computer", 401);
      }
      if (!res.ok && res.status !== 206) {
        throw new MirrorApiError("http_error", `Media range failed (${res.status})`, res.status);
      }
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    },

    async fetchCaptions(mac, videoId, signal) {
      const t = createTransport(mac.transport, mac.host, mac.port);
      const res = await fetchWithTimeout(
        `${t.baseUrl()}/v1/videos/${encodeURIComponent(videoId)}/captions`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${mac.token}` },
          signal,
          timeoutMs: 8000,
        },
      );
      if (res.status === 404) return null;
      if (res.status === 401) {
        throw new MirrorApiError("unpaired", "Device was unpaired by computer", 401);
      }
      if (!res.ok) return null;
      return await res.text();
    },

    async reportStatus(mac, syncedCount, totalCount, background) {
      const t = createTransport(mac.transport, mac.host, mac.port);
      await fetchWithTimeout(`${t.baseUrl()}/v1/device/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mac.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ syncedCount, totalCount, background }),
        timeoutMs: 3000,
      }).catch(() => {});
    },

    async unpair(mac) {
      const t = createTransport(mac.transport, mac.host, mac.port);
      await fetchWithTimeout(`${t.baseUrl()}/v1/unpair`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mac.token}` },
        timeoutMs: 3000,
      }).catch(() => {});
    },
  };
}
