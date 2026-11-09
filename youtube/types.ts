/** One timed caption cue before sentence merge. */
export type CaptionCue = {
  startMs: number;
  endMs: number;
  text: string;
};

/** One practice sentence after merge. */
export type Sentence = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  wordCount: number;
  /** Words per minute over this sentence's span. */
  wpm: number;
  difficulty: "easy" | "medium" | "hard";
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
  /** Best audio/mp4 (or audio/*) progressive URL from adaptiveFormats. */
  audioUrl: string | null;
  audioMimeType: string | null;
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
