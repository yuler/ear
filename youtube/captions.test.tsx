import { expect, test } from "nsh/test";
import {
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

test("cuesFromJson3 and mergeSentences compute wpm difficulty", () => {
  const cues = cuesFromJson3({
    events: [
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: "Hello " }, { utf8: "world." }],
      },
      {
        tStartMs: 2000,
        dDurationMs: 2000,
        segs: [{ utf8: "This is a longer sentence for medium pace." }],
      },
    ],
  });
  expect(cues.length).toBe(2);
  expect(cues[0]!.text).toBe("Hello world.");

  const sentences = mergeSentences(cues);
  expect(sentences.length).toBe(2);
  expect(sentences[0]!.wordCount).toBe(2);
  expect(difficultyFromWpm(100)).toBe("easy");
  expect(difficultyFromWpm(140)).toBe("medium");
  expect(difficultyFromWpm(200)).toBe("hard");
  expect(countWords("one two three")).toBe(3);
});
