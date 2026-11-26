import type { PairPayload, TransportKind } from "./types";
import { isValidLanHost } from "./validation";

export const DEFAULT_MIRROR_PORT = 32783;

export interface Transport {
  readonly kind: TransportKind;
  readonly address: string;
  baseUrl(): string;
  pairUrl(code: string, serverName?: string): string;
}

/** Direct LAN HTTP transport (same Wi-Fi). Rejects malformed or URL-injection hosts. */
export function createLanTransport(host: string, port = DEFAULT_MIRROR_PORT): Transport {
  const cleanHost = host.trim();
  if (!isValidLanHost(cleanHost)) {
    throw new Error(`Invalid LAN host: ${cleanHost.slice(0, 64)}`);
  }
  const cleanPort = Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_MIRROR_PORT;
  const address = `${cleanHost}:${cleanPort}`;
  return {
    kind: "lan",
    address,
    baseUrl: () => `http://${address}`,
    pairUrl: (code: string, serverName?: string) =>
      buildPairUrl({
        transport: "lan",
        host: cleanHost,
        port: cleanPort,
        code,
        name: serverName,
      }),
  };
}

/**
 * Factory selecting transport implementation.
 * TODO(relay): Add custom relay server transport when cross-network sync is enabled.
 */
export function createTransport(
  kind: TransportKind,
  host: string,
  port = DEFAULT_MIRROR_PORT,
): Transport {
  if (kind === "relay") {
    // TODO(relay): Replace fallback with authenticated relay transport once relay server exists.
    throw new Error("Relay transport is not yet implemented");
  }
  return createLanTransport(host, port);
}

export function buildPairUrl(payload: PairPayload): string {
  const params = [
    `transport=${encodeURIComponent(payload.transport)}`,
    `host=${encodeURIComponent(payload.host)}`,
    `port=${payload.port}`,
    `code=${encodeURIComponent(payload.code)}`,
  ];
  if (payload.name) {
    params.push(`name=${encodeURIComponent(payload.name)}`);
  }
  return `ear://pair?${params.join("&")}`;
}

function parseQueryString(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = decodeURIComponent(part.slice(0, eq).replace(/\+/g, " "));
    const val = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    out[key] = val;
  }
  return out;
}

/** Parse an `ear://pair?transport=lan&host=...&port=...&code=...` URL with strict host validation. */
export function parsePairUrl(raw: string): PairPayload | null {
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith("ear://pair?")) {
    return null;
  }
  const qIndex = trimmed.indexOf("?");
  if (qIndex === -1) return null;
  const hashIndex = trimmed.indexOf("#", qIndex);
  const query = hashIndex === -1 ? trimmed.slice(qIndex + 1) : trimmed.slice(qIndex + 1, hashIndex);
  let params: Record<string, string>;
  try {
    params = parseQueryString(query);
  } catch {
    return null;
  }
  const transport = params.transport === "relay" ? "relay" : "lan";
  const host = (params.host ?? "").trim();
  const portRaw = (params.port ?? String(DEFAULT_MIRROR_PORT)).trim();
  if (!/^\d{1,5}$/.test(portRaw)) return null;
  const port = Number.parseInt(portRaw, 10);
  const code = (params.code ?? "").trim();
  if (!isValidLanHost(host) || port <= 0 || port > 65535 || !/^\d{4}$/.test(code)) {
    return null;
  }
  return {
    transport,
    host,
    port,
    code,
    name: params.name?.trim().slice(0, 128) || undefined,
  };
}

/** Parse manual address input like "192.168.1.42", "192.168.1.42:32783", or "http://192.168.1.42:32783". */
export function parseHostAndPort(input: string): { host: string; port: number } | null {
  let clean = input.trim();
  if (!clean) return null;
  if (/[\s?#\\@]/.test(clean)) return null;
  clean = clean.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!clean || clean.includes("/")) return null;

  // Bracketed IPv6 with optional port: [::1] or [::1]:7890
  if (clean.startsWith("[")) {
    const close = clean.indexOf("]");
    if (close === -1) return null;
    const host = clean.slice(0, close + 1);
    const rest = clean.slice(close + 1);
    if (!isValidLanHost(host)) return null;
    if (!rest) return { host, port: DEFAULT_MIRROR_PORT };
    if (!/^:\d{1,5}$/.test(rest)) return null;
    const port = Number.parseInt(rest.slice(1), 10);
    if (port <= 0 || port > 65535) return null;
    return { host, port };
  }

  const colon = clean.lastIndexOf(":");
  if (colon !== -1 && clean.indexOf(":") === colon) {
    const host = clean.slice(0, colon).trim();
    const portRaw = clean.slice(colon + 1).trim();
    if (!isValidLanHost(host) || !/^\d{1,5}$/.test(portRaw)) return null;
    const port = Number.parseInt(portRaw, 10);
    if (port <= 0 || port > 65535) return null;
    return { host, port };
  }
  if (!isValidLanHost(clean)) return null;
  return { host: clean, port: DEFAULT_MIRROR_PORT };
}
