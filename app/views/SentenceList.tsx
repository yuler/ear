import { Text, View, type ViewRef } from "nsh";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import type { SentenceLengthMode } from "../youtube/captions";
import type { Sentence } from "../youtube/types";
import type { SubtitleTextSize } from "./playerLayout";
import { SentenceRow } from "./SentenceRow";

export type SentenceListProps = {
  title?: () => string;
  sentences: () => Sentence[];
  sentenceLength?: () => SentenceLengthMode;
  onChangeSentenceLength?: (mode: SentenceLengthMode) => void;
  loading: () => boolean;
  activeIndex: () => number;
  paused: () => boolean;
  maskAll: () => boolean;
  isRevealed: (index: number) => boolean;
  isBookmarked?: (index: number) => boolean;
  compact?: () => boolean;
  onToggleReveal: (index: number) => void;
  onListen: (sentence: Sentence) => void;
  /** Receives each row's node so the detail page can scroll the active one into view. */
  rowRef: (index: number, node: ViewRef | null) => void;
  language?: () => EarLocale;
  showHeader?: boolean;
  textSize?: () => SubtitleTextSize;
};

/** Subtitle transcript stream: loading / empty states and one SentenceRow per sentence. */
export function SentenceList(props: SentenceListProps) {
  const lang = () => props.language?.() ?? "zh";
  const m = () => t(lang());

  return (
    <View selectable class="relative w-full flex-1 min-h-0 select-text">
      {/* Loading state */}
      <If when={props.loading()}>
        <View class="items-center justify-center gap-2 py-14">
          <Icon name="loader" size={24} class="animate-spin" />
          <Text class="font-mono text-xs text-muted-foreground">
            {m().loadingCaptions}
          </Text>
        </View>
      </If>

      {/* Empty captions state */}
      <If when={!props.loading() && props.sentences().length === 0}>
        <View class="my-4 items-center justify-center gap-2 rounded-xl border border-line bg-card p-8">
          <Icon name="subtitles" size={26} tone="muted-foreground" />
          <Text class="text-sm font-medium text-foreground">
            {m().noCaptions}
          </Text>
          <Text class="text-xs text-muted-foreground">
            {m().noCaptionsDesc}
          </Text>
        </View>
      </If>

      {/* Clean 2D Sentence Stream */}
      <If when={props.sentences().length > 0}>
        <View class="gap-1 py-1">
          <Each of={props.sentences()} key={(s) => `${s.startMs}-${s.endMs}-${s.index}`}>
            {(item) => (
              <View ref={(node) => props.rowRef(item().index, node)}>
                <SentenceRow
                  sentence={item}
                  isActive={() => props.activeIndex() === item().index}
                  isPlaying={() => !props.paused()}
                  isMaskAll={props.maskAll}
                  isRevealed={() => props.isRevealed(item().index)}
                  isBookmarked={() => Boolean(props.isBookmarked?.(item().index))}
                  compact={props.compact}
                  onToggleReveal={props.onToggleReveal}
                  onListen={props.onListen}
                  language={props.language}
                  activeIndex={props.activeIndex}
                  textSize={props.textSize}
                />
              </View>
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}
