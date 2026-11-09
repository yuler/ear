/** One locally cached lesson: paths under the app dataDir. */
export type LibraryEntry = {
  videoId: string;
  title: string;
  /** Absolute path to captions JSON, or null. */
  captionsPath: string | null;
  /** Absolute path to audio bytes, or null when not saved / too large. */
  audioPath: string | null;
  /** Remote audio URL kept for streaming when audioPath is null. */
  audioUrl: string | null;
  audioMimeType: string | null;
  /** Absolute path to local video MP4 (with audio), or null. */
  videoPath?: string | null;
  /** Remote video URL or progressive stream URL. */
  videoUrl?: string | null;
  updatedAt: number;
};

export type LibraryIndex = {
  version: 1;
  entries: Record<string, LibraryEntry>;
};
