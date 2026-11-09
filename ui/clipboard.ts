import { Clipboard } from "nsh";
import { findSampleLesson, type SampleLessonMeta } from "../library/samples";
import { extractVideoId } from "../youtube/parse";

export type ClipboardVideoPreview = {
  rawUrl: string;
  videoId: string;
  title: string;
  channel: string;
  speaker: string;
  durationLabel: string;
  badgeText: string;
  accentBg: string;
  accentText: string;
  sample: SampleLessonMeta | null;
  source: "clipboard" | "input";
};

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
 * and build a preview card model (matching Downbit's "From your clipboard" card).
 */
export function buildVideoPreview(
  rawText: string,
  source: "clipboard" | "input" = "clipboard",
): ClipboardVideoPreview | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // For automatic clipboard detection, require either a URL or a known sample ID
  // so random 11-character words in the clipboard don't false-trigger.
  const isUrl =
    trimmed.includes("youtube.com/") ||
    trimmed.includes("youtu.be/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://");

  const videoId = extractVideoId(trimmed);
  if (!videoId) return null;

  const sample = findSampleLesson(videoId);
  if (source === "clipboard" && !isUrl && !sample) {
    return null;
  }

  const normalizedUrl = isUrl
    ? trimmed
    : `https://www.youtube.com/watch?v=${videoId}`;

  if (sample) {
    return {
      rawUrl: normalizedUrl,
      videoId: sample.videoId,
      title: sample.title,
      channel: `YouTube · ${sample.channel}`,
      speaker: sample.speaker,
      durationLabel: sample.durationLabel,
      badgeText: sample.badgeText,
      accentBg: sample.accentBg,
      accentText: sample.accentText,
      sample,
      source,
    };
  }

  return {
    rawUrl: normalizedUrl,
    videoId,
    title: `YouTube Video (${videoId}) — Ready to Parse Audio & EN Subtitles`,
    channel: "YouTube · Direct Stream + CC",
    speaker: "YouTube",
    durationLabel: "HD · CC",
    badgeText: "YOUTUBE STREAM",
    accentBg: "bg-[#1a2230]",
    accentText: "text-[#6cb6ff]",
    sample: null,
    source,
  };
}
