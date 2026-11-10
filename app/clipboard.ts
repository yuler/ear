import { Clipboard } from "nsh";
import { hostFetch, isNativeHost } from "./youtube/host";
import { extractVideoId, parseYouTubeVideo } from "./youtube/parse";

export type ClipboardVideoPreview = {
  rawUrl: string;
  videoId: string;
  title: string;
  channel: string;
  durationLabel: string;
  thumbnailUrl: string;
  source: "clipboard" | "input";
};

function formatDurationMs(durationMs: number | null): string {
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
 * Check if a string contains a YouTube URL or 11-char video ID,
 * and build a preview model.
 */
export function buildVideoPreview(
  rawText: string,
  source: "clipboard" | "input" = "clipboard",
): ClipboardVideoPreview | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // For automatic clipboard detection, require a URL so random 11-character
  // words in the clipboard don't false-trigger.
  const isUrl =
    trimmed.includes("youtube.com/") ||
    trimmed.includes("youtu.be/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://");

  const videoId = extractVideoId(trimmed);
  if (!videoId) return null;

  if (source === "clipboard" && !isUrl) {
    return null;
  }

  const normalizedUrl = isUrl
    ? trimmed
    : `https://www.youtube.com/watch?v=${videoId}`;

  return {
    rawUrl: normalizedUrl,
    videoId,
    title: `YouTube Video (${videoId})`,
    channel: "YouTube",
    durationLabel: "CC",
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    source,
  };
}

/**
 * Fetch live YouTube metadata (title, channel, duration) to enrich a preview card.
 */
export async function fetchVideoPreviewMeta(
  preview: ClipboardVideoPreview,
  fetchImpl: typeof fetch = hostFetch,
): Promise<ClipboardVideoPreview> {
  if (!isNativeHost()) return preview;
  try {
    const parsed = await parseYouTubeVideo(preview.rawUrl, fetchImpl);
    const author = parsed.author?.trim() || "YouTube";
    return {
      ...preview,
      title: parsed.title || preview.title,
      channel: author === "YouTube" ? "YouTube" : `YouTube · ${author}`,
      durationLabel: formatDurationMs(parsed.durationMs),
    };
  } catch {
    return preview;
  }
}
