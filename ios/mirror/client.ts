import { createTransport } from "./transport";
import type { PairedMac, RemoteCatalogItem, TransportKind } from "./types";

export type MirrorApiErrorCode =
  | "invalid_code"
  | "code_expired"
  | "pair_locked"
  | "unpaired"
  | "unreachable"
  | "representation_changed"
  | "invalid_range_response"
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

export interface MediaRangeOptions {
  expectedTotalBytes?: number;
  expectedContentSha256?: string;
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
    options?: MediaRangeOptions,
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

export function parseContentRangeHeader(
  header: string | null | undefined,
): { start: number; end: number; total: number } | null {
  if (!header) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(header.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    end < start ||
    total <= end
  ) {
    return null;
  }
  return { start, end, total };
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
        if (errCode === "pair_locked" || res.status === 429) {
          throw new MirrorApiError("pair_locked", "Pairing temporarily locked", res.status);
        }
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

    async fetchMediaRange(mac, videoId, start, end, signal, options) {
      const expectedLength = end - start + 1;
      const t = createTransport(mac.transport, mac.host, mac.port);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${mac.token}`,
        Range: `bytes=${start}-${end}`,
      };
      if (options?.expectedContentSha256) {
        headers["If-Match"] = `"sha256:${options.expectedContentSha256}"`;
      }
      const res = await fetchWithTimeout(
        `${t.baseUrl()}/v1/videos/${encodeURIComponent(videoId)}/media`,
        {
          method: "GET",
          headers,
          signal,
          timeoutMs: 30000,
        },
      );
      if (res.status === 401) {
        throw new MirrorApiError("unpaired", "Device was unpaired by computer", 401);
      }
      if (res.status === 412 || res.status === 416) {
        throw new MirrorApiError(
          "representation_changed",
          `Media representation changed (${res.status})`,
          res.status,
        );
      }
      if (!res.ok) {
        throw new MirrorApiError("http_error", `Media range failed (${res.status})`, res.status);
      }
      if (res.status !== 206) {
        throw new MirrorApiError(
          "invalid_range_response",
          `Expected 206 Partial Content for range request, received ${res.status}`,
          res.status,
        );
      }

      const contentRange = parseContentRangeHeader(res.headers?.get("content-range"));
      if (!contentRange) {
        throw new MirrorApiError(
          "invalid_range_response",
          "Missing or malformed Content-Range header",
          206,
        );
      }
      if (
        options?.expectedTotalBytes !== undefined &&
        contentRange.total !== options.expectedTotalBytes
      ) {
        throw new MirrorApiError(
          "representation_changed",
          `Media total changed (${contentRange.total} !== ${options.expectedTotalBytes})`,
          206,
        );
      }
      if (contentRange.start !== start || contentRange.end !== end) {
        throw new MirrorApiError(
          "invalid_range_response",
          `Content-Range ${contentRange.start}-${contentRange.end} did not match requested ${start}-${end}`,
          206,
        );
      }

      if (options?.expectedContentSha256) {
        const expectedEtag = `"sha256:${options.expectedContentSha256}"`;
        const respEtag = res.headers?.get("etag")?.trim();
        const respSha = res.headers?.get("x-ear-content-sha256")?.trim();
        const matchesEtag = respEtag === expectedEtag;
        const matchesSha = respSha === options.expectedContentSha256;
        if (!matchesEtag && !matchesSha) {
          throw new MirrorApiError(
            "representation_changed",
            "Media ETag/digest did not match expected representation",
            206,
          );
        }
      }

      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.byteLength !== expectedLength) {
        throw new MirrorApiError(
          "invalid_range_response",
          `Range payload length ${bytes.byteLength} did not match expected ${expectedLength}`,
          206,
        );
      }
      return bytes;
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
