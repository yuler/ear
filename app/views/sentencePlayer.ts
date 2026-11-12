import type { CaptionCue, Sentence } from "../youtube/types";
import { clipEnded, msToSeconds } from "../player";
import {
  countWords,
  difficultyFromWpm,
  endsSentence,
  mergeSentences,
  type SentenceLengthMode,
} from "../youtube/captions";
import { maskCaption } from "./blindFlowLogic";

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

/**
 * Re-segment sentences dynamically according to the chosen length mode.
 * Prefers raw CaptionCue[] when available; falls back to slicing/combining existing Sentence[].
 */
export function resegmentSentences(
  cues: CaptionCue[],
  fallbackSentences: Sentence[],
  mode: SentenceLengthMode,
): Sentence[] {
  if (cues && cues.length > 0) {
    return mergeSentences(cues, { mode });
  }
  if (!fallbackSentences || fallbackSentences.length === 0) return [];
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

  // mode === "long": combine adjacent sentences
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
  if (cur) {
    result.push({ ...cur, index: result.length });
  }
  return result;
}

export type ProgressEvaluation =
  | { action: "pause"; newClipEndMs?: number | null }
  | { action: "advance"; activeIndex: number; newClipEndMs?: number | null }
  | { action: "none"; newClipEndMs?: number | null };

/**
 * Pure state evaluation of video playback progress against sentence boundaries.
 * Supports default continuous streaming (sentencePause=false),
 * and intensive single-sentence listening with pause (sentencePause=true).
 */
export function evaluatePlaybackProgress(params: {
  currentTimeSec: number;
  sentences: Sentence[];
  paused: boolean;
  sentencePause?: boolean;
  autoNext?: boolean;
  clipEndMs: number | null;
  activeIndex: number;
}): ProgressEvaluation {
  const {
    currentTimeSec,
    sentences,
    paused,
    clipEndMs,
    activeIndex,
  } = params;

  if (sentences.length === 0 || paused) return { action: "none" };

  // Sentence Pause mode (default is false -> continuous streaming)
  const isPauseMode =
    params.sentencePause !== undefined
      ? params.sentencePause
      : params.autoNext !== undefined
      ? !params.autoNext
      : false;

  // 2. Default continuous playback mode (sentencePause is false)
  if (!isPauseMode) {
    const lastIdx = sentences.length - 1;
    const lastSentence = sentences[lastIdx];
    if (lastSentence && clipEnded(currentTimeSec, lastSentence.endMs)) {
      return { action: "pause", newClipEndMs: null };
    }
    const idx = findSentenceIndexAtTime(sentences, currentTimeSec);
    if (idx !== activeIndex) {
      return { action: "advance", activeIndex: idx };
    }
    return { action: "none" };
  }

  // 3. Sentence Pause mode (sentencePause is true): pauses cleanly at the end of each sentence
  if (clipEndMs != null) {
    if (clipEnded(currentTimeSec, clipEndMs)) {
      return { action: "pause" };
    }
  } else {
    const idx = findSentenceIndexAtTime(sentences, currentTimeSec);
    const cur = sentences[idx];
    if (idx !== activeIndex) {
      return {
        action: "advance",
        activeIndex: idx,
        newClipEndMs: cur?.endMs ?? null,
      };
    }
    return { action: "none", newClipEndMs: cur?.endMs ?? null };
  }

  return { action: "none" };
}
