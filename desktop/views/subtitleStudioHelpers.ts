import type { Sentence } from "../youtube/types";

/** Normalize a word token for star/selection lookup (strips surrounding punctuation). */
export function normalizeWordToken(raw: string): string {
  return raw.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
}

/** Split a sentence into clickable display tokens. */
export function splitSentenceTokens(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export type SpokenWordProgress = {
  /** Normalized progress within the sentence speech window (0..1). */
  progress: number;
  /** Currently spoken word index: -1 before speech starts, tokens.length after speech ends. */
  spokenIndex: number;
};

/**
 * Estimate which word is currently being spoken within a sentence using
 * character-weighted timing (longer words receive proportionally more time).
 */
export function computeSpokenWordProgress(
  sentence: Pick<Sentence, "startMs" | "endMs">,
  currentTimeSec: number,
  tokens: readonly string[],
): SpokenWordProgress {
  if (tokens.length === 0) return { progress: 0, spokenIndex: -1 };
  const span = Math.max(100, sentence.endMs - sentence.startMs);
  const pad = Math.min(150, Math.floor(span * 0.15));
  const speechStart = sentence.startMs + pad;
  const speechEnd = Math.max(speechStart + 100, sentence.endMs - pad);
  const nowMs = currentTimeSec * 1000;

  if (nowMs < speechStart) {
    return { progress: 0, spokenIndex: -1 };
  }
  if (nowMs >= speechEnd) {
    return { progress: 1, spokenIndex: tokens.length };
  }

  const progress = (nowMs - speechStart) / (speechEnd - speechStart);
  const weights = tokens.map((tok) => Math.max(2, normalizeWordToken(tok).length));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const target = progress * totalWeight;

  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (target <= acc) {
      return { progress, spokenIndex: i };
    }
  }
  return { progress, spokenIndex: tokens.length - 1 };
}
