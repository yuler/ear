import { expect, test } from "nsh/test";
import { diffSummary, nextRate, normalizeWord, wordDiff } from "./loopDojo";

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
