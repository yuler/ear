import { expect, test } from "nsh/test";
import { diffSummary, dojoQueue, nextRate, normalizeWord, wordDiff } from "./loopDojo";
import type { Sentence } from "../youtube/types";

test("wordDiff marks equal mismatch missing extra", () => {
  const tokens = wordDiff("Hello brave world", "hello brand world today");
  expect(tokens.map((t) => t.kind)).toEqual([
    "equal",
    "mismatch",
    "equal",
    "extra",
  ]);
  expect(diffSummary(tokens)).toEqual({
    equal: 2,
    mismatch: 1,
    missing: 0,
    extra: 1,
  });
});

test("normalizeWord strips punctuation", () => {
  expect(normalizeWord("World!")).toBe("world");
});

test("nextRate cycles 0.8 → 1 → 1.2 → 0.8", () => {
  expect(nextRate(0.8)).toBe(1);
  expect(nextRate(1)).toBe(1.2);
  expect(nextRate(1.2)).toBe(0.8);
});

function sent(index: number, text = "hi"): Sentence {
  return {
    index,
    text,
    startMs: index * 1000,
    endMs: index * 1000 + 500,
    wordCount: text.split(/\s+/).length,
    wpm: 120,
    difficulty: "i-1",
  };
}

test("dojoQueue keeps only lag and blind", () => {
  const sentences = [sent(0), sent(1), sent(2), sent(3)];
  const tags = { 0: "pass" as const, 1: "lag" as const, 2: "blind" as const };
  expect(dojoQueue(sentences, tags).map((s) => s.index)).toEqual([1, 2]);
});

test("dojoQueue empty when no lag/blind", () => {
  const sentences = [sent(0)];
  expect(dojoQueue(sentences, { 0: "pass" })).toEqual([]);
  expect(dojoQueue(sentences, {})).toEqual([]);
});
