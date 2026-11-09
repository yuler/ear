import { expect, test } from "nsh/test";
import {
  SENTENCE_PAD_MS,
  appendWithoutOverlap,
  countWords,
  cuesFromJson3,
  difficultyFromWpm,
  mergeSentences,
} from "./captions";
import { extractVideoId, sliceBalancedObject } from "./parse";

test("extractVideoId handles urls and bare ids", () => {
  expect(extractVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(
    extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
  ).toBe("dQw4w9WgXcQ");
  expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(extractVideoId("nope")).toBe(null);
});

test("sliceBalancedObject reads nested json", () => {
  const src = 'prefix={"a":{"b":1},"c":"}"} trailing';
  const start = src.indexOf("{");
  const sliced = sliceBalancedObject(src, start);
  expect(sliced).toBe('{"a":{"b":1},"c":"}"}');
  expect(JSON.parse(sliced!).c).toBe("}");
});

test("difficultyFromWpm uses i-1 / i+1 / Hard thresholds", () => {
  expect(difficultyFromWpm(144)).toBe("i-1");
  expect(difficultyFromWpm(145)).toBe("i+1");
  expect(difficultyFromWpm(180)).toBe("i+1");
  expect(difficultyFromWpm(181)).toBe("Hard");
});

test("appendWithoutOverlap drops rolling caption word overlap", () => {
  expect(appendWithoutOverlap("hello world this is", "this is a test")).toBe(
    "hello world this is a test",
  );
  expect(appendWithoutOverlap("same words", "same words")).toBe("same words");
  expect(appendWithoutOverlap("one two", "three")).toBe("one two three");
});

test("mergeSentences pads ±150ms and dedupes overlap", () => {
  const cues = cuesFromJson3({
    events: [
      {
        tStartMs: 1000,
        dDurationMs: 1000,
        segs: [{ utf8: "Hello " }, { utf8: "world." }],
      },
      {
        tStartMs: 2500,
        dDurationMs: 2000,
        segs: [{ utf8: "world. This continues here." }],
      },
    ],
  });
  // First cue ends with period → flush; second is its own sentence after gap? 
  // gap 2500-2000=500 <= 650, but first already flushed on period.
  const sentences = mergeSentences(cues);
  expect(sentences.length).toBe(2);
  expect(sentences[0]!.startMs).toBe(1000 - SENTENCE_PAD_MS);
  expect(sentences[0]!.endMs).toBe(2000 + SENTENCE_PAD_MS);
  expect(sentences[0]!.text).toBe("Hello world.");
  expect(sentences[0]!.difficulty).toBe(difficultyFromWpm(sentences[0]!.wpm));

  // Overlap within one sentence (no period mid-way)
  const rolling = mergeSentences([
    { startMs: 0, endMs: 800, text: "I am going" },
    { startMs: 400, endMs: 1200, text: "going to school today." },
  ]);
  expect(rolling.length).toBe(1);
  expect(rolling[0]!.text).toBe("I am going to school today.");
  expect(rolling[0]!.startMs).toBe(0);
  expect(rolling[0]!.endMs).toBe(1200 + SENTENCE_PAD_MS);
  expect(countWords(rolling[0]!.text)).toBe(6);
});
