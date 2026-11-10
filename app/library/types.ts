/** Entry lifecycle: captions ready to practice, or failed. */
export type LibraryEntryState = "pending" | "ready" | "error";

/**
 * One library record — Downbit-style per-task metadata.
 * Stored at `dataDir/library/<videoId>.json`.
 */
export type LibraryEntry = {
  videoId: string;
  url: string;
  title: string;
  site: "YouTube";
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
