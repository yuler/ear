import { expect, test } from "nsh/test";
import {
  computeSpokenWordProgress,
  cycleRate,
  evaluatePlaybackProgress,
  findSentenceIndexAtTime,
  formatSentenceTime,
  formatTimeRange,
  mergeSentences,
  parseCaptionsPayload,
  resegmentSentences,
  splitSentenceTokens,
} from "./captions";

test("mergeSentences & resegmentSentences match Desktop short/medium/long modes", () => {
  const cues = [
    { startMs: 1000, endMs: 2500, text: "Hello everyone," },
    { startMs: 2600, endMs: 4200, text: "welcome back to the show." },
    { startMs: 5200, endMs: 7000, text: "Today we talk about doing nothing." },
  ];

  const shortList = mergeSentences(cues, "short");
  const longList = mergeSentences(cues, "long");

  expect(shortList.length).toBeGreaterThanOrEqual(2);
  expect(shortList[0]!.text).toContain("Hello");
  expect(longList.length).toBeLessThanOrEqual(shortList.length);

  const reseg = resegmentSentences(cues, [], "medium");
  expect(reseg.length).toBeGreaterThanOrEqual(1);
});

test("parseCaptionsPayload handles cues-only, sentences-only, and empty JSON", () => {
  const fromCues = parseCaptionsPayload(
    JSON.stringify({
      cues: [
        { startMs: 0, endMs: 1800, text: "First sentence." },
        { startMs: 2400, endMs: 4100, text: "Second sentence." },
      ],
    }),
    "short",
  );
  expect(fromCues.cues.length).toBe(2);
  expect(fromCues.sentences.length).toBe(2);

  const fromSentences = parseCaptionsPayload(
    JSON.stringify({
      sentences: [
        {
          index: 0,
          startMs: 0,
          endMs: 2000,
          text: "Fallback sentence.",
          wordCount: 2,
          wpm: 120,
          difficulty: "i-1",
        },
      ],
    }),
    "medium",
  );
  expect(fromSentences.sentences.length).toBe(1);
  expect(fromSentences.sentences[0]!.text).toBe("Fallback sentence.");
});

test("evaluatePlaybackProgress supports continuous streaming and sentence-pause modes", () => {
  const sentences = [
    { index: 0, startMs: 0, endMs: 2000, text: "One.", wordCount: 1, wpm: 120, difficulty: "i-1" as const },
    { index: 1, startMs: 2100, endMs: 4500, text: "Two.", wordCount: 1, wpm: 120, difficulty: "i-1" as const },
  ];

  expect(findSentenceIndexAtTime(sentences, 2.5)).toBe(1);
  expect(formatSentenceTime(65_000)).toBe("1:05");
  expect(formatTimeRange(1000, 4000)).toBe("0:01 - 0:04");

  // Continuous mode advances active index
  expect(
    evaluatePlaybackProgress({
      currentTimeSec: 2.4,
      sentences,
      paused: false,
      sentencePause: false,
      clipEndMs: null,
      activeIndex: 0,
    }),
  ).toEqual({ action: "advance", activeIndex: 1 });

  // Sentence-pause mode pauses at clipEndMs
  expect(
    evaluatePlaybackProgress({
      currentTimeSec: 1.98,
      sentences,
      paused: false,
      sentencePause: true,
      clipEndMs: 2000,
      activeIndex: 0,
    }),
  ).toEqual({ action: "pause" });

  expect(cycleRate(1)).toBe(1.2);
  expect(cycleRate(2)).toBe(0.8);

  const tokens = splitSentenceTokens("Hello brave new world");
  const mid = computeSpokenWordProgress({ startMs: 0, endMs: 4000 }, 2.0, tokens);
  expect(mid.spokenIndex).toBeGreaterThanOrEqual(0);
  expect(mid.spokenIndex).toBeLessThan(tokens.length);
});
