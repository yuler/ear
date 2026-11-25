import { signal } from "nsh";
import { expect, test } from "nsh/test";
import { normalizeEntry } from "../library/index";
import { createPlayerController } from "./playerController";

test("createPlayerController does not reload captions when only video dimensions change", async () => {
  const entry = signal(
    normalizeEntry({
      videoId: "dim-stable-1",
      title: "Dimension Stability",
      url: "",
      videoPath: "/downloads/dim-stable-1.mp4",
      captionsPath: null,
    }),
  );

  const ctl = createPlayerController({
    entry,
    onClose: () => {},
  });

  await new Promise((r) => setTimeout(r, 30));
  expect(ctl.loadingSentences()).toBe(false);

  // Updating videoWidth/videoHeight on the same entry must not reset loadingSentences.
  entry.set({ ...entry(), videoWidth: 720, videoHeight: 1280 });
  expect(ctl.loadingSentences()).toBe(false);
});
