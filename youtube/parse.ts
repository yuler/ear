import { cuesFromJson3, mergeSentences } from "./captions";
import type {
  CaptionTrack,
  LoadedLesson,
  ParsedVideo,
} from "./types";

const WATCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const VISIONOS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

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
  name?: {
    simpleText?: string;
    runs?: Array<{ text?: string }>;
  };
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

function pickVideo(formats: AdaptiveFormat[]): {
  url: string;
  mimeType: string;
} | null {
  const video = formats.filter(
    (f) =>
      typeof f.url === "string" &&
      typeof f.mimeType === "string" &&
      f.mimeType.startsWith("video/mp4"),
  );
  if (video.length === 0) return null;
  const reasonable = video.filter((v) => (v.bitrate ?? 0) <= 2_500_000);
  reasonable.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  const best = reasonable[0] ?? video[0]!;
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
      name:
        t.name?.simpleText ??
        t.name?.runs?.map((r) => r.text ?? "").join("") ??
        t.languageCode ??
        "",
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

async function fetchVisionOsPlayer(
  videoId: string,
  visitorData: string | undefined,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown> | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": VISIONOS_UA,
      Origin: "https://www.youtube.com",
      "X-YouTube-Client-Name": "101",
      "X-YouTube-Client-Version": "1.02",
    };
    if (visitorData) {
      headers["X-Goog-Visitor-Id"] = visitorData;
    }
    const res = await fetchImpl("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers,
      body: JSON.stringify({
        context: {
          client: {
            clientName: "VISIONOS",
            clientVersion: "1.02",
            deviceMake: "Apple",
            deviceModel: "RealityDevice17,1",
            userAgent: VISIONOS_UA,
            osName: "visionOS",
            osVersion: "26.5.23O471",
            hl: "en",
            timeZone: "UTC",
            utcOffsetMinutes: 0,
          },
        },
        videoId,
        playbackContext: {
          contentPlaybackContext: {
            html5Preference: "HTML5_PREF_WANTS",
          },
        },
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const status = (data?.playabilityStatus as { status?: string } | undefined)?.status;
    if (status && status !== "OK") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Hand-parse a YouTube video into audio URL + caption track list.
 * Uses Innertube player API (VisionOS client) with visitor data from the watch
 * page for valid progressive audio streams and unthrottled timedtext captions,
 * falling back to watch HTML ytInitialPlayerResponse.
 */
export async function parseYouTubeVideo(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedVideo> {
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error("Not a valid YouTube URL or video id");

  let watchPlayer: Record<string, unknown> | null = null;
  let visitorData: string | undefined;

  try {
    const res = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": WATCH_UA,
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (res.ok) {
      const html = await res.text();
      const visitorMatch = html.match(/"VISITOR_DATA":\s*"([^"]+)"/);
      visitorData = visitorMatch ? visitorMatch[1] : undefined;
      try {
        watchPlayer = extractPlayerResponse(html) as Record<string, unknown>;
      } catch {
        // watch page may lack ytInitialPlayerResponse; Innertube player will supply it
      }
    }
  } catch {
    // network or host error on watch page, continue to try player API
  }

  const visionPlayer = await fetchVisionOsPlayer(videoId, visitorData, fetchImpl);
  const player = visionPlayer ?? watchPlayer;
  if (!player) {
    throw new Error("Failed to retrieve YouTube video data");
  }

  const videoDetails = ((visionPlayer?.videoDetails ?? watchPlayer?.videoDetails) ?? {}) as {
    title?: string;
    lengthSeconds?: string;
  };
  const streaming = ((visionPlayer?.streamingData ?? watchPlayer?.streamingData) ?? {}) as {
    adaptiveFormats?: AdaptiveFormat[];
  };
  const audio = pickAudio(streaming.adaptiveFormats ?? []);
  const video = pickVideo(streaming.adaptiveFormats ?? []);
  const lengthSec = Number(videoDetails.lengthSeconds ?? NaN);

  const captionTracks =
    visionPlayer && readCaptionTracks(visionPlayer).length > 0
      ? readCaptionTracks(visionPlayer)
      : watchPlayer
        ? readCaptionTracks(watchPlayer)
        : [];

  return {
    videoId,
    title: videoDetails.title ?? videoId,
    audioUrl: audio?.url ?? null,
    audioMimeType: audio?.mimeType ?? null,
    videoUrl: video?.url ?? null,
    videoMimeType: video?.mimeType ?? null,
    durationMs: Number.isFinite(lengthSec) ? lengthSec * 1000 : null,
    captionTracks,
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
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`Captions returned empty response`);
  }
  return JSON.parse(text);
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
