import { cuesFromJson3, mergeSentences } from "./captions";
import type {
  CaptionTrack,
  LoadedLesson,
  ParsedVideo,
} from "./types";

const WATCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

function extractPlayerResponse(html: string): unknown {
  const markers = [
    "ytInitialPlayerResponse",
    "var ytInitialPlayerResponse",
  ];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx < 0) continue;
    const eq = html.indexOf("=", idx);
    if (eq < 0) continue;
    let i = eq + 1;
    while (i < html.length && /\s/.test(html[i]!)) i++;
    if (html[i] !== "{") continue;
    const json = sliceBalancedObject(html, i);
    if (json) return JSON.parse(json);
  }
  throw new Error("ytInitialPlayerResponse not found in watch HTML");
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

type AdaptiveFormat = {
  mimeType?: string;
  url?: string;
  bitrate?: number;
  audioQuality?: string;
};

type CaptionTrackRenderer = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
};

function pickAudio(formats: AdaptiveFormat[]): {
  url: string;
  mimeType: string;
} | null {
  const audio = formats.filter(
    (f) =>
      typeof f.url === "string" &&
      typeof f.mimeType === "string" &&
      f.mimeType.startsWith("audio/"),
  );
  if (audio.length === 0) return null;
  const preferMp4 = audio.filter((f) => f.mimeType!.includes("mp4"));
  const pool = preferMp4.length > 0 ? preferMp4 : audio;
  pool.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  const best = pool[0]!;
  return { url: best.url!, mimeType: best.mimeType! };
}

function readCaptionTracks(player: Record<string, unknown>): CaptionTrack[] {
  const captions = player.captions as
    | {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: CaptionTrackRenderer[];
        };
      }
    | undefined;
  const tracks =
    captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return tracks
    .filter((t) => typeof t.baseUrl === "string")
    .map((t) => ({
      languageCode: t.languageCode ?? "",
      name: t.name?.simpleText ?? t.languageCode ?? "",
      baseUrl: t.baseUrl!,
      kind: t.kind,
    }));
}

export function preferEnglishTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const en = tracks.find(
    (t) =>
      t.languageCode === "en" ||
      t.languageCode.startsWith("en-") ||
      /english/i.test(t.name),
  );
  return en ?? tracks[0]!;
}

/**
 * Hand-parse a YouTube watch page into audio URL + caption track list.
 * No yt-dlp — only HTML + ytInitialPlayerResponse.
 */
export async function parseYouTubeVideo(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedVideo> {
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error("Not a valid YouTube URL or video id");

  const res = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": WATCH_UA,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Watch page HTTP ${res.status}`);
  const html = await res.text();
  const player = extractPlayerResponse(html) as Record<string, unknown>;

  const videoDetails = (player.videoDetails ?? {}) as {
    title?: string;
    lengthSeconds?: string;
  };
  const streaming = (player.streamingData ?? {}) as {
    adaptiveFormats?: AdaptiveFormat[];
  };
  const audio = pickAudio(streaming.adaptiveFormats ?? []);
  const lengthSec = Number(videoDetails.lengthSeconds ?? NaN);

  return {
    videoId,
    title: videoDetails.title ?? videoId,
    audioUrl: audio?.url ?? null,
    audioMimeType: audio?.mimeType ?? null,
    durationMs: Number.isFinite(lengthSec) ? lengthSec * 1000 : null,
    captionTracks: readCaptionTracks(player),
    playerResponse: player,
  };
}

export async function fetchJson3Captions(
  track: CaptionTrack,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const url = new URL(track.baseUrl);
  url.searchParams.set("fmt", "json3");
  const res = await fetchImpl(url.toString(), {
    headers: { "User-Agent": WATCH_UA },
  });
  if (!res.ok) throw new Error(`Captions HTTP ${res.status}`);
  return res.json();
}

/** Parse video + preferred English captions into a lesson payload. */
export async function loadLesson(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedLesson> {
  const video = await parseYouTubeVideo(input, fetchImpl);
  const track = preferEnglishTrack(video.captionTracks);
  if (!track) {
    return { video, track: null, cues: [], sentences: [] };
  }
  const json3 = await fetchJson3Captions(track, fetchImpl);
  const cues = cuesFromJson3(json3);
  const sentences = mergeSentences(cues);
  return { video, track, cues, sentences };
}
