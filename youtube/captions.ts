import type { CaptionCue, Difficulty, Sentence } from "./types";

/** Pause longer than this (ms) starts a new sentence without punctuation. Spec: >650ms. */
export const SENTENCE_GAP_MS = 650;

/** Expand each sentence's playback window by this many ms on both ends. */
export const SENTENCE_PAD_MS = 150;

/** Spec WPM bands: i-1 (<145), i+1 (145–180), Hard (>180). */
export function difficultyFromWpm(wpm: number): Difficulty {
  if (wpm < 145) return "i-1";
  if (wpm <= 180) return "i+1";
  return "Hard";
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

/**
 * Append rolling-caption text without repeating an overlapping word suffix/prefix.
 * YouTube auto-captions often restate the tail of the previous cue.
 */
export function appendWithoutOverlap(prev: string, next: string): string {
  const a = prev.trim();
  const b = next.trim();
  if (!a) return b;
  if (!b) return a;
  if (a.toLowerCase().endsWith(b.toLowerCase())) return a;

  const aWords = a.split(/\s+/);
  const bWords = b.split(/\s+/);
  const max = Math.min(aWords.length, bWords.length);
  let overlap = 0;
  for (let n = max; n > 0; n--) {
    const left = aWords.slice(-n).join(" ").toLowerCase();
    const right = bWords.slice(0, n).join(" ").toLowerCase();
    if (left === right) {
      overlap = n;
      break;
    }
  }
  if (overlap === 0) return `${a} ${b}`;
  const rest = bWords.slice(overlap).join(" ");
  return rest ? `${a} ${rest}` : a;
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
 * Merge cues into sentences: split on .!?… or on a pause > SENTENCE_GAP_MS.
 * Playback window is padded ±SENTENCE_PAD_MS; WPM uses the unpadded span.
 */
export function mergeSentences(
  cues: CaptionCue[],
  gapMs: number = SENTENCE_GAP_MS,
  padMs: number = SENTENCE_PAD_MS,
): Sentence[] {
  if (cues.length === 0) return [];

  const sentences: Sentence[] = [];
  let buf = "";
  let rawStartMs = cues[0]!.startMs;
  let rawEndMs = cues[0]!.endMs;

  const flush = () => {
    const text = buf.replace(/\s+/g, " ").trim();
    if (!text) return;
    const wordCount = countWords(text);
    const durationMs = Math.max(rawEndMs - rawStartMs, 1);
    const wpm = (wordCount * 60_000) / durationMs;
    sentences.push({
      index: sentences.length,
      startMs: Math.max(0, rawStartMs - padMs),
      endMs: rawEndMs + padMs,
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
      rawStartMs = cue.startMs;
    } else if (cue.startMs - rawEndMs > gapMs) {
      flush();
      rawStartMs = cue.startMs;
    }
    buf = appendWithoutOverlap(buf, cue.text);
    rawEndMs = Math.max(rawEndMs, cue.endMs);
    if (endsSentence(cue.text)) {
      flush();
    }
  }
  flush();
  return sentences;
}
