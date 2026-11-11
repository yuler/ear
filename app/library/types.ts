/** Entry lifecycle: captions ready to practice, or failed. */
export type LibraryEntryState = "pending" | "ready" | "error";

export type DownloadStage =
  | "starting"
  | "downloading"
  | "merging"
  | "done"
  | "error";

export type DownloadTaskProgress = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  qualityLabel: string;
  subtitleLabel: string;
  subtitleIsAuto: boolean;
  targetPath: string;
  stage: DownloadStage;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
  error?: string | null;
};

/**
 * One library record — Downbit-style per-task metadata.
 * Stored at `dataDir/library/<videoId>.json`.
 */
export type LibraryEntry = {
  videoId: string;
  url: string;
  title: string;
  /** Video poster / thumbnail URL (defaults to YouTube hqdefault.jpg). */
  thumbnailUrl?: string | null;
  site: "YouTube" | "SoundCloud" | string;
  state: LibraryEntryState;
  /** Absolute path to captions JSON, or null. */
  captionsPath: string | null;
  /** Absolute path to local video, or null. */
  videoPath: string | null;
  /** Absolute path to local audio, or null. */
  audioPath: string | null;
  /** Remote video URL for streaming when videoPath is null. */
  videoUrl: string | null;
  /** Remote audio URL for streaming when audioPath is null. */
  audioUrl: string | null;
  audioMimeType: string | null;
  durationMs: number | null;
  /** Selected quality label (e.g. "720p", "1080p", "Audio (M4A)"). */
  quality?: string | null;
  /** Selected subtitle summary (e.g. "English · 人工", "English · CC 机翻"). */
  subtitleLabel?: string | null;
  /** Whether the selected subtitle track is auto-generated CC. */
  subtitleIsAuto?: boolean | null;
  /** Downloaded media file size in bytes. */
  sizeBytes?: number | null;
  /** Why media was not saved, or parse/download error detail. */
  note: string | null;
  createdAt: number;
  updatedAt: number;
};

/** One line in `archive.jsonl` — dedup index, not full history. */
export type ArchiveRecord = {
  k: ["youtube", string];
  p: string | null;
  captions: string | null;
};
