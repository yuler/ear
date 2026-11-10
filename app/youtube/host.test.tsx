import { expect, test } from "nsh/test";
import { platform } from "nsh";
import { hostFetch, isNativeHost } from "./host";

test("isNativeHost matches platform.os !== web", () => {
  expect(isNativeHost()).toBe(platform.os !== "web");
});

test("hostFetch rejects on web before network", async () => {
  if (platform.os !== "web") {
    expect(isNativeHost()).toBe(true);
    return;
  }
  let message = "";
  try {
    await hostFetch("https://www.youtube.com/");
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  expect(message).toMatch(/desktop\/native host/i);
});
