import type { CaptionCue, Difficulty, Sentence } from "./types";

/** Pause longer than this (ms) starts a new sentence without punctuation. */
export const SENTENCE_GAP_MS = 380;

/** Expand each sentence's playback window by this many ms on both ends. */
export const SENTENCE_PAD_MS = 150;

/** Max words per sentence chunk before forcing split (e.g. continuous unpunctuated captions). */
export const MAX_SENTENCE_WORDS = 20;

/** Max duration in ms per sentence chunk before forcing split (7.5 seconds). */
export const MAX_SENTENCE_DURATION_MS = 7500;

/** Spec WPM bands: i-1 (<145), i+1 (145–180), Hard (>180). */
export function difficultyFromWpm(wpm: number): Difficulty {
  if (wpm < 145) return "i-1";
  if (wpm <= 180) return "i+1";
  return "Hard";
}

function isCjk(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u.test(text);
}

export function countWords(text: string): number {
  if (isCjk(text)) {
    return text.replace(/[\s.,!?;:()[\]{}"'，。！？；：、（）「」]/g, "").length;
  }
  const parts = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  return parts.length;
}

export type SentenceLengthMode = "short" | "medium" | "long";

export const SENTENCE_LENGTH_PROFILES: Record<
  SentenceLengthMode,
  {
    gapMs: number;
    maxDurationMs: number;
    maxWordsEn: number;
    maxWordsCjk: number;
    clauseMinEn: number;
    clauseMinCjk: number;
  }
> = {
  short: {
    gapMs: 250,
    maxDurationMs: 4000,
    maxWordsEn: 8,
    maxWordsCjk: 14,
    clauseMinEn: 4,
    clauseMinCjk: 6,
  },
  medium: {
    gapMs: 380,
    maxDurationMs: 7500,
    maxWordsEn: 20,
    maxWordsCjk: 30,
    clauseMinEn: 8,
    clauseMinCjk: 12,
  },
  long: {
    gapMs: 650,
    maxDurationMs: 14000,
    maxWordsEn: 36,
    maxWordsCjk: 55,
    clauseMinEn: 22,
    clauseMinCjk: 30,
  },
};

export type MergeSentencesConfig = {
  gapMs?: number;
  padMs?: number;
  mode?: SentenceLengthMode;
};

export function endsSentence(text: string): boolean {
  return /[.!?…\u3002\uff01\uff1f]["')\]」』]*\s*$/u.test(text.trim());
}

export function endsClause(text: string): boolean {
  return /[,;:—\u3001\uff0c\uff1b\uff1a-]["')\]」』]*\s*$/u.test(text.trim());
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

function normalizeCues(cues: CaptionCue[], mode: SentenceLengthMode): CaptionCue[] {
  if (mode !== "short") return cues;
  const out: CaptionCue[] = [];
  for (const c of cues) {
    const text = c.text.trim();
    const words = countWords(text);
    if (words <= 8 || !/[,;:—\u3001\uff0c\uff1b\uff1a-]/.test(text)) {
      out.push(c);
      continue;
    }
    const parts = text.match(/[^,;:—\u3001\uff0c\uff1b\uff1a-]+[,;:—\u3001\uff0c\uff1b\uff1a-]*/g);
    if (!parts || parts.length <= 1) {
      out.push(c);
      continue;
    }
    const totalDuration = Math.max(c.endMs - c.startMs, 10);
    const totalChars = Math.max(text.length, 1);
    let offsetMs = c.startMs;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!.trim();
      if (!p) continue;
      const frac = p.length / totalChars;
      const dur = Math.max(100, Math.round(frac * totalDuration));
      const end = i === parts.length - 1 ? c.endMs : Math.min(c.endMs, offsetMs + dur);
      out.push({
        startMs: offsetMs,
        endMs: end,
        text: p,
      });
      offsetMs = end;
    }
  }
  return out;
}

/**
 * Merge cues into sentences: split on .!?… or on a pause > SENTENCE_GAP_MS.
 * Supports configurable sentence length:
 * - "short": short bite-sized phrases for initial training & repetition (default)
 * - "medium": natural clause & pause boundaries
 * - "long": combined compound sentences & paragraph context
 */
export function mergeSentences(
  cues: CaptionCue[],
  configOrGapMs: number | MergeSentencesConfig = {},
  legacyPadMs: number = SENTENCE_PAD_MS,
): Sentence[] {
  if (cues.length === 0) return [];

  const isLegacy = typeof configOrGapMs === "number";
  const mode: SentenceLengthMode = isLegacy
    ? "medium"
    : configOrGapMs.mode ?? "short";
  const profile = SENTENCE_LENGTH_PROFILES[mode];
  const gapMs = isLegacy ? configOrGapMs : (configOrGapMs.gapMs ?? profile.gapMs);
  const padMs = isLegacy ? legacyPadMs : (configOrGapMs.padMs ?? SENTENCE_PAD_MS);

  const normalized = normalizeCues(cues, mode);
  const sentences: Sentence[] = [];
  let buf = "";
  let rawStartMs = normalized[0]!.startMs;
  let rawEndMs = normalized[0]!.endMs;

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

  for (let i = 0; i < normalized.length; i++) {
    const cue = normalized[i]!;
    if (buf.length === 0) {
      rawStartMs = cue.startMs;
      rawEndMs = cue.endMs;
    } else {
      const gap = cue.startMs - rawEndMs;
      const curDuration = rawEndMs - rawStartMs;
      const curWords = countWords(buf);
      const cjk = isCjk(buf);
      const maxWords = cjk ? profile.maxWordsCjk : profile.maxWordsEn;
      const clauseMin = cjk ? profile.clauseMinCjk : profile.clauseMinEn;

      if (gap > gapMs || curDuration >= profile.maxDurationMs || curWords >= maxWords) {
        flush();
        rawStartMs = cue.startMs;
        rawEndMs = cue.endMs;
      } else if (curWords >= clauseMin && endsClause(buf)) {
        flush();
        rawStartMs = cue.startMs;
        rawEndMs = cue.endMs;
      }
    }
    buf = appendWithoutOverlap(buf, cue.text);
    rawEndMs = Math.max(rawEndMs, cue.endMs);
    if (endsSentence(cue.text)) {
      const curWords = countWords(buf);
      const curDuration = rawEndMs - rawStartMs;
      if (mode !== "long" || curWords >= profile.clauseMinEn || curDuration >= 6000) {
        flush();
      }
    }
  }
  flush();
  return sentences;
}
