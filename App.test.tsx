import { expect, open, test } from "nsh/test";
import { buildVideoPreview } from "./ui/clipboard";

test("shows Ear shell", async () => {
  const app = await open("./App.tsx");
  expect(app.texts().some((t) => t.includes("Ear"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Parse"))).toBe(true);
});

test("auto-reads YouTube link from clipboard on launch and shows prompt card", async () => {
  const app = await open("./App.tsx", {
    clipboard: "https://www.youtube.com/watch?v=b-6XR0rflJw",
  });
  await app.waitFor("From your clipboard");
  expect(app.texts().some((t) => t.includes("From your clipboard"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Download & Practice"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Return ↵"))).toBe(true);

  await app.press("Download & Practice");
  await app.waitFor("1 / 4");
  expect(app.texts().some((t) => t.includes("TRANSCRIPT QUEUE"))).toBe(true);
});

test("buildVideoPreview extracts YouTube URL and matches sample metadata", () => {
  const preview = buildVideoPreview(
    "https://www.youtube.com/watch?v=b-6XR0rflJw",
    "clipboard",
  );
  expect(preview?.videoId).toBe("b-6XR0rflJw");
  expect(preview?.source).toBe("clipboard");
  expect(preview?.durationLabel).toBe("6:45");
});

test("shows Cinema screen with timeline and transport in Blind Flow", async () => {
  const app = await open("./App.tsx", {
    clipboard: "https://www.youtube.com/watch?v=b-6XR0rflJw",
  });
  await app.waitFor("Download & Practice");
  await app.press("Download & Practice");
  await app.waitFor("1 / 4");

  // Verify video screen is rendered with initial state
  expect(
    app
      .texts()
      .some((t) => t.includes("PAUSED #1") || t.includes("PLAYING #1")),
  ).toBe(true);
  expect(app.texts().some((t) => t.includes("CLICK SEGMENT TO PLAY"))).toBe(
    true,
  );
});
