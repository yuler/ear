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

export type CaptionTrack = {
  languageCode: string;
  name: string;
  /** Base URL; append &fmt=json3 for timed text. */
  baseUrl: string;
  kind?: string;
};

export type ParsedVideo = {
  videoId: string;
  title: string;
  author?: string | null;
  /** Best audio/mp4 (or audio/*) progressive URL from adaptiveFormats. */
  audioUrl: string | null;
  audioMimeType: string | null;
  videoUrl?: string | null;
  videoMimeType?: string | null;
  durationMs: number | null;
  captionTracks: CaptionTrack[];
  /** Raw player response kept for debugging / later fields. */
  playerResponse: unknown;
};

export type LoadedLesson = {
  video: ParsedVideo;
  track: CaptionTrack | null;
  cues: CaptionCue[];
  sentences: Sentence[];
};
