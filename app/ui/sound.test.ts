import { expect, test } from "nsh/test";
import { playDingSound } from "./sound";

test("playDingSound safely executes without throwing in any environment", () => {
  expect(() => playDingSound()).not.toThrow();
});
