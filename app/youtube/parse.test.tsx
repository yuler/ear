import { expect, test } from "nsh/test";
import {
  captionTrackBadge,
  captionTrackId,
  cleanCaptionTrackName,
  extractVideoId,
  isAutoCaptionTrack,
  loadLessonFromParsed,
  preferEnglishTrack,
  videoPosterUrl,
} from "./parse";
import {
  earCaptions,
  earParse,
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
