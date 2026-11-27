import { exists, readFile } from "fs/promises";

export type CaptionCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type Difficulty = "i-1" | "i+1" | "Hard";

export type Sentence = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  wordCount: number;
  wpm: number;
  difficulty: Difficulty;
};

export type SentenceLengthMode = "short" | "medium" | "long";
export type PlaybackRate = 0.8 | 1 | 1.2 | 1.5 | 2;

export const PLAYBACK_RATES: readonly PlaybackRate[] = [0.8, 1, 1.2, 1.5, 2];

const SENTENCE_PAD_MS = 150;

const SENTENCE_LENGTH_PROFILES: Record<
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
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function endsSentence(text: string): boolean {
  return /[.!?…\u3002\uff01\uff1f]["')\]」』]*\s*$/u.test(text.trim());
}

function endsClause(text: string): boolean {
  return /[,;:—\u3001\uff0c\uff1b\uff1a-]["')\]」』]*\s*$/u.test(text.trim());
}

function appendWithoutOverlap(prev: string, next: string): string {
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
      const dur = Math.max(100, Math.round((p.length / totalChars) * totalDuration));
      const end = i === parts.length - 1 ? c.endMs : Math.min(c.endMs, offsetMs + dur);
      out.push({ startMs: offsetMs, endMs: end, text: p });
      offsetMs = end;
    }
  }
  return out;
}

/** Merge caption cues into practice sentences matching Desktop's segmentation algorithm. */
export function mergeSentences(
  cues: CaptionCue[],
  mode: SentenceLengthMode = "short",
): Sentence[] {
  if (cues.length === 0) return [];
  const profile = SENTENCE_LENGTH_PROFILES[mode];
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
      startMs: Math.max(0, rawStartMs - SENTENCE_PAD_MS),
      endMs: rawEndMs + SENTENCE_PAD_MS,
      text,
      wordCount,
      wpm: Math.round(wpm),
      difficulty: difficultyFromWpm(wpm),
    });
    buf = "";
  };

  for (const cue of normalized) {
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

      if (gap > profile.gapMs || curDuration >= profile.maxDurationMs || curWords >= maxWords) {
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

/** Re-segment sentences according to the chosen length mode (short / medium / long). */
export function resegmentSentences(
  cues: CaptionCue[],
  fallbackSentences: Sentence[],
  mode: SentenceLengthMode,
): Sentence[] {
  if (cues.length > 0) return mergeSentences(cues, mode);
  if (fallbackSentences.length === 0) return [];
  if (mode === "medium") return fallbackSentences;

  if (mode === "short") {
    const result: Sentence[] = [];
    for (const s of fallbackSentences) {
      if (s.wordCount <= 8) {
        result.push({ ...s, index: result.length });
        continue;
      }
      const clauses = s.text.match(/[^,;:—\u3001\uff0c\uff1b\uff1a-]+[,;:—\u3001\uff0c\uff1b\uff1a-]*/g);
      if (!clauses || clauses.length <= 1) {
        result.push({ ...s, index: result.length });
        continue;
      }
      const totalDur = Math.max(s.endMs - s.startMs, 10);
      const totalLen = Math.max(s.text.length, 1);
      let start = s.startMs;
      for (let i = 0; i < clauses.length; i++) {
        const c = clauses[i]!.trim();
        if (!c) continue;
        const dur = Math.round((c.length / totalLen) * totalDur);
        const end = i === clauses.length - 1 ? s.endMs : start + dur;
        const wc = countWords(c);
        const wpm = (wc * 60_000) / Math.max(end - start, 1);
        result.push({
          index: result.length,
          startMs: start,
          endMs: end,
          text: c,
          wordCount: wc,
          wpm: Math.round(wpm),
          difficulty: difficultyFromWpm(wpm),
        });
        start = end;
      }
    }
    return result;
  }

  const result: Sentence[] = [];
  let cur: Sentence | null = null;
  for (const s of fallbackSentences) {
    if (!cur) {
      cur = { ...s };
      continue;
    }
    const gap: number = s.startMs - cur.endMs;
    const combinedDuration: number = s.endMs - cur.startMs;
    if (gap <= 650 && combinedDuration <= 14000) {
      const combinedText = `${cur.text} ${s.text}`.trim();
      const wc = countWords(combinedText);
      const wpm: number = (wc * 60_000) / Math.max(combinedDuration, 1);
      cur = {
        index: result.length,
        startMs: cur.startMs,
        endMs: s.endMs,
        text: combinedText,
        wordCount: wc,
        wpm: Math.round(wpm),
        difficulty: difficultyFromWpm(wpm),
      };
      if (endsSentence(s.text)) {
        result.push(cur);
        cur = null;
      }
    } else {
      result.push({ ...cur, index: result.length });
      cur = { ...s };
    }
  }
  if (cur) result.push({ ...cur, index: result.length });
  return result;
}

export function formatSentenceTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTimeRange(startMs: number, endMs: number): string {
  return `${formatSentenceTime(startMs)} - ${formatSentenceTime(endMs)}`;
}

export function clampSentenceIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index));
}

export function findSentenceIndexAtTime(sentences: Sentence[], currentTimeSec: number): number {
  if (sentences.length === 0) return 0;
  const currentMs = currentTimeSec * 1000;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    if (currentMs >= s.startMs && currentMs <= s.endMs) return i;
  }
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (currentMs >= sentences[i]!.startMs) return i;
  }
  return 0;
}

export function clipEnded(currentTimeSec: number, endMs: number, slackMs = 40): boolean {
  return currentTimeSec * 1000 >= endMs - slackMs;
}

export type ProgressEvaluation =
  | { action: "pause"; newClipEndMs?: number | null }
  | { action: "advance"; activeIndex: number; newClipEndMs?: number | null }
  | { action: "none"; newClipEndMs?: number | null };

export function evaluatePlaybackProgress(params: {
  currentTimeSec: number;
  sentences: Sentence[];
  paused: boolean;
  sentencePause: boolean;
  clipEndMs: number | null;
  activeIndex: number;
}): ProgressEvaluation {
  const { currentTimeSec, sentences, paused, sentencePause, clipEndMs, activeIndex } = params;
  if (sentences.length === 0 || paused) return { action: "none" };

  if (!sentencePause) {
    const last = sentences[sentences.length - 1];
    if (last && clipEnded(currentTimeSec, last.endMs)) {
      return { action: "pause", newClipEndMs: null };
    }
    const idx = findSentenceIndexAtTime(sentences, currentTimeSec);
    if (idx !== activeIndex) {
      return { action: "advance", activeIndex: idx };
    }
    return { action: "none" };
  }

  if (clipEndMs != null) {
    if (clipEnded(currentTimeSec, clipEndMs)) {
      return { action: "pause" };
    }
    return { action: "none" };
  }

  const idx = findSentenceIndexAtTime(sentences, currentTimeSec);
  const cur = sentences[idx];
  if (idx !== activeIndex) {
    return { action: "advance", activeIndex: idx, newClipEndMs: cur?.endMs ?? null };
  }
  return { action: "none", newClipEndMs: cur?.endMs ?? null };
}

export function cycleRate(current: PlaybackRate): PlaybackRate {
  const i = PLAYBACK_RATES.indexOf(current);
  if (i === -1) return 1;
  return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length]!;
}

export function normalizeWordToken(raw: string): string {
  return raw.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
}

export function splitSentenceTokens(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function computeSpokenWordProgress(
  sentence: Pick<Sentence, "startMs" | "endMs">,
  currentTimeSec: number,
  tokens: readonly string[],
): { progress: number; spokenIndex: number } {
  if (tokens.length === 0) return { progress: 0, spokenIndex: -1 };
  const span = Math.max(100, sentence.endMs - sentence.startMs);
  const pad = Math.min(150, Math.floor(span * 0.15));
  const speechStart = sentence.startMs + pad;
  const speechEnd = Math.max(speechStart + 100, sentence.endMs - pad);
  const nowMs = currentTimeSec * 1000;

  if (nowMs < speechStart) return { progress: 0, spokenIndex: -1 };
  if (nowMs >= speechEnd) return { progress: 1, spokenIndex: tokens.length };

  const progress = (nowMs - speechStart) / (speechEnd - speechStart);
  const weights = tokens.map((tok) => Math.max(2, normalizeWordToken(tok).length));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const target = progress * totalWeight;

  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (target <= acc) return { progress, spokenIndex: i };
  }
  return { progress, spokenIndex: tokens.length - 1 };
}

export interface LoadedLocalCaptions {
  cues: CaptionCue[];
  rawSentences: Sentence[];
  sentences: Sentence[];
}

export function parseCaptionsPayload(
  raw: string,
  mode: SentenceLengthMode,
): LoadedLocalCaptions {
  const parsed = JSON.parse(raw) as {
    cues?: CaptionCue[];
    sentences?: Sentence[];
  };
  const cues = Array.isArray(parsed?.cues)
    ? parsed.cues.filter(
        (c) =>
          c &&
          typeof c.startMs === "number" &&
          typeof c.endMs === "number" &&
          typeof c.text === "string" &&
          c.text.trim().length > 0,
      )
    : [];
  const rawSentences = Array.isArray(parsed?.sentences)
    ? parsed.sentences.filter(
        (s) =>
          s &&
          typeof s.startMs === "number" &&
          typeof s.endMs === "number" &&
          typeof s.text === "string" &&
          s.text.trim().length > 0,
      )
    : [];
  const sentences = resegmentSentences(cues, rawSentences, mode);
  return { cues, rawSentences, sentences };
}

/** Load and segment local mirrored `captions.json` from the iOS app sandbox. */
export async function loadLocalCaptions(
  captionsPath: string | null,
  mode: SentenceLengthMode,
): Promise<LoadedLocalCaptions> {
  if (!captionsPath || captionsPath.startsWith("memory://")) {
    return { cues: [], rawSentences: [], sentences: [] };
  }
  try {
    if (!(await exists(captionsPath))) {
      return { cues: [], rawSentences: [], sentences: [] };
    }
    const raw = await readFile(captionsPath, "utf8");
    return parseCaptionsPayload(raw, mode);
  } catch {
    return { cues: [], rawSentences: [], sentences: [] };
  }
}
