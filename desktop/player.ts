/** Playback rates used by video player, Loop Dojo, and Blind Flow. */
export type PlaybackRate = 0.8 | 1 | 1.2 | 1.5 | 2;

export type AudioEngineState = {
  url: string | null;
  playing: boolean;
  positionMs: number;
  rate: PlaybackRate;
  loopAMs: number | null;
  loopBMs: number | null;
};

/** What a single-src `<Video>` can actually play right now. */
export type PlaybackSource = {
  /** URL for `<Video src>` — always includes audio when possible. */
  url: string | null;
  /** True when `url` is a muxed/local video (picture + sound). */
  hasPicture: boolean;
};

export function createAudioEngineState(): AudioEngineState {
  return {
    url: null,
    playing: false,
    positionMs: 0,
    rate: 1,
    loopAMs: null,
    loopBMs: null,
  };
}

function isFileUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith("file://");
}

/**
 * Normalize a local media path for nsh `<Video src>`.
 *
 * On hosts with `capabilities` declared, `file://` is treated like a network
 * URL and is denied. Pass an absolute filesystem path that sits inside
 * `capabilities.fs.read` (e.g. `${homeDir}/Downloads/...` or `${dataDir}/...`).
 */
export function toVideoSrc(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(trimmed).pathname);
    } catch {
      return trimmed.replace(/^file:\/\//, "");
    }
  }
  return trimmed;
}

/** @deprecated Use toVideoSrc — nsh Video wants bare paths, not file://. */
export function toFileUrl(path: string | null | undefined): string | null {
  const src = toVideoSrc(path);
  if (!src) return null;
  return src.startsWith("file://") ? src : `file://${src}`;
}

/** Prefer local video, then local audio, as a bare path for in-app `<Video>`. */
export function localMediaFileUrl(entry: {
  videoPath?: string | null;
  audioPath?: string | null;
}): string | null {
  return toVideoSrc(entry.videoPath) ?? toVideoSrc(entry.audioPath);
}

/**
 * Candidate absolute paths to try for in-app playback, preferred first.
 * dataDir copies (under …/library/<id>/) are listed ahead of ~/Downloads when both exist.
 */
export function localMediaCandidates(entry: {
  videoId: string;
  videoPath?: string | null;
  audioPath?: string | null;
  dataDir?: string | null;
}): string[] {
  const out: string[] = [];
  const push = (p: string | null | undefined) => {
    const src = toVideoSrc(p);
    if (src && !out.includes(src)) out.push(src);
  };
  if (entry.dataDir) {
    push(`${entry.dataDir}/library/${entry.videoId}/video.mp4`);
    push(`${entry.dataDir}/library/${entry.videoId}/audio.m4a`);
  }
  push(entry.videoPath);
  push(entry.audioPath);
  return out;
}

/**
 * Pick a single playable media URL for nsh `<Video>`.
 *
 * YouTube adaptive qualities expose separate video-only + audio URLs. A single
 * `<Video src>` cannot mux them, so preferring `videoUrl` yields silent (or
 * broken) playback. Until a local muxed file:// exists, fall back to audio.
 */
export function resolvePlaybackSource(video: {
  videoUrl?: string | null;
  audioUrl?: string | null;
}): PlaybackSource {
  const videoUrl = video.videoUrl ?? null;
  const audioUrl = video.audioUrl ?? null;

  // Local paths → bare filesystem path (nsh Video rejects file:// under capabilities)
  if (isFileUrl(videoUrl) || (videoUrl?.startsWith("/") ?? false)) {
    return { url: toVideoSrc(videoUrl), hasPicture: true };
  }
  if (isFileUrl(audioUrl) || (audioUrl?.startsWith("/") ?? false)) {
    return { url: toVideoSrc(audioUrl), hasPicture: false };
  }

  // Remote adaptive pair: video-only + separate audio → play audio for listening
  if (videoUrl && audioUrl && videoUrl !== audioUrl) {
    return { url: audioUrl, hasPicture: false };
  }

  if (videoUrl) return { url: videoUrl, hasPicture: true };
  if (audioUrl) return { url: audioUrl, hasPicture: false };
  return { url: null, hasPicture: false };
}

/** Convert ms → seconds for Video.seek. */
export function msToSeconds(ms: number): number {
  return Math.max(0, ms) / 1000;
}

/**
 * True when progress has reached or passed the clip end (with a small slack).
 * Used to pause after playing one sentence window.
 */
export function clipEnded(
  currentTimeSec: number,
  endMs: number,
  slackMs = 40,
): boolean {
  return currentTimeSec * 1000 >= endMs - slackMs;
}
