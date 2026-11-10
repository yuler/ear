import process from "process";
import { cuesFromJson3, mergeSentences } from "./captions";
import { isNativeHost } from "./host";
import type {
  CaptionTrack,
  LoadedLesson,
  ParsedVideo,
  VideoQualityOption,
} from "./types";

const WATCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const VISIONOS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

/** Resolve Ear CLI binary path on native host. */
export function earBinaryCandidates(): string[] {
  return ["ear"];
}

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
  itag?: number;
  mimeType?: string;
  url?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  fps?: number;
  qualityLabel?: string;
  contentLength?: string | number;
  audioQuality?: string;
  audioTrack?: {
    displayName?: string;
    id?: string;
    audioIsDefault?: boolean;
    isAutoDubbed?: boolean;
  };
};

type CaptionTrackRenderer = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  vssId?: string;
  name?: {
    simpleText?: string;
    runs?: Array<{ text?: string }>;
  };
};

function parseContentLength(f: AdaptiveFormat): number | null {
  if (typeof f.contentLength === "number" && f.contentLength > 0) {
    return f.contentLength;
  }
  if (typeof f.contentLength === "string") {
    const n = Number(f.contentLength);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (typeof f.url === "string") {
    const m = f.url.match(/[?&]clen=(\d+)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function isOriginalAudioTrack(f: AdaptiveFormat): boolean {
  if (!f.audioTrack) return true;
  if (f.audioTrack.audioIsDefault === true) return true;
  if (f.audioTrack.isAutoDubbed === true) return false;
  if (f.audioTrack.displayName && /original/i.test(f.audioTrack.displayName)) {
    return true;
  }
  return false;
}

function pickAudio(formats: AdaptiveFormat[]): {
  url: string;
  mimeType: string;
  sizeBytes: number | null;
} | null {
  const audio = formats.filter(
    (f) =>
      typeof f.url === "string" &&
      typeof f.mimeType === "string" &&
      f.mimeType.startsWith("audio/"),
  );
  if (audio.length === 0) return null;
  const orig = audio.filter(isOriginalAudioTrack);
  const trackPool = orig.length > 0 ? orig : audio;
  const preferMp4 = trackPool.filter((f) => f.mimeType!.includes("mp4"));
  const pool = preferMp4.length > 0 ? preferMp4 : trackPool;
  pool.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  const best = pool[0]!;
  return {
    url: best.url!,
    mimeType: best.mimeType!,
    sizeBytes: parseContentLength(best),
  };
}

export function buildQualityOptions(
  formats: AdaptiveFormat[],
  adaptiveFormats: AdaptiveFormat[],
  bestAudio: { url: string; mimeType: string; sizeBytes: number | null } | null,
): VideoQualityOption[] {
  const all = [...adaptiveFormats, ...formats];
  const heights = [1080, 720, 480, 360, 240];
  const out: VideoQualityOption[] = [];

  for (const h of heights) {
    const matching = all.filter((f) => {
      if (typeof f.url !== "string" || !f.url) return false;
      if (typeof f.mimeType !== "string" || !f.mimeType.startsWith("video/mp4")) {
        return false;
      }
      const fh =
        f.height ??
        (f.qualityLabel ? parseInt(f.qualityLabel, 10) : NaN);
      return fh === h;
    });
    if (matching.length === 0) continue;

    matching.sort((a, b) => {
      const aAvc = a.mimeType?.includes("avc1") ? 1 : 0;
      const bAvc = b.mimeType?.includes("avc1") ? 1 : 0;
      if (aAvc !== bAvc) return bAvc - aAvc;
      return (b.bitrate ?? 0) - (a.bitrate ?? 0);
    });

    const chosen = matching[0]!;
    const vSize = parseContentLength(chosen);
    const hasMuxedAudio =
      Boolean(chosen.audioQuality) || Boolean(chosen.mimeType?.includes("mp4a"));
    const sizeBytes =
      vSize != null
        ? hasMuxedAudio
          ? vSize
          : vSize + (bestAudio?.sizeBytes ?? 0)
        : null;
    const label = `${h}p`;
    out.push({
      id: label,
      label,
      mode: "video",
      height: h,
      fps: chosen.fps ?? null,
      videoUrl: chosen.url!,
      audioUrl: hasMuxedAudio ? null : (bestAudio?.url ?? null),
      mimeType: chosen.mimeType!,
      ext: "mp4",
      sizeBytes,
    });
  }

  // Fallback progressive video if none of the standard heights matched
  if (out.length === 0) {
    const anyMp4 = all.find(
      (f) =>
        typeof f.url === "string" &&
        typeof f.mimeType === "string" &&
        f.mimeType.startsWith("video/mp4"),
    );
    if (anyMp4) {
      const hasMuxed =
        Boolean(anyMp4.audioQuality) || Boolean(anyMp4.mimeType?.includes("mp4a"));
      out.push({
        id: "720p",
        label: anyMp4.qualityLabel || "720p",
        mode: "video",
        height: anyMp4.height ?? 720,
        fps: anyMp4.fps ?? null,
        videoUrl: anyMp4.url!,
        audioUrl: hasMuxed ? null : (bestAudio?.url ?? null),
        mimeType: anyMp4.mimeType!,
        ext: "mp4",
        sizeBytes: parseContentLength(anyMp4),
      });
    }
  }

  if (bestAudio) {
    out.push({
      id: "audio",
      label: "Audio (M4A)",
      mode: "audio",
      height: null,
      fps: null,
      videoUrl: null,
      audioUrl: bestAudio.url,
      mimeType: bestAudio.mimeType,
      ext: bestAudio.mimeType.includes("webm") ? "webm" : "m4a",
      sizeBytes: bestAudio.sizeBytes,
    });
  }

  return out;
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
  const mapped = tracks
    .filter((t) => typeof t.baseUrl === "string")
    .map((t) => {
      const languageCode = t.languageCode ?? "";
      const name =
        t.name?.simpleText ??
        t.name?.runs?.map((r) => r.text ?? "").join("") ??
        languageCode;
      const isAuto =
        t.kind === "asr" ||
        Boolean(t.vssId?.startsWith("a.")) ||
        /auto-generated/i.test(name);
      const trackId =
        t.vssId || `${languageCode}:${isAuto ? "asr" : "manual"}`;
      return {
        trackId,
        languageCode,
        name,
        baseUrl: t.baseUrl!,
        kind: t.kind,
        vssId: t.vssId,
        isAuto,
      };
    });

  // Sort so English comes first and Manual (人工) comes before CC Auto (机器)
  mapped.sort((a, b) => {
    const aEn =
      a.languageCode === "en" ||
      a.languageCode.startsWith("en-") ||
      /english/i.test(a.name);
    const bEn =
      b.languageCode === "en" ||
      b.languageCode.startsWith("en-") ||
      /english/i.test(b.name);
    if (aEn !== bEn) return aEn ? -1 : 1;
    const aAuto = isAutoCaptionTrack(a);
    const bAuto = isAutoCaptionTrack(b);
    if (aAuto !== bAuto) return aAuto ? 1 : -1;
    return 0;
  });

  return mapped;
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
 * Hand-parse a YouTube video into audio URL, video quality options, and caption track list.
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
    author?: string;
    lengthSeconds?: string;
  };
  const streaming = ((visionPlayer?.streamingData ?? watchPlayer?.streamingData) ?? {}) as {
    formats?: AdaptiveFormat[];
    adaptiveFormats?: AdaptiveFormat[];
  };
  const audio = pickAudio(streaming.adaptiveFormats ?? []);
  const qualities = buildQualityOptions(
    streaming.formats ?? [],
    streaming.adaptiveFormats ?? [],
    audio,
  );
  const defaultVideo =
    qualities.find((q) => q.id === "720p") ??
    qualities.find((q) => q.mode === "video") ??
    null;
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
    author: videoDetails.author ?? null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    audioUrl: audio?.url ?? null,
    audioMimeType: audio?.mimeType ?? null,
    videoUrl: defaultVideo?.videoUrl ?? null,
    videoMimeType: defaultVideo?.mimeType ?? null,
    durationMs: Number.isFinite(lengthSec) ? lengthSec * 1000 : null,
    qualities,
    captionTracks,
    playerResponse: player,
  };
}

export type ParseProgressEvent = {
  stage: string;
  progress: number;
  message: string;
};

/**
 * Parse a YouTube video via the Rust `ear parse` binary with real-time
 * progress callbacks, falling back to `parseYouTubeVideo` when in unit tests
 * or if `ear` is unavailable.
 */
export async function parseYouTubeWithRust(
  input: string,
  onProgress?: (ev: ParseProgressEvent) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedVideo> {
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error("Not a valid YouTube URL or video id");

  if (isNativeHost() && typeof process.spawn === "function") {
    for (const bin of earBinaryCandidates()) {
      try {
        const parsed = await new Promise<ParsedVideo>((resolve, reject) => {
          let resultVideo: ParsedVideo | null = null;
          let errorMessage: string | null = null;
          const child = process.spawn(bin, ["parse", input], {
            lines: true,
            timeoutMs: 30_000,
          });
          child.on("stdout", (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            try {
              const msg = JSON.parse(trimmed) as {
                type?: string;
                stage?: string;
                progress?: number;
                message?: string;
                video?: ParsedVideo;
              };
              if (msg.type === "progress") {
                onProgress?.({
                  stage: msg.stage ?? "parsing",
                  progress: msg.progress ?? 50,
                  message: msg.message ?? "Parsing YouTube link…",
                });
              } else if (msg.type === "result" && msg.video) {
                resultVideo = {
                  ...msg.video,
                  playerResponse: msg.video.playerResponse ?? null,
                };
              } else if (msg.type === "error") {
                errorMessage = msg.message ?? "ear parse error";
              }
            } catch {
              // ignore non-json lines
            }
          });
          child.on("exit", (res) => {
            if (resultVideo) {
              resolve(resultVideo);
            } else {
              reject(
                new Error(
                  errorMessage ||
                    res.error ||
                    `ear parse exited with code ${res.code ?? -1}`,
                ),
              );
            }
          });
        });
        return parsed;
      } catch {
        // Try next candidate or fallback to TS fetch
      }
    }
  }

  onProgress?.({
    stage: "connecting",
    progress: 24,
    message: `Connecting to YouTube (${videoId})…`,
  });
  const parsed = await parseYouTubeVideo(input, fetchImpl);
  onProgress?.({
    stage: "tracks",
    progress: 92,
    message: "Loaded video resolutions & subtitle tracks",
  });
  return parsed;
}

export async function fetchJson3Captions(
  track: CaptionTrack,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  // Try Rust ear captions helper first on native host when using default fetch
  if (
    isNativeHost() &&
    fetchImpl === fetch &&
    typeof process.run === "function"
  ) {
    for (const bin of earBinaryCandidates()) {
      try {
        const out = await process.run(bin, ["captions", track.baseUrl], {
          timeoutMs: 20_000,
        });
        if (out.code === 0 && out.stdout.trim()) {
          return JSON.parse(out.stdout);
        }
      } catch {
        // Fallback to fetchImpl below
      }
    }
  }

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
  const fetchImpl = options.fetchImpl ?? fetch;
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

  const json3 = await fetchJson3Captions(track, fetchImpl);
  const cues = cuesFromJson3(json3);
  const sentences = mergeSentences(cues);
  return {
    video: updatedVideo,
    track,
    selectedQuality,
    cues,
    sentences,
  };
}

/** Parse video + preferred (or selected) captions into a lesson payload. */
export async function loadLesson(
  input: string,
  fetchImpl: typeof fetch = fetch,
  options: {
    trackId?: string | null;
    qualityId?: string | null;
  } = {},
): Promise<LoadedLesson> {
  const video = await parseYouTubeVideo(input, fetchImpl);
  return loadLessonFromParsed(video, {
    ...options,
    fetchImpl,
  });
}
