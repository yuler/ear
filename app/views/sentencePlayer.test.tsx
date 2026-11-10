import { expect, test } from "nsh/test";
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
import type { Sentence } from "../youtube/types";

const mockSentences: Sentence[] = [
  {
    index: 0,
    startMs: 1000,
    endMs: 4000,
    text: "Hello world",
    wordCount: 2,
    wpm: 120,
    difficulty: "i-1",
  },
  {
    index: 1,
    startMs: 4500,
    endMs: 8000,
    text: "How are you doing today?",
    wordCount: 5,
    wpm: 150,
    difficulty: "i+1",
  },
  {
    index: 2,
    startMs: 9000,
    endMs: 12000,
    text: "I am doing well, thank you.",
    wordCount: 6,
    wpm: 120,
    difficulty: "i-1",
  },
];

test("formatSentenceTime formats ms into m:ss correctly", () => {
  expect(formatSentenceTime(0)).toBe("0:00");
  expect(formatSentenceTime(1400)).toBe("0:01");
  expect(formatSentenceTime(65000)).toBe("1:05");
  expect(formatSentenceTime(360000)).toBe("6:00");
});

test("formatTimeRange formats sentence range", () => {
  expect(formatTimeRange(1000, 4000)).toBe("0:01 - 0:04");
  expect(formatTimeRange(65000, 72000)).toBe("1:05 - 1:12");
});

test("clampSentenceIndex keeps within range", () => {
  expect(clampSentenceIndex(-1, 5)).toBe(0);
  expect(clampSentenceIndex(3, 5)).toBe(3);
  expect(clampSentenceIndex(10, 5)).toBe(4);
  expect(clampSentenceIndex(0, 0)).toBe(0);
});

test("getNextSentenceIndex and getPrevSentenceIndex handle boundaries", () => {
  expect(getPrevSentenceIndex(0)).toBeNull();
  expect(getPrevSentenceIndex(1)).toBe(0);
  expect(getPrevSentenceIndex(2)).toBe(1);

  expect(getNextSentenceIndex(0, 3)).toBe(1);
  expect(getNextSentenceIndex(1, 3)).toBe(2);
  expect(getNextSentenceIndex(2, 3)).toBeNull();
  expect(getNextSentenceIndex(0, 0)).toBeNull();
});

test("findSentenceIndexAtTime finds active sentence accurately", () => {
  expect(findSentenceIndexAtTime(mockSentences, 0)).toBe(0);
  expect(findSentenceIndexAtTime(mockSentences, 2.5)).toBe(0);
  expect(findSentenceIndexAtTime(mockSentences, 5.0)).toBe(1);
  expect(findSentenceIndexAtTime(mockSentences, 8.5)).toBe(1); // gap defaults to latest started
  expect(findSentenceIndexAtTime(mockSentences, 10.0)).toBe(2);
  expect(findSentenceIndexAtTime(mockSentences, 20.0)).toBe(2);
});

test("displaySentenceText and isSentenceMasked support mask and reveal", () => {
  const text = "Hello world";
  // Masked and not revealed -> masked
  expect(isSentenceMasked(true, false)).toBe(true);
  expect(displaySentenceText(text, true, false)).toBe("••••• •••••");

  // Masked but individually revealed -> original text
  expect(isSentenceMasked(true, true)).toBe(false);
  expect(displaySentenceText(text, true, true)).toBe(text);

  // Not masked globally -> original text regardless of reveal
  expect(isSentenceMasked(false, false)).toBe(false);
  expect(displaySentenceText(text, false, false)).toBe(text);
});
