import type { Sentence } from "../youtube/types";

/** Blind Flow comprehension tags. */
export type BlindTag = "pass" | "lag" | "blind";

export type BlindTagCounts = {
  pass: number;
  lag: number;
  blind: number;
};

export type BlindFlowSession = {
  /** Sentence index currently practicing (0-based). */
  index: number;
  /** Tags keyed by sentence index. */
  tags: Record<number, BlindTag>;
  /** Caption starts blurred; reveal clears blur for the current sentence. */
  revealed: boolean;
};

export function createBlindFlowSession(): BlindFlowSession {
  return { index: 0, tags: {}, revealed: false };
}

export function countTags(tags: Record<number, BlindTag>): BlindTagCounts {
  const counts: BlindTagCounts = { pass: 0, lag: 0, blind: 0 };
  for (const t of Object.values(tags)) {
    counts[t] += 1;
  }
  return counts;
}

/**
 * Record a tag for the current sentence and advance.
 * Resets revealed for the next sentence. Stays on last index when done.
 */
export function applyTag(
  session: BlindFlowSession,
  tag: BlindTag,
  sentenceCount: number,
): BlindFlowSession {
  if (sentenceCount <= 0) return session;
  const index = Math.min(session.index, sentenceCount - 1);
  const tags = { ...session.tags, [index]: tag };
  const next = index + 1;
  if (next >= sentenceCount) {
    return { index, tags, revealed: session.revealed };
  }
  return { index: next, tags, revealed: false };
}

export function revealCaption(session: BlindFlowSession): BlindFlowSession {
  if (session.revealed) return session;
  return { ...session, revealed: true };
}

export function hideCaption(session: BlindFlowSession): BlindFlowSession {
  if (!session.revealed) return session;
  return { ...session, revealed: false };
}

export function isComplete(
  session: BlindFlowSession,
  sentenceCount: number,
): boolean {
  if (sentenceCount <= 0) return true;
  return Object.keys(session.tags).length >= sentenceCount;
}

export function currentSentence(
  sentences: Sentence[],
  session: BlindFlowSession,
): Sentence | null {
  if (sentences.length === 0) return null;
  const i = Math.min(session.index, sentences.length - 1);
  return sentences[i] ?? null;
}

/** Restart practice; keeps nothing from the previous run. */
export function restartBlindFlow(): BlindFlowSession {
  return createBlindFlowSession();
}

/**
 * Cross-platform caption mask: never mounts real words when hidden.
 * Replaces each non-space run with the same number of bullets so layout
 * stays roughly stable without relying on CSS `filter` blur.
 */
export function maskCaption(text: string): string {
  return text.replace(/\S/g, "•");
}

