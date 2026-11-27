import type { CatalogResponse, PairResponse } from "./client";
import type { RemoteCatalogItem, TransportKind } from "./types";

/** 16 GiB upper bound per mirrored media file. */
export const MAX_REMOTE_MEDIA_BYTES = 16 * 1024 * 1024 * 1024;
/** 4 MiB upper bound for captions JSON payload. */
export const MAX_CAPTIONS_BYTES = 4 * 1024 * 1024;

const ALLOWED_MEDIA_EXTS = new Set([
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "m4a",
  "mp3",
  "opus",
  "ogg",
]);

const TRUSTED_THUMBNAIL_HOSTS = new Set([
  "i.ytimg.com",
  "i1.ytimg.com",
  "i2.ytimg.com",
  "i3.ytimg.com",
  "i4.ytimg.com",
  "img.youtube.com",
]);

const FORBIDDEN_RECORD_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "index",
]);

export function hasOwn<T extends object>(obj: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Strict allowlist matching server-side `is_safe_video_id` plus prototype-key exclusion. */
export function isSafeVideoId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[A-Za-z0-9_-]{1,64}$/.test(id) &&
    !FORBIDDEN_RECORD_KEYS.has(id)
  );
}

export function isSafeMediaExt(ext: unknown): ext is string {
  return typeof ext === "string" && ALLOWED_MEDIA_EXTS.has(ext.toLowerCase());
}

/** Allow only trusted HTTPS YouTube thumbnail URLs; drop untrusted or LAN URLs. */
export function sanitizeThumbnailUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return "";
  if (!trimmed.toLowerCase().startsWith("https://")) return "";
  if (/[\s@\\]/.test(trimmed)) return "";
  const rest = trimmed.slice("https://".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return "";
  const host = rest.slice(0, slash).toLowerCase();
  if (!TRUSTED_THUMBNAIL_HOSTS.has(host)) return "";
  return trimmed;
}

function isValidIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^(?:0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

function isValidBracketedIpv6(host: string): boolean {
  if (!host.startsWith("[") || !host.endsWith("]")) return false;
  const inner = host.slice(1, -1);
  return inner.length >= 2 && inner.includes(":") && /^[0-9a-fA-F:.]+$/.test(inner);
}

function isValidHostname(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  const labels = host.split(".");
  if (labels.some((l) => l.length === 0 || l.length > 63)) return false;
  // Reject all-numeric final labels (e.g. invalid IPv4 like "192.168.1.999").
  if (/^\d+$/.test(labels[labels.length - 1]!)) return false;
  return labels.every((l) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l));
}

/** Validate a LAN host literal (IPv4, bracketed IPv6, or RFC 1123 hostname) with no URL injection chars. */
export function isValidLanHost(host: string): boolean {
  const clean = host.trim();
  if (!clean || clean.length > 253) return false;
  if (/[\s/?#@\\]/.test(clean)) return false;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return isValidIpv4(clean) || isValidBracketedIpv6(clean) || isValidHostname(clean);
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

export function validatePairResponse(raw: unknown): PairResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const serverId = typeof r.serverId === "string" ? r.serverId.trim() : "";
  const serverName = typeof r.serverName === "string" ? r.serverName.trim() : "";
  const shortName = typeof r.shortName === "string" ? r.shortName.trim() : "";
  const deviceId = typeof r.deviceId === "string" ? r.deviceId.trim() : "";
  const token = typeof r.token === "string" ? r.token.trim() : "";
  const transport: TransportKind = r.transport === "relay" ? "relay" : "lan";
  if (!serverId || serverId.length > 128 || !deviceId || deviceId.length > 128) return null;
  if (!token || token.length < 16 || token.length > 256) return null;
  return {
    serverId,
    serverName: serverName.slice(0, 128) || serverId,
    shortName: shortName.slice(0, 32) || serverName.slice(0, 32) || serverId,
    deviceId,
    token,
    transport,
  };
}

export function validateCatalogItem(raw: unknown): RemoteCatalogItem | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Record<string, unknown>;
  if (!isSafeVideoId(it.videoId)) return null;
  const mediaExt = typeof it.mediaExt === "string" ? it.mediaExt.trim().toLowerCase() : "";
  if (!isSafeMediaExt(mediaExt)) return null;
  const sizeBytes = typeof it.sizeBytes === "number" ? it.sizeBytes : -1;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_REMOTE_MEDIA_BYTES) {
    return null;
  }
  const updatedAt = typeof it.updatedAt === "number" && Number.isFinite(it.updatedAt)
    ? Math.max(0, Math.floor(it.updatedAt))
    : 0;
  const durationMs =
    typeof it.durationMs === "number" && Number.isFinite(it.durationMs) && it.durationMs >= 0
      ? Math.floor(it.durationMs)
      : null;
  const contentSha256 = isSha256Hex(it.contentSha256)
    ? it.contentSha256.toLowerCase()
    : undefined;
  const title =
    typeof it.title === "string" && it.title.trim()
      ? it.title.trim().slice(0, 300)
      : it.videoId;
  const mimeType =
    typeof it.mimeType === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(it.mimeType.trim())
      ? it.mimeType.trim().toLowerCase()
      : "video/mp4";

  return {
    videoId: it.videoId,
    title,
    thumbnailUrl: sanitizeThumbnailUrl(it.thumbnailUrl),
    durationMs,
    sizeBytes,
    contentSha256,
    quality: typeof it.quality === "string" ? it.quality.trim().slice(0, 32) : null,
    mediaExt,
    mimeType,
    hasCaptions: it.hasCaptions === true,
    updatedAt,
  };
}

export function validateCatalogResponse(raw: unknown): CatalogResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.items)) return null;
  const serverId = typeof r.serverId === "string" ? r.serverId.trim() : "";
  const serverName = typeof r.serverName === "string" ? r.serverName.trim() : "";
  const shortName = typeof r.shortName === "string" ? r.shortName.trim() : "";
  const items: RemoteCatalogItem[] = [];
  for (const entry of r.items) {
    const valid = validateCatalogItem(entry);
    if (valid) items.push(valid);
  }
  return {
    serverId,
    serverName,
    shortName,
    items,
  };
}
