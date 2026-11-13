import { expect, test } from "nsh/test";
import {
  captionTrackBadge,
  captionTrackId,
  cleanCaptionTrackName,
  extractVideoId,
  isAutoCaptionTrack,
  loadLessonFromParsed,
  preferBestCaptionTrack,
  preferEnglishTrack,
  videoPosterUrl,
} from "./parse";
import {
  earCaptions,
  earDownload,
  earParse,
  setEarBinaryCandidates,
  setEarSpawnHook,
  type ParseProgressEvent,
} from "./earClient";

test("earParse invokes Ear CLI binary and streams progress before resolving video payload", async () => {
  const progressStages: string[] = [];
  setEarSpawnHook((bin: string, args: string[]) => {
    expect(["ear", "./ear", "./ear.exe"]).toContain(bin);
    expect(args).toEqual(["parse", "https://www.youtube.com/watch?v=mockId12345"]);

    return {
      on(event: string, handler: (data: any) => void) {
        if (event === "stdout") {
          setTimeout(() => {
            handler(
              JSON.stringify({
                v: 1,
                type: "progress",
                stage: "connecting",
                progress: 20,
                message: "Connecting...",
              }),
            );
            handler(
              JSON.stringify({
                v: 1,
                type: "progress",
                stage: "tracks",
                progress: 80,
                message: "Tracks...",
              }),
            );
            handler(
              JSON.stringify({
                v: 1,
                type: "result",
                progress: 100,
                video: {
                  videoId: "mockId12345",
                  title: "Mock Lesson Video",
                  durationMs: 120000,
                  thumbnailUrl: "https://i.ytimg.com/vi/mockId12345/hqdefault.jpg",
                  audioUrl: "https://example.com/audio.mp4",
                  audioMimeType: "audio/mp4",
                  videoUrl: null,
                  videoMimeType: null,
                  qualities: [
                    {
                      id: "720p",
                      label: "720p",
                      mode: "video",
                      mimeType: "video/mp4",
                      ext: "mp4",
                    },
                  ],
                  captionTracks: [
                    {
                      baseUrl: "https://example.com/captions",
                      languageCode: "en",
                      name: "English",
                      isAuto: false,
                    },
                  ],
                },
              }),
            );
          }, 0);
        } else if (event === "exit") {
          setTimeout(() => handler({ code: 0 }), 10);
        }
      },
    };
  });

  try {
    const parsed = await earParse(
      "https://www.youtube.com/watch?v=mockId12345",
      (ev: ParseProgressEvent) => {
        progressStages.push(ev.stage);
      },
    );

    expect(parsed.videoId).toBe("mockId12345");
    expect(parsed.title).toBe("Mock Lesson Video");
    expect(parsed.durationMs).toBe(120000);
    expect(parsed.audioUrl).toBe("https://example.com/audio.mp4");
    expect(parsed.captionTracks.length).toBe(1);
    expect(progressStages).toContain("connecting");
    expect(progressStages).toContain("tracks");
  } finally {
    setEarSpawnHook(null);
  }
});

test("earCaptions retrieves normalized cues via Ear CLI", async () => {
  setEarSpawnHook((_bin: string, args: string[]) => {
    expect(args[0]).toBe("captions");
    return {
      on(event: string, handler: (data: any) => void) {
        if (event === "stdout") {
          setTimeout(() => {
            handler(
              JSON.stringify({
                v: 1,
                type: "captions",
                cues: [
                  { startMs: 0, endMs: 1500, text: "Hello and welcome" },
                  { startMs: 1500, endMs: 3000, text: "to this lesson." },
                ],
              }),
            );
          }, 0);
        } else if (event === "exit") {
          setTimeout(() => handler({ code: 0 }), 10);
        }
      },
    };
  });

  try {
    const cues = await earCaptions("https://example.com/captions");
    expect(cues.length).toBe(2);
    expect(cues[0]!.text).toBe("Hello and welcome");
    expect(cues[1]!.startMs).toBe(1500);
  } finally {
    setEarSpawnHook(null);
  }
});

test("loadLessonFromParsed parses video + captions into LoadedLesson with merged sentences", async () => {
  setEarSpawnHook(() => {
    return {
      on(event: string, handler: (data: any) => void) {
        if (event === "stdout") {
          setTimeout(() => {
            handler(
              JSON.stringify({
                v: 1,
                type: "captions",
                cues: [
                  { startMs: 1000, endMs: 2500, text: "This is a full sentence." },
                ],
              }),
            );
          }, 0);
        } else if (event === "exit") {
          setTimeout(() => handler({ code: 0 }), 10);
        }
      },
    };
  });

  try {
    const lesson = await loadLessonFromParsed({
      videoId: "test1234567",
      title: "Test Lesson",
      durationMs: 5000,
      audioUrl: "https://example.com/audio.mp4",
      audioMimeType: "audio/mp4",
      qualities: [
        {
          id: "720p",
          label: "720p",
          mode: "video",
          mimeType: "video/mp4",
          ext: "mp4",
        },
      ],
      captionTracks: [
        {
          baseUrl: "https://example.com/captions",
          languageCode: "en",
          name: "English",
          isAuto: false,
        },
      ],
      playerResponse: null,
    });

    expect(lesson.video.videoId).toBe("test1234567");
    expect(lesson.cues.length).toBe(1);
    expect(lesson.sentences.length).toBe(1);
    expect(lesson.sentences[0]!.text).toBe("This is a full sentence.");
  } finally {
    setEarSpawnHook(null);
  }
});

test("preferEnglishTrack selects manual en over auto-generated CC en", () => {
  const tracks = [
    { languageCode: "es", name: "Spanish", baseUrl: "https://example.com/es" },
    {
      languageCode: "en",
      name: "English (auto-generated)",
      kind: "asr",
      vssId: "a.en",
      baseUrl: "https://example.com/en-asr",
    },
    {
      languageCode: "en",
      name: "English",
      vssId: ".en",
      baseUrl: "https://example.com/en-manual",
    },
  ];
  const preferred = preferEnglishTrack(tracks);
  expect(preferred?.baseUrl).toBe("https://example.com/en-manual");
  expect(isAutoCaptionTrack(preferred!)).toBe(false);
  expect(captionTrackBadge(preferred!).shortLabel).toBe("人工");
  expect(captionTrackBadge(tracks[1]!).shortLabel).toBe("CC 机翻");
  expect(cleanCaptionTrackName(tracks[1]!)).toBe("English");
  expect(captionTrackId(preferred!)).toBe(".en");
  expect(videoPosterUrl("abc12345678")).toBe(
    "https://i.ytimg.com/vi/abc12345678/hqdefault.jpg",
  );
  expect(extractVideoId("https://youtu.be/abc12345678")).toBe("abc12345678");
});

test("preferBestCaptionTrack detects Japanese title and prefers Japanese caption track", () => {
  const tracks = [
    { languageCode: "en", name: "English", baseUrl: "https://example.com/en" },
    { languageCode: "ja", name: "Japanese", baseUrl: "https://example.com/ja" },
  ];
  const jaSelected = preferBestCaptionTrack(
    tracks,
    "【5 min Japanese Listening】simple Q&A!",
  );
  expect(jaSelected?.languageCode).toBe("ja");

  const enSelected = preferBestCaptionTrack(
    tracks,
    "Steve Jobs Stanford Address",
  );
  expect(enSelected?.languageCode).toBe("en");
});

test("earDownload captures path and sizeBytes from type=done event", async () => {
  setEarSpawnHook((_bin: string, args: string[]) => {
    expect(args[0]).toBe("download");
    return {
      on(event: string, handler: (data: any) => void) {
        if (event === "stdout") {
          setTimeout(() => {
            handler(
              JSON.stringify({
                v: 1,
                type: "done",
                percent: 100,
                path: "/tmp/final-output.mp4",
                sizeBytes: 9876543,
              }),
            );
          }, 0);
        } else if (event === "exit") {
          setTimeout(() => handler({ code: 0 }), 10);
        }
      },
    };
  });

  try {
    const res = await earDownload({
      videoId: "abc12345678",
      qualityId: "720p",
      outputPath: "/tmp/expected.mp4",
    });
    expect(res.path).toBe("/tmp/final-output.mp4");
    expect(res.sizeBytes).toBe(9876543);
  } finally {
    setEarSpawnHook(null);
  }
});

test("earDownload rejects immediately when signal is already aborted", async () => {
  let spawned = false;
  setEarSpawnHook(() => {
    spawned = true;
    return { on() {} };
  });

  const ctrl = new AbortController();
  ctrl.abort();

  try {
    let caught: Error | null = null;
    try {
      await earDownload({
        videoId: "abc12345678",
        qualityId: "720p",
        outputPath: "/tmp/expected.mp4",
        signal: ctrl.signal,
      });
    } catch (e) {
      caught = e as Error;
    }
    expect(spawned).toBe(false);
    expect(caught?.message).toContain("paused");
  } finally {
    setEarSpawnHook(null);
  }
});

test("earParse does not retry remaining binary candidates on application error", async () => {
  let spawnCount = 0;
  setEarBinaryCandidates(["ear-1", "ear-2", "ear-3"]);
  setEarSpawnHook(() => {
    spawnCount += 1;
    return {
      on(event: string, handler: (data: any) => void) {
        if (event === "stdout") {
          setTimeout(() => {
            handler(
              JSON.stringify({
                v: 1,
                type: "error",
                message: "Video unavailable",
              }),
            );
          }, 0);
        } else if (event === "exit") {
          setTimeout(() => handler({ code: 1 }), 10);
        }
      },
    };
  });

  try {
    let caught: Error | null = null;
    try {
      await earParse("https://www.youtube.com/watch?v=mockId12345");
    } catch (e) {
      caught = e as Error;
    }
    expect(spawnCount).toBe(1);
    expect(caught?.message).toBe("Video unavailable");
  } finally {
    setEarSpawnHook(null);
    setEarBinaryCandidates(null);
  }
});

test("loadLessonFromParsed selects Japanese track when title is Japanese", async () => {
  setEarSpawnHook((_bin: string, args: string[]) => {
    expect(args[0]).toBe("captions");
    expect(args[1]).toBe("https://example.com/ja");
    return {
      on(event: string, handler: (data: any) => void) {
        if (event === "stdout") {
          setTimeout(() => {
            handler(
              JSON.stringify({
                v: 1,
                type: "captions",
                cues: [{ startMs: 0, endMs: 1000, text: "こんにちは" }],
              }),
            );
          }, 0);
        } else if (event === "exit") {
          setTimeout(() => handler({ code: 0 }), 10);
        }
      },
    };
  });

  try {
    const lesson = await loadLessonFromParsed({
      videoId: "jaVideo1234",
      title: "日本語リスニング練習",
      durationMs: 60000,
      thumbnailUrl: "https://i.ytimg.com/vi/jaVideo1234/hqdefault.jpg",
      audioUrl: "https://example.com/audio.m4a",
      audioMimeType: "audio/mp4",
      videoUrl: null,
      videoMimeType: null,
      qualities: [],
      playerResponse: null,
      captionTracks: [
        { languageCode: "en", name: "English", baseUrl: "https://example.com/en" },
        { languageCode: "ja", name: "Japanese", baseUrl: "https://example.com/ja" },
      ],
    });
    expect(lesson.track?.languageCode).toBe("ja");
  } finally {
    setEarSpawnHook(null);
  }
});
