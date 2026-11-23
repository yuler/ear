import { Clipboard } from "nsh";
import { hostFetch, isNativeHost } from "./youtube/host";
import {
  extractVideoId,
  parseYouTubeWithRust,
  type ParseProgressEvent,
} from "./youtube/parse";
import type {
  CaptionTrack,
  ParsedVideo,
  VideoQualityOption,
} from "./youtube/types";

export type ClipboardVideoPreview = {
  rawUrl: string;
  videoId: string;
  title: string;
  channel: string;
  durationLabel: string;
  thumbnailUrl: string;
  source: "clipboard" | "input" | "discover";
  language?: string | null;
  parsedVideo?: ParsedVideo | null;
  qualities?: VideoQualityOption[];
  captionTracks?: CaptionTrack[];
  isParsed?: boolean;
};

/** True when text looks like a URL (prevents plain search words from triggering link mode). */
export function isLinkText(rawText: string): boolean {
  const trimmed = rawText.trim();
  return (
    trimmed.includes("youtube.com/") ||
    trimmed.includes("youtu.be/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  );
}

export function formatDurationMs(durationMs: number | null): string {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "CC";
  }
  const totalSec = Math.round(durationMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const secStr = String(secs).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${secStr}`;
  }
  return `${mins}:${secStr}`;
}

/**
 * Safely read text from the system clipboard.
 * Returns empty string if clipboard is unavailable or empty.
 */
export async function readSystemClipboard(): Promise<string> {
  try {
    const text = await Clipboard.readText();
    return typeof text === "string" ? text.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Check if a string contains a YouTube URL and build a preview model.
 */
export function buildVideoPreview(
  rawText: string,
  source: "clipboard" | "input" | "discover" = "clipboard",
): ClipboardVideoPreview | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // Require a URL so plain search queries (including 11-letter words like
  // "environment") or random clipboard text never false-trigger link parsing.
  if (!isLinkText(trimmed)) {
    return null;
  }

  const videoId = extractVideoId(trimmed);
  if (!videoId) return null;

  return {
    rawUrl: trimmed,
    videoId,
    title: `YouTube Video (${videoId})`,
    channel: "YouTube",
    durationLabel: "CC",
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    source,
    parsedVideo: null,
    qualities: [],
    captionTracks: [],
    isParsed: false,
  };
}

/**
 * Fetch live YouTube metadata, video resolutions, and subtitle tracks
 * (Manual vs CC) via Rust `ear parse` (with TS fetch fallback).
 */
export async function fetchVideoPreviewMeta(
  preview: ClipboardVideoPreview,
  fetchImpl: typeof fetch = hostFetch,
  onProgress?: (ev: ParseProgressEvent) => void,
): Promise<ClipboardVideoPreview> {
  if (!isNativeHost()) return preview;
  try {
    const parsed = await parseYouTubeWithRust(
      preview.rawUrl,
      onProgress,
      fetchImpl,
    );
    const author = parsed.author?.trim() || "YouTube";
    return {
      ...preview,
      title: parsed.title || preview.title,
      channel: author === "YouTube" ? "YouTube" : `YouTube · ${author}`,
      durationLabel: formatDurationMs(parsed.durationMs),
      thumbnailUrl: parsed.thumbnailUrl || preview.thumbnailUrl,
      parsedVideo: parsed,
      qualities: parsed.qualities ?? [],
      captionTracks: parsed.captionTracks ?? [],
      isParsed: true,
    };
  } catch {
    return {
      ...preview,
      isParsed: true,
    };
  }
}
