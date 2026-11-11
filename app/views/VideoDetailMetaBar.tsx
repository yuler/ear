import { Text, View } from "nsh";
import type { LibraryEntry } from "../library/types";
import type { PlaybackRate } from "../player";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import type { SentenceLengthMode } from "../youtube/captions";
import { SentenceControlsBar } from "./SentenceControlsBar";

export type VideoDetailMetaBarProps = {
  entry?: LibraryEntry;
  audioOnly?: boolean;
  totalSentences: number;
  loadingSentences?: boolean;
  activeIndex: () => number;
  currentTimeSec: () => number;
  durationSec: () => number;
  rate: () => PlaybackRate;
  sentencePause?: () => boolean;
  autoNext?: () => boolean;
  loopSingle: () => boolean;
  onPrevSentence: () => void;
  onRepeatSentence: () => void;
  onNextSentence: () => void;
  onToggleSentencePause?: () => void;
  onToggleAutoNext?: () => void;
  onToggleLoop: () => void;
  onCycleRate: () => void;
  sentenceLength: () => SentenceLengthMode;
  onChangeSentenceLength: (mode: SentenceLengthMode) => void;
  errorMsg: () => string | null;
  language: () => EarLocale;
};

/**
 * Pinned subtitle toolbar:
 * Unified single-row control bar (Navigation, Counter, Sentence length switcher, and Flow switches)
 * plus a lightweight shortcuts & auto-flow tip right above the subtitle list.
 */
export function VideoDetailMetaBar(props: VideoDetailMetaBarProps) {
  const m = () => t(props.language());

  return (
    <View class="shrink-0 border-b border-border/70 bg-popover/85 px-4 py-2 backdrop-blur-md md:px-6">
      <View class="mx-auto w-full max-w-[1024px] gap-1.5">
        {/* Simplified Single-Row Sentence Controls Bar */}
        <SentenceControlsBar
          activeIndex={props.activeIndex}
          totalSentences={() => props.totalSentences}
          currentTimeSec={props.currentTimeSec}
          durationSec={props.durationSec}
          rate={props.rate}
          sentencePause={props.sentencePause}
          autoNext={props.autoNext}
          loopSingle={props.loopSingle}
          onPrev={props.onPrevSentence}
          onRepeat={props.onRepeatSentence}
          onNext={props.onNextSentence}
          onToggleSentencePause={props.onToggleSentencePause}
          onToggleAutoNext={props.onToggleAutoNext}
          onToggleLoop={props.onToggleLoop}
          onCycleRate={props.onCycleRate}
          sentenceLength={props.sentenceLength}
          onChangeSentenceLength={props.onChangeSentenceLength}
          language={props.language}
        />

        {/* Lightweight interactive listening tips placed directly above the subtitle roller */}
        <View class="flex-row items-center justify-between px-1 pt-0.5">
          <View class="flex-row items-center gap-1.5">
            <Icon name="sparkles" size={12} tone="muted-foreground" />
            <Text class="text-[11px] text-muted-foreground">
              <Text class="font-semibold text-foreground">{m().tipsPrefix}: </Text>
              {m().listeningTips}
            </Text>
          </View>
        </View>

        {/* Error notice if player fails */}
        <If when={Boolean(props.errorMsg())}>
          <View class="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
            <Text class="text-xs text-destructive">{props.errorMsg()}</Text>
          </View>
        </If>
      </View>
    </View>
  );
}
