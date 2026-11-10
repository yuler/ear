import { expect, test } from "nsh/test";
import {
  localMediaCandidates,
  localMediaFileUrl,
  resolvePlaybackSource,
  toVideoSrc,
} from "./player";

test("toVideoSrc returns bare absolute paths for nsh Video", () => {
  expect(toVideoSrc("/home/yule/Downloads/a.mp4")).toBe(
    "/home/yule/Downloads/a.mp4",
  );
  expect(toVideoSrc("file:///home/yule/Downloads/a.mp4")).toBe(
    "/home/yule/Downloads/a.mp4",
  );
  expect(toVideoSrc(null)).toBe(null);
});

test("localMediaFileUrl prefers videoPath over audioPath as bare path", () => {
  expect(
    localMediaFileUrl({
      videoPath: "/tmp/v.mp4",
      audioPath: "/tmp/a.m4a",
    }),
  ).toBe("/tmp/v.mp4");
  expect(
    localMediaFileUrl({
      videoPath: null,
      audioPath: "/tmp/a.m4a",
    }),
  ).toBe("/tmp/a.m4a");
});

test("localMediaCandidates prefers dataDir library copy first", () => {
  const list = localMediaCandidates({
    videoId: "abc",
    videoPath: "/home/yule/Downloads/abc.mp4",
    audioPath: null,
    dataDir: "/home/yule/.local/share/com.cozilla.ear",
  });
  expect(list[0]).toBe(
    "/home/yule/.local/share/com.cozilla.ear/library/abc/video.mp4",
  );
  expect(list).toContain("/home/yule/Downloads/abc.mp4");
});

test("resolvePlaybackSource prefers local muxed video as bare path", () => {
  const src = resolvePlaybackSource({
    videoUrl: "file:///tmp/lesson.mp4",
    audioUrl: "https://googlevideo.com/audio.m4a",
  });
  expect(src.url).toBe("/tmp/lesson.mp4");
  expect(src.hasPicture).toBe(true);
});

test("resolvePlaybackSource uses local audio file when video path missing", () => {
  const src = resolvePlaybackSource({
    videoUrl: null,
    audioUrl: "file:///tmp/lesson.m4a",
  });
  expect(src.url).toBe("/tmp/lesson.m4a");
  expect(src.hasPicture).toBe(false);
});

test("resolvePlaybackSource plays audio for remote adaptive video+audio pair", () => {
  // Regression: quality adaptation exposes separate adaptive streams. A single
  // <Video src> cannot mux them — preferring videoUrl was silent / unplayable.
  const src = resolvePlaybackSource({
    videoUrl: "https://googlevideo.com/video-only.mp4",
    audioUrl: "https://googlevideo.com/audio.m4a",
  });
  expect(src.url).toBe("https://googlevideo.com/audio.m4a");
  expect(src.hasPicture).toBe(false);
});

test("resolvePlaybackSource keeps muxed remote video when no separate audio", () => {
  const src = resolvePlaybackSource({
    videoUrl: "https://example.com/progressive.mp4",
    audioUrl: null,
  });
  expect(src.url).toBe("https://example.com/progressive.mp4");
  expect(src.hasPicture).toBe(true);
});

test("resolvePlaybackSource returns null when nothing is available", () => {
  const src = resolvePlaybackSource({ videoUrl: null, audioUrl: null });
  expect(src.url).toBe(null);
  expect(src.hasPicture).toBe(false);
});
