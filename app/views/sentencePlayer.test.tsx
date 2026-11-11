import { expect, test } from "nsh/test";
import {
  clampSentenceIndex,
  displaySentenceText,
  evaluatePlaybackProgress,
  findSentenceIndexAtTime,
  formatSentenceTime,
  formatTimeRange,
  getNextSentenceIndex,
  getPrevSentenceIndex,
  isSentenceMasked,
  resegmentSentences,
} from "./sentencePlayer";
import type { CaptionCue, Sentence } from "../youtube/types";

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

test("resegmentSentences supports short, medium, and long modes", () => {
  const cues: CaptionCue[] = [
    { startMs: 0, endMs: 1500, text: "When I was young," },
    { startMs: 1500, endMs: 3000, text: "I loved to read books," },
    { startMs: 3100, endMs: 5000, text: "and I went to the library." },
  ];

  // Short mode: splits on clauses/commas into bite-sized training sentences
  const shortSentences = resegmentSentences(cues, [], "short");
  expect(shortSentences.length).toBeGreaterThanOrEqual(2);
  expect(shortSentences[0]!.text).toBe("When I was young,");

  // Long mode: groups clauses together into longer context
  const longSentences = resegmentSentences(cues, [], "long");
  expect(longSentences.length).toBe(1);
  expect(longSentences[0]!.text).toContain("When I was young, I loved to read books, and I went to the library.");
});

test("resegmentSentences slices fallback sentences without cues in short mode", () => {
  const fallback: Sentence[] = [
    {
      index: 0,
      startMs: 0,
      endMs: 6000,
      text: "First clause here, second clause there, third clause ends.",
      wordCount: 9,
      wpm: 120,
      difficulty: "i-1",
    },
  ];

  const shortResult = resegmentSentences([], fallback, "short");
  expect(shortResult.length).toBe(3);
  expect(shortResult[0]!.text).toBe("First clause here,");
  expect(shortResult[1]!.text).toBe("second clause there,");
  expect(shortResult[2]!.text).toBe("third clause ends.");
  expect(shortResult[0]!.startMs).toBe(0);
  expect(shortResult[2]!.endMs).toBe(6000);
});

test("evaluatePlaybackProgress handles single sentence loop, sentencePause, and continuous streaming", () => {
  // 1. Loop single mode: when reaching sentence end, triggers loop action with seekToSec
  const loopRes = evaluatePlaybackProgress({
    currentTimeSec: 4.1,
    sentences: mockSentences,
    paused: false,
    loopSingle: true,
    sentencePause: false,
    clipEndMs: 4000,
    activeIndex: 0,
  });
  expect(loopRes.action).toBe("loop");
  if (loopRes.action === "loop") {
    expect(loopRes.seekToSec).toBe(1); // startMs of sentence 0 is 1000ms = 1s
  }

  // 2. Default mode (sentencePause: false): continuous playback seamlessly without seek
  const advanceRes = evaluatePlaybackProgress({
    currentTimeSec: 5.0,
    sentences: mockSentences,
    paused: false,
    loopSingle: false,
    sentencePause: false,
    clipEndMs: null,
    activeIndex: 0,
  });
  expect(advanceRes.action).toBe("advance");
  if (advanceRes.action === "advance") {
    expect(advanceRes.activeIndex).toBe(1);
  }

  // 3. Sentence Pause mode (sentencePause: true): pauses at clipEndMs for difficult sentences
  const pauseRes = evaluatePlaybackProgress({
    currentTimeSec: 4.1,
    sentences: mockSentences,
    paused: false,
    loopSingle: false,
    sentencePause: true,
    clipEndMs: 4000,
    activeIndex: 0,
  });
  expect(pauseRes.action).toBe("pause");
});
