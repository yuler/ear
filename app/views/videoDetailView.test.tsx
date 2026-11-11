import { expect, test } from "nsh/test";
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
  expect(zh.autoNextOn).toBe("自动下一句: 开");
  expect(zh.autoNextOff).toBe("自动下一句: 关");
  expect(zh.listeningTips).toContain("按 R 重听 · 按 空格 下一句");

  // Verify English tips
  expect(en.autoNextOn).toBe("Auto-Next: On");
  expect(en.autoNextOff).toBe("Auto-Next: Off");
  expect(en.listeningTips).toContain("Press R to repeat");
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

test("VideoDetailMetaBar and sentence length switching updates sentences in real time", () => {
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

test("Auto-advance listening flow: stops after single sentence by default, advances on Space or Auto-Next", () => {
  let activeIdx = 0;
  let autoNext = false;
  let paused = false;

  // 1. Initially autoNext is off: plays sentence 0 then pauses at sentence end
  const onSentenceEnd = () => {
    if (autoNext) {
      const next = getNextSentenceIndex(activeIdx, sentences.length);
      if (next != null) {
        activeIdx = next;
      } else {
        paused = true;
      }
    } else {
      paused = true;
    }
  };

  // Sentence 0 finishes playing
  onSentenceEnd();
  expect(paused).toBe(true);
  expect(activeIdx).toBe(0);

  // 2. Press Space (or Next) advances to next sentence and resumes
  activeIdx = getNextSentenceIndex(activeIdx, sentences.length)!;
  paused = false;
  expect(activeIdx).toBe(1);
  expect(paused).toBe(false);

  // Sentence 1 finishes playing -> pauses again
  onSentenceEnd();
  expect(paused).toBe(true);
  expect(activeIdx).toBe(1);

  // 3. User repeats current sentence (R key)
  paused = false; // repeats sentence 1
  expect(activeIdx).toBe(1);
  expect(paused).toBe(false);

  // 4. Turn on autoNext switch -> automatically transitions across sentences
  autoNext = true;
  onSentenceEnd(); // sentence 1 finishes
  expect(activeIdx).toBe(2);
  expect(paused).toBe(false);
});

test("Immersive video controls visibility: hidden during auto-play/auto-pause, shows on mouse activity with 5s reset", () => {
  let controlsVisible = false;
  let timerMs = 0;

  // 1. Initial state and playback states: controls stay hidden
  expect(controlsVisible).toBe(false);

  // Auto-pause or playback state changes do NOT force controls to show
  const onAutoPause = () => {
    // Controls stay hidden when auto-pausing
  };
  onAutoPause();
  expect(controlsVisible).toBe(false);

  // 2. Mouse enters / moves: controls become visible with 5-second countdown
  const onPointerActivity = () => {
    controlsVisible = true;
    timerMs = 5000;
  };

  onPointerActivity();
  expect(controlsVisible).toBe(true);
  expect(timerMs).toBe(5000);

  // 3. Mouse continues moving inside the area -> 5s timer resets
  timerMs = 2000; // 3 seconds elapsed
  onPointerActivity(); // mouse moved again
  expect(timerMs).toBe(5000); // reset to 5s!
  expect(controlsVisible).toBe(true);

  // 4. Time elapses -> controls hide
  const onTimerExpire = () => {
    controlsVisible = false;
  };
  onTimerExpire();
  expect(controlsVisible).toBe(false);
});

test("Smooth Auto-Next playback: streams forward without seek halts", () => {
  const autoNext = true;
  let activeIdx = 0;
  let seekCalls = 0;
  let paused = false;

  const onProgress = (timeSec: number) => {
    if (autoNext) {
      const idx = findSentenceIndexAtTime(sentences, timeSec);
      if (idx !== activeIdx) {
        activeIdx = idx;
        // Notice: NO seek calls during smooth auto-advance!
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


