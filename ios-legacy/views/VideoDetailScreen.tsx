import { effect, Image, signal, Text, untracked, Video, View, type VideoRef } from "nsh";
import { Button, NavPage } from "nsh/base";
import { Haptics } from "nsh/mobile";
import type { MirrorEngine } from "../mirror/engine";
import {
  clampSentenceIndex,
  cycleRate,
  evaluatePlaybackProgress,
  findSentenceIndexAtTime,
  loadLocalCaptions,
  resegmentSentences,
  type CaptionCue,
  type PlaybackRate,
  type Sentence,
  type SentenceLengthMode,
} from "../player/captions";
import { playerCopyFor } from "../player/playerI18n";
import { MobilePlayerControls } from "./MobilePlayerControls";
import { MobileSubtitleStudio } from "./MobileSubtitleStudio";
import { RawSubtitlesSheet, VideoInfoSheet } from "./VideoInfoSheet";

function isAudioMime(mimeType: string, ext: string): boolean {
  if (mimeType.startsWith("audio/")) return true;
  return ext === "m4a" || ext === "mp3" || ext === "opus" || ext === "ogg";
}

/** Full offline iOS video detail & intensive-listening player aligned with Desktop VideoDetailView. */
export function VideoDetailScreen(props: {
  videoId: () => string;
  engine: MirrorEngine;
  onClose: () => void;
  onToast?: (msg: string) => void;
}) {
  const locale = () => props.engine.settings().language;
  const pc = () => playerCopyFor(locale());
  const item = () => props.engine.library().find((x) => x.videoId === props.videoId()) ?? null;

  let videoNode: VideoRef | null = null;

  const playablePath = signal<string | null>(null);
  const preparingMedia = signal(true);
  const paused = signal(true);
  const rate = signal<PlaybackRate>(1);
  const currentTimeSec = signal(0);
  const durationSec = signal(0);
  const errorMsg = signal<string | null>(null);

  const sentenceLength = signal<SentenceLengthMode>("short");
  const rawCues = signal<CaptionCue[]>([]);
  const rawSentences = signal<Sentence[]>([]);
  const sentences = signal<Sentence[]>([]);
  const loadingCaptions = signal(true);
  const activeIndex = signal(0);
  const clipEndMs = signal<number | null>(null);
  const sentencePause = signal(false);
  const maskAll = signal(true);
  const revealedMap = signal<Record<number, boolean>>({});
  const blockerEnabled = signal(false);

  const infoOpen = signal(false);
  const rawSubsOpen = signal(false);

  // Resolve playable local path (auto-assembling legacy chunked files if needed).
  effect(() => {
    const vid = props.videoId();
    const cur = item();
    if (!cur) return;
    if (cur.durationMs && untracked(durationSec) === 0) {
      durationSec.set(Math.round(cur.durationMs / 1000));
    }
    let cancelled = false;
    preparingMedia.set(true);
    errorMsg.set(null);
    void props.engine.ensurePlayablePath(vid).then((path) => {
      if (cancelled) return;
      playablePath.set(path);
      preparingMedia.set(false);
      if (!path) {
        errorMsg.set(pc().mediaNotPlayable);
      }
    });
    return () => {
      cancelled = true;
    };
  });

  // Load local offline captions.json whenever the video or captionsPath changes.
  effect(() => {
    const cur = item();
    if (!cur) return;
    const capPath = cur.captionsPath;
    let cancelled = false;
    loadingCaptions.set(true);
    void loadLocalCaptions(capPath, untracked(sentenceLength))
      .then((loaded) => {
        if (cancelled) return;
        rawCues.set(loaded.cues);
        rawSentences.set(loaded.rawSentences);
        sentences.set(loaded.sentences);
        activeIndex.set(0);
        revealedMap.set({});
      })
      .finally(() => {
        if (!cancelled) loadingCaptions.set(false);
      });
    return () => {
      cancelled = true;
    };
  });

  const currentSentence = (): Sentence | null => {
    const list = sentences();
    if (list.length === 0) return null;
    return list[clampSentenceIndex(activeIndex(), list.length)] ?? null;
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

  const seek = (sec: number) => {
    currentTimeSec.set(sec);
    videoNode?.seek(sec);
    const idx = findSentenceIndexAtTime(sentences(), sec);
    if (idx >= 0) activeIndex.set(idx);
    clipEndMs.set(null);
  };

  const playSentence = (s: Sentence) => {
    errorMsg.set(null);
    activeIndex.set(s.index);
    clipEndMs.set(s.endMs);
    videoNode?.seek(Math.max(0, s.startMs) / 1000);
    paused.set(false);
  };

  const repeatCurrent = () => {
    const cur = currentSentence();
    if (cur) {
      playSentence(cur);
    } else {
      videoNode?.seek(0);
      paused.set(false);
    }
  };

  const prevSentence = () => {
    const list = sentences();
    const idx = activeIndex() - 1;
    if (idx >= 0 && list[idx]) playSentence(list[idx]!);
  };

  const nextSentence = () => {
    const list = sentences();
    const idx = activeIndex() + 1;
    if (idx < list.length && list[idx]) playSentence(list[idx]!);
    else repeatCurrent();
  };

  const changeSentenceLength = (mode: SentenceLengthMode) => {
    if (mode === sentenceLength()) return;
    sentenceLength.set(mode);
    const next = resegmentSentences(rawCues(), rawSentences(), mode);
    sentences.set(next);
    revealedMap.set({});
    const idx = findSentenceIndexAtTime(next, currentTimeSec());
    activeIndex.set(idx >= 0 ? idx : 0);
  };

  const openInfo = () => {
    Haptics.selection();
    infoOpen.set(true);
  };

  const audioOnly = () => {
    const cur = item();
    return cur ? isAudioMime(cur.mimeType, cur.mediaExt) : false;
  };

  const renderInfoButton = (testID: string) => (
    <Button
      testID={testID}
      onPress={openInfo}
      accessibilityLabel={pc().videoInfoBtn}
      class="min-h-[36px] min-w-[36px] items-center justify-center rounded-full px-2 active:opacity-60"
    >
      <Text class="text-[17px] font-semibold text-tint">ⓘ</Text>
    </Button>
  );

  return (
    <NavPage
      title={item()?.title ?? pc().videoInfoTitle}
      headerRight={renderInfoButton("detail-info")}
      ios={{
        headerRightItems: [
          {
            key: "info",
            symbol: "info.circle",
            label: pc().videoInfoBtn,
            onPress: openInfo,
          },
        ],
      }}
      class="flex-1 bg-background"
    >
      <View class="min-h-0 flex-1 flex-col">
        {/* 16:9 Offline Video Stage */}
        <View class="relative h-[220px] w-full shrink-0 overflow-hidden bg-black">
          {playablePath() && !preparingMedia() ? (
            <Video
              ref={(node) => {
                videoNode = node;
              }}
              src={playablePath()!}
              paused={paused()}
              rate={rate()}
              controls={false}
              audioSession="playback"
              progressUpdateInterval={80}
              class="h-full w-full object-contain"
              onLoad={(e) => {
                errorMsg.set(null);
                if (e?.duration && e.duration > 0) {
                  durationSec.set(e.duration);
                }
              }}
              onProgress={(e) => {
                currentTimeSec.set(e.currentTime);
                if (e.duration && e.duration > 0) durationSec.set(e.duration);
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
              }}
              onError={(e) => {
                paused.set(true);
                const code = e?.code ? ` [${e.code}]` : "";
                errorMsg.set(`${pc().mediaLoadError}: ${e?.message ?? ""}${code}`);
              }}
              onEnd={() => {
                paused.set(true);
                clipEndMs.set(null);
              }}
            />
          ) : (
            <View class="h-full w-full items-center justify-center px-6">
              <Text class="text-center text-xs text-white/75">
                {preparingMedia() ? pc().preparingMedia : pc().mediaNotPlayable}
              </Text>
            </View>
          )}

          {audioOnly() && item()?.thumbnailUrl ? (
            <Image
              src={item()!.thumbnailUrl}
              class="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
          ) : null}

          {/* Tap video surface to play/pause */}
          {playablePath() && !preparingMedia() ? (
            <Button
              onPress={togglePlay}
              accessibilityLabel={paused() ? pc().play : pc().pause}
              class="absolute inset-0 items-center justify-center bg-transparent"
            >
              {paused() ? (
                <View class="h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/60">
                  <Text class="text-xl font-bold text-white">▶</Text>
                </View>
              ) : null}
            </Button>
          ) : null}

          {/* Subtitle Blocker bar over bottom burned-in captions */}
          {!audioOnly() && blockerEnabled() ? (
            <View class="pointer-events-none absolute inset-x-3 bottom-3 h-11 rounded-xl border border-white/15 bg-black/90" />
          ) : null}
        </View>

        {/* Playback error banner */}
        {errorMsg() ? (
          <View class="flex-row items-center justify-between gap-2 bg-danger-soft px-4 py-2.5">
            <Text class="min-w-0 flex-1 text-xs font-medium text-destructive">
              {errorMsg()}
            </Text>
            <Button onPress={openInfo} class="rounded-full bg-card px-2.5 py-1 active:opacity-70">
              <Text class="text-xs font-semibold text-tint">{pc().videoInfoBtn}</Text>
            </Button>
          </View>
        ) : null}

        {/* Touch-friendly player controls */}
        <MobilePlayerControls
          paused={paused}
          onTogglePlay={togglePlay}
          currentTimeSec={currentTimeSec}
          durationSec={durationSec}
          onSeek={seek}
          sentences={sentences}
          onPrevSentence={prevSentence}
          onRepeatSentence={repeatCurrent}
          onNextSentence={nextSentence}
          rate={rate}
          onCycleRate={() => rate.set(cycleRate(rate()))}
          sentencePause={sentencePause}
          onToggleSentencePause={() => {
            const next = !sentencePause();
            sentencePause.set(next);
            const cur = currentSentence();
            clipEndMs.set(next && cur ? cur.endMs : null);
          }}
          maskAll={maskAll}
          onToggleMask={() => maskAll.set(!maskAll())}
          blockerEnabled={audioOnly() ? undefined : blockerEnabled}
          onToggleBlocker={audioOnly() ? undefined : () => blockerEnabled.set(!blockerEnabled())}
          sentenceLength={sentenceLength}
          onChangeSentenceLength={changeSentenceLength}
          onOpenRawSubtitles={() => rawSubsOpen.set(true)}
          locale={locale}
        />

        {/* Intensive-listening subtitle studio */}
        <MobileSubtitleStudio
          sentences={sentences}
          loading={loadingCaptions}
          activeIndex={activeIndex}
          currentTimeSec={currentTimeSec}
          paused={paused}
          maskAll={maskAll}
          isRevealed={(idx) => Boolean(revealedMap()[idx])}
          onToggleReveal={(idx) =>
            revealedMap.set({ ...revealedMap(), [idx]: !revealedMap()[idx] })
          }
          onListen={playSentence}
          onRepeatSentence={repeatCurrent}
          locale={locale}
          onCopied={props.onToast}
        />
      </View>

      <VideoInfoSheet
        open={() => infoOpen()}
        item={item}
        resolvedMediaPath={() => playablePath()}
        locale={locale}
        onClose={() => infoOpen.set(false)}
      />

      <RawSubtitlesSheet
        open={() => rawSubsOpen()}
        cues={rawCues}
        sentences={sentences}
        locale={locale}
        onClose={() => rawSubsOpen.set(false)}
      />
    </NavPage>
  );
}
