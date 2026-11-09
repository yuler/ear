import type { CaptionCue, Sentence } from "./types";

/** Gap (ms) above which a new sentence starts even without punctuation. */
export const SENTENCE_GAP_MS = 700;

/** WPM bands for ESL listening difficulty. */
export function difficultyFromWpm(wpm: number): Sentence["difficulty"] {
  if (wpm < 120) return "easy";
  if (wpm <= 160) return "medium";
  return "hard";
}

export function countWords(text: string): number {
  const parts = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  return parts.length;
}

function endsSentence(text: string): boolean {
  return /[.!?…]["')\]]*\s*$/u.test(text.trim());
}

type Json3Seg = { utf8?: string };
type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Seg[];
};

/**
 * Parse YouTube timedtext json3 into cues (one event → one cue).
 * Ignores events with no text segs (e.g. silence markers).
 */
export function cuesFromJson3(data: unknown): CaptionCue[] {
  const root = data as { events?: Json3Event[] };
  const events = root?.events ?? [];
  const cues: CaptionCue[] = [];
  for (const ev of events) {
    if (!ev.segs || ev.segs.length === 0) continue;
    const text = ev.segs
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const startMs = ev.tStartMs ?? 0;
    const endMs = startMs + (ev.dDurationMs ?? 0);
    cues.push({ startMs, endMs, text });
  }
  return cues;
}

/**
 * Merge cues into sentences: split on .!?… or on a pause ≥ SENTENCE_GAP_MS.
 */
export function mergeSentences(
  cues: CaptionCue[],
  gapMs: number = SENTENCE_GAP_MS,
): Sentence[] {
  if (cues.length === 0) return [];

  const sentences: Sentence[] = [];
  let buf = "";
  let startMs = cues[0]!.startMs;
  let endMs = cues[0]!.endMs;

  const flush = () => {
    const text = buf.replace(/\s+/g, " ").trim();
    if (!text) return;
    const wordCount = countWords(text);
    const durationMs = Math.max(endMs - startMs, 1);
    const wpm = (wordCount * 60_000) / durationMs;
    sentences.push({
      index: sentences.length,
      startMs,
      endMs,
      text,
      wordCount,
      wpm: Math.round(wpm),
      difficulty: difficultyFromWpm(wpm),
    });
    buf = "";
  };

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    if (buf.length === 0) {
      startMs = cue.startMs;
    } else if (cue.startMs - endMs >= gapMs) {
      flush();
      startMs = cue.startMs;
    }
    buf = buf.length === 0 ? cue.text : `${buf} ${cue.text}`;
    endMs = Math.max(endMs, cue.endMs);
    if (endsSentence(cue.text)) {
      flush();
    }
  }
  flush();
  return sentences;
}
