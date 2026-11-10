import { expect, test } from "nsh/test";
import {
  fetchJson3Captions,
  parseYouTubeVideo,
  preferEnglishTrack,
} from "./parse";

test("parseYouTubeVideo uses Innertube VisionOS player API with visitor data", async () => {
  const requests: { url: string; headers?: HeadersInit; body?: string }[] = [];

  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    requests.push({
      url,
      headers: init?.headers,
      body: init?.body ? String(init.body) : undefined,
    });

    if (url.includes("youtube.com/watch?v=mockId12345")) {
      return new Response(
        `<html><script>ytcfg.set({"VISITOR_DATA": "mock-visitor-xyz"});</script></html>`,
        { status: 200 },
      );
    }

    if (url.includes("youtubei/v1/player")) {
      const parsedBody = JSON.parse(String(init?.body));
      expect(parsedBody.videoId).toBe("mockId12345");
      expect(parsedBody.context?.client?.clientName).toBe("VISIONOS");

      return new Response(
        JSON.stringify({
          playabilityStatus: { status: "OK" },
          videoDetails: {
            videoId: "mockId12345",
            title: "Mock Lesson Video",
            lengthSeconds: "120",
          },
          streamingData: {
            adaptiveFormats: [
              {
                itag: 140,
                mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                bitrate: 128000,
                url: "https://googlevideo.com/audio.mp4",
              },
            ],
          },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  baseUrl: "https://www.youtube.com/api/timedtext?v=mockId12345",
                  name: { runs: [{ text: "English (auto-generated)" }] },
                  languageCode: "en",
                  kind: "asr",
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("Not found", { status: 404 });
  }) as typeof fetch;

  const parsed = await parseYouTubeVideo(
    "https://www.youtube.com/watch?v=mockId12345",
    mockFetch,
  );

  expect(parsed.videoId).toBe("mockId12345");
  expect(parsed.title).toBe("Mock Lesson Video");
  expect(parsed.durationMs).toBe(120000);
  expect(parsed.audioUrl).toBe("https://googlevideo.com/audio.mp4");
  expect(parsed.audioMimeType).toBe('audio/mp4; codecs="mp4a.40.2"');
  expect(parsed.captionTracks.length).toBe(1);
  expect(parsed.captionTracks[0]!.name).toBe("English (auto-generated)");
  expect(parsed.captionTracks[0]!.languageCode).toBe("en");

  // Verify headers passed to player API
  const playerReq = requests.find((r) => r.url.includes("youtubei/v1/player"));
  expect(playerReq).toBeTruthy();
  const headers = playerReq!.headers as Record<string, string>;
  expect(headers["X-Goog-Visitor-Id"]).toBe("mock-visitor-xyz");
  expect(headers["X-YouTube-Client-Name"]).toBe("101");
});

test("parseYouTubeVideo falls back to watch HTML playerResponse when player API is unavailable", async () => {
  const watchHtml = `
    <html>
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": { "title": "Watch Fallback Title", "lengthSeconds": "60" },
          "streamingData": {
            "adaptiveFormats": [
              { "itag": 140, "mimeType": "audio/mp4", "bitrate": 96000, "url": "https://example.com/fallback.mp4" }
            ]
          },
          "captions": {
            "playerCaptionsTracklistRenderer": {
              "captionTracks": [
                { "baseUrl": "https://example.com/captions", "name": { "simpleText": "English" }, "languageCode": "en" }
              ]
            }
          }
        };
      </script>
    </html>
  `;

  const mockFetch = (async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.includes("youtube.com/watch?v=fallback123")) {
      return new Response(watchHtml, { status: 200 });
    }
    // Player API fails
    return new Response("Internal Error", { status: 500 });
  }) as typeof fetch;

  const parsed = await parseYouTubeVideo(
    "https://www.youtube.com/watch?v=fallback123",
    mockFetch,
  );

  expect(parsed.videoId).toBe("fallback123");
  expect(parsed.title).toBe("Watch Fallback Title");
  expect(parsed.audioUrl).toBe("https://example.com/fallback.mp4");
  expect(parsed.captionTracks.length).toBe(1);
  expect(parsed.captionTracks[0]!.name).toBe("English");
});

test("fetchJson3Captions rejects on empty response and parses valid JSON", async () => {
  const emptyFetch = (async () => new Response("", { status: 200 })) as typeof fetch;
  let emptyErr: Error | null = null;
  try {
    await fetchJson3Captions(
      { baseUrl: "https://example.com/timedtext", languageCode: "en", name: "en" },
      emptyFetch,
    );
  } catch (e) {
    emptyErr = e instanceof Error ? e : new Error(String(e));
  }
  expect(emptyErr).toBeTruthy();
  expect(emptyErr!.message).toMatch(/empty response/i);

  const validFetch = (async () =>
    new Response(JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000 }] }), {
      status: 200,
    })) as typeof fetch;
  const data = (await fetchJson3Captions(
    { baseUrl: "https://example.com/timedtext", languageCode: "en", name: "en" },
    validFetch,
  )) as { events: Array<{ tStartMs: number }> };
  expect(data.events.length).toBe(1);
  expect(data.events[0]!.tStartMs).toBe(0);
});

test("preferEnglishTrack selects en / english tracks", () => {
  const tracks = [
    { languageCode: "es", name: "Spanish", baseUrl: "https://example.com/es" },
    { languageCode: "en", name: "English (auto-generated)", baseUrl: "https://example.com/en" },
  ];
  const preferred = preferEnglishTrack(tracks);
  expect(preferred?.languageCode).toBe("en");
});
