import type { Sentence } from "../youtube/types";
import { maskCaption } from "./blindFlow";

/** Format milliseconds into m:ss timestamp string (e.g. 1400 -> "0:01"). */
export function formatSentenceTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Format a sentence's start and end times into a readable range (e.g. "0:01 - 0:04"). */
export function formatTimeRange(startMs: number, endMs: number): string {
  return `${formatSentenceTime(startMs)} - ${formatSentenceTime(endMs)}`;
}

/** Clamp a sentence index within [0, total - 1]. Returns 0 when list is empty. */
export function clampSentenceIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index));
}

/** Calculate next sentence index, or null if already at the last sentence. */
export function getNextSentenceIndex(
  currentIndex: number,
  total: number,
): number | null {
  if (total <= 0) return null;
  const next = currentIndex + 1;
  return next < total ? next : null;
}

/** Calculate previous sentence index, or null if already at the first sentence. */
export function getPrevSentenceIndex(currentIndex: number): number | null {
  const prev = currentIndex - 1;
  return prev >= 0 ? prev : null;
}

/**
 * Find the sentence active at the given video time (in seconds).
 * Returns the index of the first sentence whose [startMs, endMs] covers the time,
 * or the closest preceding sentence.
 */
export function findSentenceIndexAtTime(
  sentences: Sentence[],
  currentTimeSec: number,
): number {
  if (sentences.length === 0) return 0;
  const currentMs = currentTimeSec * 1000;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    if (currentMs >= s.startMs && currentMs <= s.endMs) {
      return i;
    }
  }

  // If between sentences or after, find the latest sentence that has started
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (currentMs >= sentences[i]!.startMs) {
      return i;
    }
  }
  return 0;
}

/**
 * Determine the display text for a sentence based on global mask state
 * and individual sentence reveal override.
 */
export function displaySentenceText(
  text: string,
  isMasked: boolean,
  isRevealed: boolean,
): string {
  if (!isMasked || isRevealed) {
    return text;
  }
  return maskCaption(text);
}

/** Check whether a sentence is currently masked. */
export function isSentenceMasked(
  isMasked: boolean,
  isRevealed: boolean,
): boolean {
  return isMasked && !isRevealed;
}
