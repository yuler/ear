import { expect, test } from "nsh/test";
import type { Sentence } from "../youtube/types";
import {
  clampSentenceIndex,
  displaySentenceText,
  findSentenceIndexAtTime,
  formatSentenceTime,
  formatTimeRange,
  getNextSentenceIndex,
  getPrevSentenceIndex,
  isSentenceMasked,
} from "./sentencePlayer";
import { VideoDetailView } from "./VideoDetailView";

const sentences: Sentence[] = [
  {
    index: 0,
    startMs: 0,
    endMs: 3200,
    text: "Welcome to English listening practice.",
    wordCount: 5,
    wpm: 93,
    difficulty: "i-1",
  },
  {
    index: 1,
    startMs: 3500,
    endMs: 7800,
    text: "Today we will practice listening without subtitles first.",
    wordCount: 8,
    wpm: 111,
    difficulty: "i+1",
  },
  {
    index: 2,
    startMs: 8000,
    endMs: 11500,
    text: "Then you can reveal and repeat.",
    wordCount: 6,
    wpm: 102,
    difficulty: "i-1",
  },
];

test("VideoDetailView exports valid component function", () => {
  expect(typeof VideoDetailView).toBe("function");
});

test("Sentence navigation handles previous, next, and bounds correctly", () => {
  // First sentence: previous is null
  expect(getPrevSentenceIndex(0)).toBeNull();
  expect(getNextSentenceIndex(0, sentences.length)).toBe(1);

  // Middle sentence: both previous and next exist
  expect(getPrevSentenceIndex(1)).toBe(0);
  expect(getNextSentenceIndex(1, sentences.length)).toBe(2);

  // Last sentence: next is null
  expect(getPrevSentenceIndex(2)).toBe(1);
  expect(getNextSentenceIndex(2, sentences.length)).toBeNull();

  // Clamping
  expect(clampSentenceIndex(-5, sentences.length)).toBe(0);
  expect(clampSentenceIndex(99, sentences.length)).toBe(2);
});

test("Masking logic supports '打码' and '去听' workflow", () => {
  const sentence = sentences[0]!;

  // 1. By default maskAll is true -> sentence is masked with bullets
  expect(isSentenceMasked(true, false)).toBe(true);
  const maskedText = displaySentenceText(sentence.text, true, false);
  expect(maskedText).not.toContain("Welcome");
  expect(maskedText).toBe("••••••• •• ••••••• ••••••••• •••••••••");

  // 2. Individual sentence revealed -> displays original text
  expect(isSentenceMasked(true, true)).toBe(false);
  expect(displaySentenceText(sentence.text, true, true)).toBe(sentence.text);

  // 3. Global mask disabled -> displays original text
  expect(isSentenceMasked(false, false)).toBe(false);
  expect(displaySentenceText(sentence.text, false, false)).toBe(sentence.text);
});

test("findSentenceIndexAtTime tracks active sentence during playback", () => {
  // At start
  expect(findSentenceIndexAtTime(sentences, 1.5)).toBe(0);

  // During sentence 1
  expect(findSentenceIndexAtTime(sentences, 5.0)).toBe(1);

  // During sentence 2
  expect(findSentenceIndexAtTime(sentences, 9.5)).toBe(2);
});

test("formatTimeRange formats sentence timing cleanly", () => {
  expect(formatTimeRange(sentences[0]!.startMs, sentences[0]!.endMs)).toBe(
    "0:00 - 0:03",
  );
  expect(formatSentenceTime(125000)).toBe("2:05");
});
