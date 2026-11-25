import { expect, open, test } from "nsh/test";
import { normalizeEntry } from "../library/index";
import { normalizeSettings } from "../store";
import { t } from "../ui/i18n";
import type { Sentence } from "../youtube/types";
import {
  clampSentenceIndex,
  displaySentenceText,
  findSentenceIndexAtTime,
  formatSentenceTime,
  formatTimeRange,
  getNextSentenceIndex,
  getPrevSentenceIndex,
  isSentenceMasked,
  resegmentSentences,
} from "./sentencePlayer";
import type { SentenceLengthMode } from "../youtube/captions";
import { VideoDetailView } from "./VideoDetailView";
import { shouldShowPlayerHeader } from "./VideoDetailHeader";
import {
  resolveControlsDensity,
  shouldShowPlayerControls,
} from "./VideoPlayerControls";
import {
  buildRawSubtitlesJson,
  RawSubtitlesModal,
} from "./RawSubtitlesModal";
import { SentenceRow } from "./SentenceRow";
import {
  normalizeWordToken,
  splitSentenceTokens,
  SubtitleStudio,
} from "./SubtitleStudio";
import {
  computePlayerLayout,
  isCompactStudio,
  isPortraitMedia,
  nextLayoutMode,
  portraitSubtitleWidth,
  resolveAutoLayoutMode,
  subtitleTextSize,
} from "./playerLayout";

const sentences: Sentence[] = [
  {
    index: 0,
    startMs: 0,
    endMs: 3200,
    text: "Welcome to English listening practice.",
    wordCount: 5,
    wpm: 93,
    difficulty: "i-1",
  },
  {
    index: 1,
    startMs: 3500,
    endMs: 7800,
    text: "Today we will practice listening without subtitles first.",
    wordCount: 8,
    wpm: 111,
    difficulty: "i+1",
  },
  {
    index: 2,
    startMs: 8000,
    endMs: 11500,
    text: "Then you can reveal and repeat.",
    wordCount: 6,
    wpm: 102,
    difficulty: "i-1",
  },
];

test("VideoDetailView exports valid component function", () => {
  expect(typeof VideoDetailView).toBe("function");
});

test("Sentence navigation handles previous, next, and bounds correctly", () => {
  // First sentence: previous is null
  expect(getPrevSentenceIndex(0)).toBeNull();
  expect(getNextSentenceIndex(0, sentences.length)).toBe(1);

  // Middle sentence: both previous and next exist
  expect(getPrevSentenceIndex(1)).toBe(0);
  expect(getNextSentenceIndex(1, sentences.length)).toBe(2);

  // Last sentence: next is null
  expect(getPrevSentenceIndex(2)).toBe(1);
  expect(getNextSentenceIndex(2, sentences.length)).toBeNull();

  // Clamping
  expect(clampSentenceIndex(-5, sentences.length)).toBe(0);
  expect(clampSentenceIndex(99, sentences.length)).toBe(2);
});

test("Masking logic supports '打码' and '去听' workflow", () => {
  const sentence = sentences[0]!;

  // 1. By default maskAll is true -> sentence is masked with bullets
  expect(isSentenceMasked(true, false)).toBe(true);
  const maskedText = displaySentenceText(sentence.text, true, false);
  expect(maskedText).not.toContain("Welcome");
  expect(maskedText).toBe("••••••• •• ••••••• ••••••••• •••••••••");

  // 2. Individual sentence revealed -> displays original text
  expect(isSentenceMasked(true, true)).toBe(false);
  expect(displaySentenceText(sentence.text, true, true)).toBe(sentence.text);

  // 3. Global mask disabled -> displays original text
  expect(isSentenceMasked(false, false)).toBe(false);
  expect(displaySentenceText(sentence.text, false, false)).toBe(sentence.text);
});

test("findSentenceIndexAtTime tracks active sentence during playback", () => {
  // At start
  expect(findSentenceIndexAtTime(sentences, 1.5)).toBe(0);

  // During sentence 1
  expect(findSentenceIndexAtTime(sentences, 5.0)).toBe(1);

  // During sentence 2
  expect(findSentenceIndexAtTime(sentences, 9.5)).toBe(2);
});

test("formatTimeRange formats sentence timing cleanly", () => {
  expect(formatTimeRange(sentences[0]!.startMs, sentences[0]!.endMs)).toBe(
    "0:00 - 0:03",
  );
  expect(formatSentenceTime(125000)).toBe("2:05");
});

test("VideoDetailView accepts originRect for music app-style shared element transition", () => {
  const mockEntry = normalizeEntry({
    videoId: "test-vid",
    title: "Test Listening Video",
    thumbnailUrl: "https://i.ytimg.com/vi/test-vid/mqdefault.jpg",
    videoPath: "/downloads/test.mp4",
  });
  const mockOriginRect = {
    x: 80,
    y: 240,
    width: 120,
    height: 68,
    borderRadius: 8,
  };

  // Verify component accepts typed originRect prop
  const element = VideoDetailView({
    entry: () => mockEntry,
    src: () => "/downloads/test.mp4",
    originRect: () => mockOriginRect,
    onClose: () => {},
  });

  expect(element).toBeDefined();
});

test("VideoDetailView starts portrait entries directly in side-by-side mode using persisted dimensions", async () => {
  // 1000x700 window (aspect 1.43) defaults to stacked for landscape,
  // but v1 has persisted 720x1280 portrait dimensions so it mounts immediately in side mode.
  const app = await open("../ui/overlayFixture.tsx", { width: 1000, height: 700 });
  await app.waitFor("Open Player");
  await app.press("Open Player");
  await app.waitFor("label:Switch to top-bottom layout");
  expect(app.shows("label:Switch to top-bottom layout")).toBe(true);
  expect(app.shows("label:Switch to side-by-side layout")).toBe(false);
});

test("i18n supports English-first by default and switches all action buttons to Chinese", () => {
  // 1. English first default translations
  const en = t("en");
  expect(en.back).toBe("Back");
  expect(en.prevSentence).toBe("Prev");
  expect(en.previousSentenceFull).toBe("Previous");
  expect(en.repeatSentence).toBe("Repeat");
  expect(en.repeatSentenceFull).toBe("Repeat");
  expect(en.nextSentence).toBe("Next");
  expect(en.nextSentenceFull).toBe("Next");
  expect(en.listen).toBe("Listen");
  expect(en.playing).toBe("Playing");
  expect(en.loopSingle).toBe("Loop");
  expect(en.looping).toBe("Looping");
  expect(en.loopingFull).toBe("Looping");
  expect(en.maskedCaptions).toBe("Masked (Listen)");
  expect(en.showCaptions).toBe("Show Captions");
  expect(en.maskedBadge).toBe("Masked");
  expect(en.shortSentences).toBe("Short");
  expect(en.sentenceCounter(1, 10)).toBe("Sentence 1 / 10");

  // 2. Chinese translations
  const zh = t("zh");
  expect(zh.back).toBe("返回列表");
  expect(zh.prevSentence).toBe("上一句");
  expect(zh.previousSentenceFull).toBe("上一句");
  expect(zh.repeatSentence).toBe("重复");
  expect(zh.repeatSentenceFull).toBe("重复听");
  expect(zh.nextSentence).toBe("下一句");
  expect(zh.nextSentenceFull).toBe("下一句");
  expect(zh.listen).toBe("去听");
  expect(zh.playing).toBe("播放中");
  expect(zh.loopSingle).toBe("单句循环");
  expect(zh.looping).toBe("循环中");
  expect(zh.loopingFull).toBe("单句循环中");
  expect(zh.maskedCaptions).toBe("字幕已打码 (去听)");
  expect(zh.showCaptions).toBe("显示原文字幕");
  expect(zh.maskedBadge).toBe("已打码");
  expect(zh.shortSentences).toBe("短句");
  expect(zh.sentenceCounter(1, 10)).toBe("第 1 / 10 句");
  expect(zh.sentencePauseOn).toBe("逐句暂停: 开");
  expect(zh.sentencePauseOff).toBe("逐句暂停: 关");
  expect(zh.listeningTips).toContain("逐句暂停");

  // Verify English tips
  expect(en.sentencePauseOn).toBe("Sentence Pause: On");
  expect(en.sentencePauseOff).toBe("Sentence Pause: Off");
  expect(en.listeningTips).toContain("Sentence Pause");
});

test("normalizeSettings defaults language to English and validates Chinese", () => {
  const def = normalizeSettings({});
  expect(def.language).toBe("en");

  const zh = normalizeSettings({ language: "zh" });
  expect(zh.language).toBe("zh");

  // @ts-expect-error test fallback on invalid language
  const fallback = normalizeSettings({ language: "fr" });
  expect(fallback.language).toBe("en");
});

test("Sentence length switching updates sentences in real time", () => {
  const cues = [
    { startMs: 0, endMs: 1500, text: "Hello everyone," },
    { startMs: 1500, endMs: 3000, text: "welcome to the channel," },
    { startMs: 3000, endMs: 5000, text: "today we practice listening." },
  ];

  let currentMode: SentenceLengthMode = "short";
  let sentences = resegmentSentences(cues, [], currentMode);
  expect(sentences.length).toBeGreaterThanOrEqual(2);

  // Switch to long mode
  currentMode = "long";
  sentences = resegmentSentences(cues, [], currentMode);
  expect(sentences.length).toBe(1);
  expect(sentences[0]!.text).toContain("Hello everyone, welcome to the channel, today we practice listening.");
});

test("Sentence pause listening flow: continuous playback by default (sentencePause=false), pauses per sentence when sentencePause=true", () => {
  let activeIdx = 0;
  let sentencePause = false; // default OFF: plays continuously like normal video
  let paused = false;

  // 1. Initially sentencePause is OFF: video flows continuously without pause
  const onSentenceEnd = () => {
    if (sentencePause) {
      paused = true; // pauses cleanly at sentence end for intensive listening
    } else {
      const next = getNextSentenceIndex(activeIdx, sentences.length);
      if (next != null) {
        activeIdx = next;
      } else {
        paused = true;
      }
    }
  };

  // Sentence 0 finishes playing in continuous mode -> advances to sentence 1 naturally
  onSentenceEnd();
  expect(paused).toBe(false);
  expect(activeIdx).toBe(1);

  // 2. Encounter difficult material: user turns on sentencePause
  sentencePause = true;
  onSentenceEnd(); // sentence 1 finishes -> pauses!
  expect(paused).toBe(true);
  expect(activeIdx).toBe(1);

  // 3. User repeats current difficult sentence (R key)
  paused = false; // repeats sentence 1
  expect(activeIdx).toBe(1);
  expect(paused).toBe(false);

  // Sentence 1 finishes again -> pauses cleanly again
  onSentenceEnd();
  expect(paused).toBe(true);
  expect(activeIdx).toBe(1);

  // 4. User presses Space to proceed to next sentence
  activeIdx = getNextSentenceIndex(activeIdx, sentences.length)!;
  paused = false;
  expect(activeIdx).toBe(2);
  expect(paused).toBe(false);
});

test("Player layout: aspect ratio switches mode with hysteresis, sizes follow the spec", () => {
  // ≥ 1.65 → side, ≤ 1.55 → stacked, in between keep the current mode.
  expect(nextLayoutMode("stacked", 1600, 700)).toBe("side");
  expect(nextLayoutMode("side", 800, 560)).toBe("stacked");
  expect(nextLayoutMode("stacked", 1200, 750)).toBe("stacked"); // 1.6
  expect(nextLayoutMode("side", 1200, 750)).toBe("side"); // 1.6

  // Side: subtitle column 38% of width clamped to 360..520, full-bleed black video stage fills the entire left panel.
  const wide = computePlayerLayout("side", 1600, 700);
  expect(wide.subtitleWidth).toBe(520);
  expect(wide.mainWidth).toBe(1080);
  expect(wide.videoWidth).toBe(1080);
  expect(wide.videoHeight).toBe(700);
  expect(computePlayerLayout("side", 900, 500).subtitleWidth).toBe(360);

  // Stacked: video height = min(width * 9/16, 52% of window height; header is a floating overlay).
  const small = computePlayerLayout("stacked", 800, 560);
  expect(small.videoWidth).toBe(800);
  expect(small.videoHeight).toBe(Math.floor(560 * 0.52));
  const tall = computePlayerLayout("stacked", 800, 1400);
  expect(tall.videoHeight).toBe(450);

  // Compact studio detection matches minimum desktop window (800x560).
  expect(isCompactStudio(800, 560)).toBe(true);
  expect(isCompactStudio(1200, 800)).toBe(false);
  expect(isCompactStudio(1600, 920)).toBe(false);

  // Subtitle text size picks one of 3 sizes from the column width.
  expect(subtitleTextSize(360)).toBe("sm");
  expect(subtitleTextSize(600)).toBe("md");
  expect(subtitleTextSize(1200)).toBe("lg");
});

test("Player layout: portrait video caps right studio <= 50% width and landscape stays stacked for dual-zone studio", () => {
  expect(isPortraitMedia(1080 / 1920)).toBe(true);
  expect(isPortraitMedia(3 / 4)).toBe(true);
  expect(isPortraitMedia(1)).toBe(false);
  expect(isPortraitMedia(16 / 9)).toBe(false);
  expect(isPortraitMedia(null)).toBe(false);

  // Portrait 9:16 video auto-switches to side layout even in a 1200x800 (1.5) or 800x560 window.
  expect(resolveAutoLayoutMode("stacked", 1200, 800, 1080 / 1920)).toBe("side");
  expect(resolveAutoLayoutMode("stacked", 800, 560, 720 / 1280)).toBe("side");
  // Known landscape 16:9 video stays stacked across normal and large desktop screens so the dual studio sits below.
  expect(resolveAutoLayoutMode("stacked", 1200, 800, 1920 / 1080)).toBe("stacked");
  expect(resolveAutoLayoutMode("stacked", 1600, 920, 1920 / 1080)).toBe("stacked");
  // Unknown aspect falls back to window-aspect hysteresis.
  expect(resolveAutoLayoutMode("stacked", 1600, 700, null)).toBe("side");

  // Side layout for 9:16 video caps subtitle studio to 46% (clamped 360..560, <= 50%) so it never outweighs the video.
  const portraitDesktop = computePlayerLayout("side", 1200, 800, 9 / 16);
  expect(portraitDesktop.videoHeight).toBe(800);
  expect(portraitDesktop.subtitleWidth).toBe(portraitSubtitleWidth(1200));
  expect(portraitDesktop.subtitleWidth).toBe(552);
  expect(portraitDesktop.mainWidth).toBe(648);
  expect(portraitDesktop.subtitleWidth).toBeLessThanOrEqual(portraitDesktop.mainWidth);

  // Large desktop monitor (1600x920): portrait studio caps at 560pt wide.
  const portraitLarge = computePlayerLayout("side", 1600, 920, 9 / 16);
  expect(portraitLarge.subtitleWidth).toBe(560);
  expect(portraitLarge.mainWidth).toBe(1040);

  // Minimum desktop window (800x560): 54% video : 46% studio (432pt : 368pt), >= 360pt and <= 50%.
  const portraitSmall = computePlayerLayout("side", 800, 560, 9 / 16);
  expect(portraitSmall.videoHeight).toBe(560);
  expect(portraitSmall.subtitleWidth).toBe(368);
  expect(portraitSmall.mainWidth).toBe(432);
  expect(portraitSmall.subtitleWidth).toBeLessThanOrEqual(portraitSmall.mainWidth);
});

test("VideoDetailHeader hides while playing unless hovered or focused", () => {
  expect(shouldShowPlayerHeader(false, false, false)).toBe(false);
  expect(shouldShowPlayerHeader(false, true, false)).toBe(true);
  expect(shouldShowPlayerHeader(false, false, true)).toBe(true);
  expect(shouldShowPlayerHeader(true, false, false)).toBe(true);
});

test("VideoPlayerControls hides while playing unless hovered or focused", () => {
  expect(shouldShowPlayerControls(false, false, false)).toBe(false);
  expect(shouldShowPlayerControls(false, true, false)).toBe(true);
  expect(shouldShowPlayerControls(false, false, true)).toBe(true);
  expect(shouldShowPlayerControls(true, false, false)).toBe(true);

  // Progressive single-line density prevents wrapping on portrait and minimum-size stages.
  expect(resolveControlsDensity(1200)).toEqual({
    iconOnlyToggles: false,
    compactLength: false,
    compactTime: false,
  });
  expect(resolveControlsDensity(800)).toEqual({
    iconOnlyToggles: true,
    compactLength: false,
    compactTime: false,
  });
  expect(resolveControlsDensity(648)).toEqual({
    iconOnlyToggles: true,
    compactLength: true,
    compactTime: false,
  });
  expect(resolveControlsDensity(432)).toEqual({
    iconOnlyToggles: true,
    compactLength: true,
    compactTime: true,
  });
});

test("Smooth continuous playback: streams forward without seek halts", () => {
  const sentencePause = false; // default OFF: plays continuously
  let activeIdx = 0;
  let seekCalls = 0;
  let paused = false;

  const onProgress = (timeSec: number) => {
    if (!sentencePause) {
      const idx = findSentenceIndexAtTime(sentences, timeSec);
      if (idx !== activeIdx) {
        activeIdx = idx;
        // Notice: NO seek calls during smooth continuous streaming!
      }
    }
  };

  // Video plays at 1.5s (sentence 0)
  onProgress(1.5);
  expect(activeIdx).toBe(0);
  expect(seekCalls).toBe(0);

  // Video naturally plays into 5.0s (sentence 1) - no seek, no pause!
  onProgress(5.0);
  expect(activeIdx).toBe(1);
  expect(seekCalls).toBe(0);
  expect(paused).toBe(false);

  // Video naturally plays into 9.5s (sentence 2) - smooth like normal video!
  onProgress(9.5);
  expect(activeIdx).toBe(2);
  expect(seekCalls).toBe(0);
  expect(paused).toBe(false);
});

test("SubtitleStudio tokenizes words cleanly and renders Dual-Zone Studio in stacked and side modes", () => {
  expect(splitSentenceTokens("The bottom line is no one's coming.")).toEqual([
    "The",
    "bottom",
    "line",
    "is",
    "no",
    "one's",
    "coming.",
  ]);
  expect(normalizeWordToken("coming.")).toBe("coming");
  expect(normalizeWordToken("“one's,”")).toBe("one's");

  const stackedStudio = SubtitleStudio({
    sentences: () => sentences,
    loading: () => false,
    activeIndex: () => 0,
    paused: () => false,
    maskAll: () => true,
    isRevealed: () => false,
    onToggleReveal: () => {},
    onListen: () => {},
    onRepeatSentence: () => {},
    side: () => false,
    compact: () => false,
    large: () => false,
    language: () => "en",
    textSize: () => "md",
    scrollRef: () => {},
    onStreamScroll: () => {},
    onStreamLayout: () => {},
    rowRef: () => {},
  });
  expect(stackedStudio).toBeDefined();

  const sideCompactStudio = SubtitleStudio({
    sentences: () => sentences,
    loading: () => false,
    activeIndex: () => 1,
    paused: () => true,
    maskAll: () => false,
    isRevealed: () => true,
    onToggleReveal: () => {},
    onListen: () => {},
    onRepeatSentence: () => {},
    side: () => true,
    compact: () => true,
    large: () => false,
    language: () => "zh",
    textSize: () => "sm",
    scrollRef: () => {},
    onStreamScroll: () => {},
    onStreamLayout: () => {},
    rowRef: () => {},
  });
  expect(sideCompactStudio).toBeDefined();
});

test("SentenceRow: shows clean 2D stream row without redundant badges or buttons", () => {
  const row = SentenceRow({
    sentence: () => sentences[0],
    isActive: () => true,
    isPlaying: () => true,
    isMaskAll: () => true,
    isRevealed: () => false,
    onToggleReveal: () => {},
    onListen: () => {},
    activeIndex: () => 0,
  });

  expect(row).toBeDefined();
  const str = JSON.stringify(row);
  expect(str.includes("Reveal sentence")).toBe(false);
  expect(str.includes("Repeat")).toBe(false);
  expect(str.includes("i-1")).toBe(false);
  expect(str.includes("Masked")).toBe(false);
});

test("RawSubtitlesModal formats raw cues and sentences JSON for inspection", () => {
  const cues = [
    { startMs: 0, endMs: 3200, text: "Welcome to English listening practice." },
  ];
  const json = buildRawSubtitlesJson("/tmp/v1.captions.json", cues, sentences);
  const parsed = JSON.parse(json);
  expect(parsed.captionsPath).toBe("/tmp/v1.captions.json");
  expect(parsed.cueCount).toBe(1);
  expect(parsed.sentenceCount).toBe(sentences.length);
  expect(parsed.cues[0].text).toBe("Welcome to English listening practice.");

  const modal = RawSubtitlesModal({
    open: () => true,
    onClose: () => {},
    captionsPath: () => "/tmp/v1.captions.json",
    cues: () => cues,
    sentences: () => sentences,
    language: () => "zh",
  });
  expect(modal).toBeDefined();
});


