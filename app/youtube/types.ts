/** One timed caption cue before sentence merge. */
export type CaptionCue = {
  startMs: number;
  endMs: number;
  text: string;
};

/** Spec difficulty labels (WPM): i-1 <145, i+1 145–180, Hard >180. */
export type Difficulty = "i-1" | "i+1" | "Hard";

/** One practice sentence after merge. */
export type Sentence = {
  index: number;
  /** Playback window start (cue start − 150ms, floored at 0). */
  startMs: number;
  /** Playback window end (cue end + 150ms). */
  endMs: number;
  text: string;
  wordCount: number;
  /** Words per minute over the unpadded cue span. */
  wpm: number;
  difficulty: Difficulty;
};

export type VideoQualityOption = {
  /** e.g. "1080p", "720p", "480p", "360p", "240p", "audio" */
  id: string;
  /** Display label, e.g. "1080p", "720p", "Audio (M4A)" */
  label: string;
  mode: "video" | "audio";
  height?: number | null;
  fps?: number | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  mimeType: string;
  ext: string;
  sizeBytes?: number | null;
};

export type CaptionTrack = {
  trackId?: string;
  languageCode: string;
  name: string;
  /** Base URL; append &fmt=json3 for timed text. */
  baseUrl: string;
  kind?: string;
  vssId?: string;
  /** True when CC auto-generated / machine-translated (kind === "asr" or vssId starts with "a."). */
  isAuto?: boolean;
};

export type ParsedVideo = {
  videoId: string;
  title: string;
  author?: string | null;
  thumbnailUrl?: string;
  /** Best audio/mp4 (or audio/*) progressive URL from adaptiveFormats. */
  audioUrl: string | null;
  audioMimeType: string | null;
  videoUrl?: string | null;
  videoMimeType?: string | null;
  durationMs: number | null;
  qualities?: VideoQualityOption[];
  captionTracks: CaptionTrack[];
  /** Raw player response kept for debugging / later fields. */
  playerResponse: unknown;
};

export type LoadedLesson = {
  video: ParsedVideo;
  track: CaptionTrack | null;
  selectedQuality?: VideoQualityOption | null;
  cues: CaptionCue[];
  sentences: Sentence[];
};
