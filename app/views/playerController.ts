import { effect, keymap, signal, untracked } from "nsh";
import type { LibraryEntry } from "../library/types";
import { msToSeconds, type PlaybackRate } from "../player";
import { setBlockerEnabled } from "../store";
import { settings, updateSettings } from "../ui/settings";
import type { SentenceLengthMode } from "../youtube/captions";
import type { CaptionCue, Sentence } from "../youtube/types";
import {
  clampSentenceIndex,
  cycleRate,
  evaluatePlaybackProgress,
  findSentenceIndexAtTime,
  getNextSentenceIndex,
  getPrevSentenceIndex,
  resegmentSentences,
  stepRate,
} from "./sentencePlayer";
import { fetchLessonCaptions } from "./videoDetailLoader";

export type VideoNode = { seek(seconds: number): void };

/**
 * Playback, sentence and mask state for the player page, plus its key bindings.
 * The view (VideoDetailView.tsx) only renders what this returns.
 */
export function createPlayerController(opts: {
  entry: () => LibraryEntry;
  disabled?: () => boolean;
  onClose: () => void;
  /** Called after the sentence list is replaced (row refs are stale). */
  onResegment?: () => void;
}) {
  const entry = opts.entry;
  let videoNode: VideoNode | null = null;

  const paused = signal(false);
  const muted = signal(false);
  const rate = signal<PlaybackRate>(1);
  const volume = signal(1);
  const currentTimeSec = signal(0);
  const durationSec = signal(
    entry().durationMs ? Math.round(entry().durationMs! / 1000) : 0,
  );
  const errorMsg = signal<string | null>(null);

  const sentenceLength = signal<SentenceLengthMode>(
    untracked(() => settings().sentenceLength) ?? "short",
  );
  const rawCues = signal<CaptionCue[]>([]);
  const rawSentences = signal<Sentence[]>([]);
  const sentences = signal<Sentence[]>([]);
  const loadingSentences = signal(true);
  const activeIndex = signal(0);
  const clipEndMs = signal<number | null>(null);
  const sentencePause = signal(false);

  // Captions start masked for listening practice; rows can be revealed one by one.
  const maskAll = signal(true);
  const revealedMap = signal<Record<number, boolean>>({});

  const blockerEnabled = signal(
    untracked(() => settings().subtitleBlockerEnabled) ?? false,
  );

  const currentSentence = (): Sentence | null => {
    const list = sentences();
    if (list.length === 0) return null;
    return list[clampSentenceIndex(activeIndex(), list.length)] ?? null;
  };

  // Load sentences for the entry (length changes resegment locally, no refetch).
  effect(() => {
    const cur = entry();
    loadingSentences.set(true);
    void fetchLessonCaptions(cur, untracked(sentenceLength))
      .then((data) => {
        rawCues.set(data.cues);
        rawSentences.set(data.rawSentences);
        sentences.set(data.sentences);
      })
      .finally(() => loadingSentences.set(false));
  });

  const setVideoNode = (node: VideoNode | null) => {
    videoNode = node;
  };

  const togglePlay = () => {
    errorMsg.set(null);
    const next = !paused();
    paused.set(next);
    if (!next) {
      const cur = currentSentence();
      clipEndMs.set(sentencePause() && cur ? cur.endMs : null);
    }
  };

  const toggleSentencePause = () => {
    const next = !sentencePause();
    sentencePause.set(next);
    const cur = currentSentence();
    clipEndMs.set(next && cur ? cur.endMs : null);
  };

  const changeSentenceLength = (mode: SentenceLengthMode) => {
    if (mode === sentenceLength()) return;
    sentenceLength.set(mode);
    updateSettings({ sentenceLength: mode });
    opts.onResegment?.();
    const next = resegmentSentences(rawCues(), rawSentences(), mode);
    sentences.set(next);
    revealedMap.set({});
    const idx = findSentenceIndexAtTime(next, currentTimeSec());
    activeIndex.set(idx >= 0 ? idx : 0);
  };

  const seek = (sec: number) => {
    currentTimeSec.set(sec);
    videoNode?.seek(sec);
    const idx = findSentenceIndexAtTime(sentences(), sec);
    if (idx >= 0) activeIndex.set(idx);
    clipEndMs.set(null);
  };

  const playSentence = (s: Sentence) => {
    if (!videoNode) return;
    errorMsg.set(null);
    activeIndex.set(s.index);
    clipEndMs.set(s.endMs);
    videoNode.seek(msToSeconds(s.startMs));
    paused.set(false);
  };

  const repeatCurrent = () => {
    const cur = currentSentence();
    if (cur) {
      playSentence(cur);
    } else if (videoNode) {
      videoNode.seek(0);
      paused.set(false);
    }
  };

  const prevSentence = () => {
    const list = sentences();
    const idx = getPrevSentenceIndex(activeIndex());
    if (idx != null && list[idx]) playSentence(list[idx]!);
  };

  const nextSentence = () => {
    const list = sentences();
    if (list.length === 0) return;
    const idx = getNextSentenceIndex(activeIndex(), list.length);
    if (idx != null && list[idx]) playSentence(list[idx]!);
    else repeatCurrent();
  };

  // Space: with sentence pause on, a paused player moves to the next sentence.
  const spaceKey = () => {
    const list = sentences();
    if (list.length === 0 || !sentencePause()) {
      togglePlay();
      return;
    }
    if (activeIndex() === 0 && paused() && currentTimeSec() < 0.2) {
      playSentence(list[0]!);
    } else if (paused()) {
      nextSentence();
    } else {
      togglePlay();
    }
  };

  const toggleReveal = (index: number) => {
    const cur = revealedMap();
    revealedMap.set({ ...cur, [index]: !cur[index] });
  };

  const toggleMask = () => maskAll.set(!maskAll());
  const toggleMute = () => muted.set(!muted());

  const toggleBlocker = () => {
    const next = !blockerEnabled();
    blockerEnabled.set(next);
    setBlockerEnabled(next);
  };

  const onProgress = (e: { currentTime: number; duration?: number }) => {
    currentTimeSec.set(e.currentTime);
    if (e.duration) durationSec.set(e.duration);
    const res = evaluatePlaybackProgress({
      currentTimeSec: e.currentTime,
      sentences: sentences(),
      paused: paused(),
      sentencePause: sentencePause(),
      clipEndMs: clipEndMs(),
      activeIndex: activeIndex(),
    });
    if (res.action === "pause") paused.set(true);
    if (res.action === "advance") activeIndex.set(res.activeIndex);
    if (res.newClipEndMs !== undefined) clipEndMs.set(res.newClipEndMs);
  };

  const onEnd = () => {
    paused.set(true);
    clipEndMs.set(null);
  };

  const guard = (fn: () => void) => () => {
    if (opts.disabled?.()) return;
    fn();
  };

  keymap.bind(
    {
      escape: guard(opts.onClose),
      left: guard(prevSentence),
      right: guard(nextSentence),
      r: guard(repeatCurrent),
      space: guard(spaceKey),
      m: guard(toggleMask),
      b: guard(toggleBlocker),
      "[": guard(() => rate.set(stepRate(rate(), -1))),
      "]": guard(() => rate.set(stepRate(rate(), 1))),
      "0": guard(() => rate.set(1)),
      up: guard(() => volume.set(Math.min(1, Math.round((volume() + 0.1) * 10) / 10))),
      down: guard(() => volume.set(Math.max(0, Math.round((volume() - 0.1) * 10) / 10))),
      "alt+1": guard(() => changeSentenceLength("short")),
      "alt+2": guard(() => changeSentenceLength("medium")),
      "alt+3": guard(() => changeSentenceLength("long")),
    },
    { when: "notEditing" },
  );

  return {
    paused,
    muted,
    rate,
    volume,
    currentTimeSec,
    durationSec,
    errorMsg,
    sentenceLength,
    rawCues,
    sentences,
    loadingSentences,
    activeIndex,
    sentencePause,
    maskAll,
    revealedMap,
    blockerEnabled,
    setVideoNode,
    togglePlay,
    toggleMute,
    toggleSentencePause,
    changeSentenceLength,
    seek,
    playSentence,
    repeatCurrent,
    prevSentence,
    nextSentence,
    toggleReveal,
    toggleMask,
    toggleBlocker,
    cycleRate: () => rate.set(cycleRate(rate())),
    onProgress,
    onEnd,
  };
}

export type PlayerController = ReturnType<typeof createPlayerController>;
