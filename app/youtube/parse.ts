import { mergeSentences } from "./captions";
import {
  earBinaryCandidates,
  earCaptions,
  earParse,
  type ParseProgressEvent,
} from "./earClient";
import type {
  CaptionTrack,
  LoadedLesson,
  ParsedVideo,
} from "./types";

export { earBinaryCandidates, type ParseProgressEvent };

/** Resolve 16:9 poster URL for a YouTube video (uses explicit thumbnailUrl or falls back to hqdefault.jpg). */
export function videoPosterUrl(
  videoId: string,
  thumbnailUrl?: string | null,
): string {
  if (typeof thumbnailUrl === "string" && thumbnailUrl.trim().length > 0) {
    return thumbnailUrl.trim();
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Format byte size into human-readable MB / KB. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** True when a subtitle track is CC auto-generated / machine-translated (`kind === "asr"` or `vssId` starts with `a.`). */
export function isAutoCaptionTrack(track: CaptionTrack): boolean {
  if (typeof track.isAuto === "boolean") return track.isAuto;
  if (track.kind === "asr") return true;
  if (track.vssId?.startsWith("a.")) return true;
  return /auto-generated/i.test(track.name);
}

/** Unique identifier for selecting a specific caption track. */
export function captionTrackId(track: CaptionTrack): string {
  if (track.trackId) return track.trackId;
  if (track.vssId) return track.vssId;
  return `${track.languageCode}:${isAutoCaptionTrack(track) ? "asr" : "manual"}`;
}

/** Clean display name for a caption track (without redundant "(auto-generated)" suffix). */
export function cleanCaptionTrackName(track: CaptionTrack): string {
  const cleaned = track.name
    .replace(/\s*\(auto-generated\)\s*/gi, "")
    .trim();
  return cleaned || track.languageCode || "Subtitles";
}

/** Badge metadata distinguishing Manual (人工翻译/人工字幕) vs CC (机器生成/自动翻译). */
export function captionTrackBadge(track: CaptionTrack): {
  kind: "manual" | "cc";
  shortLabel: string;
  fullLabel: string;
} {
  if (isAutoCaptionTrack(track)) {
    return {
      kind: "cc",
      shortLabel: "CC 机翻",
      fullLabel: "CC · 自动生成",
    };
  }
  return {
    kind: "manual",
    shortLabel: "人工",
    fullLabel: "人工 · Manual",
  };
}

/** Extract an 11-char YouTube video id from a URL or bare id. */
export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").slice(0, 11);
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const embed = url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
    if (embed) return embed[1]!;
  } catch {
    // not a URL
  }
  const loose = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return loose ? loose[1]! : null;
}

/** Slice a balanced `{...}` starting at `start` (must be `{`). */
export function sliceBalancedObject(source: string, start: number): string | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i]!;
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Prefer manual English track first, then auto-generated CC English track,
 * then first manual track, then first available track.
 */
export function preferEnglishTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const isEn = (t: CaptionTrack) =>
    t.languageCode === "en" ||
    t.languageCode.startsWith("en-") ||
    /english/i.test(t.name);

  const manualEn = tracks.find((t) => isEn(t) && !isAutoCaptionTrack(t));
  if (manualEn) return manualEn;

  const autoEn = tracks.find((t) => isEn(t));
  if (autoEn) return autoEn;

  const anyManual = tracks.find((t) => !isAutoCaptionTrack(t));
  return anyManual ?? tracks[0]!;
}

/**
 * Intelligent subtitle track selection:
 * If the video title or metadata indicates Japanese, prefer manual Japanese tracks;
 * otherwise prefer manual English tracks.
 */
export function preferBestCaptionTrack(
  tracks: CaptionTrack[],
  title?: string,
): CaptionTrack | null {
  if (tracks.length === 0) return null;

  const isJapaneseVideo =
    Boolean(title) &&
    (/[\u3040-\u309F\u30A0-\u30FF]/.test(title!) ||
      /japanese|jlpt|日本語|聴解/i.test(title!));

  if (isJapaneseVideo) {
    const isJa = (t: CaptionTrack) =>
      t.languageCode === "ja" ||
      t.languageCode.startsWith("ja-") ||
      /japanese|日本語/i.test(t.name);

    const manualJa = tracks.find((t) => isJa(t) && !isAutoCaptionTrack(t));
    if (manualJa) return manualJa;

    const autoJa = tracks.find((t) => isJa(t));
    if (autoJa) return autoJa;
  }

  return preferEnglishTrack(tracks);
}

/**
 * Parse a YouTube video via the Rust `ear parse` binary with real-time
 * progress callbacks.
 */
export async function parseYouTubeWithRust(
  input: string,
  onProgress?: (ev: ParseProgressEvent) => void,
  _fetchImpl?: unknown,
): Promise<ParsedVideo> {
  return earParse(input, onProgress);
}

/**
 * Build a LoadedLesson from an already-parsed ParsedVideo, using the user's
 * chosen subtitle track (`trackId`) and video quality (`qualityId`).
 */
export async function loadLessonFromParsed(
  video: ParsedVideo,
  options: {
    trackId?: string | null;
    qualityId?: string | null;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<LoadedLesson> {
  const qualities = video.qualities ?? [];
  const selectedQuality =
    (options.qualityId
      ? qualities.find((q) => q.id === options.qualityId)
      : null) ??
    qualities.find((q) => q.id === "720p") ??
    qualities[0] ??
    null;

  const updatedVideo: ParsedVideo = selectedQuality
    ? {
        ...video,
        videoUrl:
          selectedQuality.mode === "video"
            ? (selectedQuality.videoUrl ?? video.videoUrl)
            : null,
        videoMimeType:
          selectedQuality.mode === "video"
            ? selectedQuality.mimeType
            : null,
        audioUrl: selectedQuality.audioUrl ?? video.audioUrl,
      }
    : video;

  const track =
    (options.trackId
      ? updatedVideo.captionTracks.find(
          (t) => captionTrackId(t) === options.trackId,
        )
      : null) ?? preferEnglishTrack(updatedVideo.captionTracks);

  if (!track) {
    return {
      video: updatedVideo,
      track: null,
      selectedQuality,
      cues: [],
      sentences: [],
    };
  }

  const cues = await earCaptions(track.baseUrl);
  const sentences = mergeSentences(cues);
  return {
    video: updatedVideo,
    track,
    selectedQuality,
    cues,
    sentences,
  };
}

/** Parse video + preferred (or selected) captions into a lesson payload via Ear CLI. */
export async function loadLesson(
  input: string,
  _fetchImpl?: unknown,
  options: {
    trackId?: string | null;
    qualityId?: string | null;
  } = {},
): Promise<LoadedLesson> {
  const video = await earParse(input);
  return loadLessonFromParsed(video, options);
}
