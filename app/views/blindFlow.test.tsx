import { expect, test } from "nsh/test";
import {
  applyTag,
  countTags,
  createBlindFlowSession,
  isComplete,
  revealCaption,
  maskCaption,
  restartBlindFlow,
} from "./blindFlowLogic";

test("applyTag advances and clears reveal", () => {
  let s = createBlindFlowSession();
  s = revealCaption(s);
  s = applyTag(s, "pass", 3);
  expect(s.index).toBe(1);
  expect(s.revealed).toBe(false);
  expect(s.tags[0]).toBe("pass");
});

test("applyTag on last sentence stays and marks complete", () => {
  let s = createBlindFlowSession();
  s = applyTag(s, "lag", 2);
  s = applyTag(s, "blind", 2);
  expect(s.index).toBe(1);
  expect(s.tags[1]).toBe("blind");
  expect(isComplete(s, 2)).toBe(true);
  expect(countTags(s.tags)).toEqual({ pass: 0, lag: 1, blind: 1 });
});

test("restart clears tags", () => {
  let s = createBlindFlowSession();
  s = applyTag(s, "pass", 1);
  s = restartBlindFlow();
  expect(s.index).toBe(0);
  expect(Object.keys(s.tags).length).toBe(0);
});

test("maskCaption hides letters without CSS filter", () => {
  const masked = maskCaption("Hello world");
  expect(masked.includes("H") || masked.includes("w")).toBe(false);
  expect(masked).toBe("••••• •••••");
});
