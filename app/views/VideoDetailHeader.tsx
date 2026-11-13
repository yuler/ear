import { signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { LibraryEntry } from "../library/types";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import { macTitleBarInsets } from "../ui/titleBarInsets";
import type { SentenceLengthMode } from "../youtube/captions";

export type VideoDetailHeaderProps = {
  entry: () => LibraryEntry;
  totalSentences: () => number;
  loadingSentences: () => boolean;
  audioOnly?: () => boolean;
  onBack: () => void;
  visible?: () => boolean;
  onActivity?: () => void;
  language?: () => EarLocale;
  maskAll?: () => boolean;
  onToggleMask?: () => void;
  sentenceLength?: () => SentenceLengthMode;
  onChangeSentenceLength?: (mode: SentenceLengthMode) => void;
  onChangeLanguage?: (lang: EarLocale) => void;
};

/**
 * Immersive top header overlay for video detail view.
 * Pinned to the top of the video container ("吸顶").
 * Auto-hides during playback after inactivity for full immersion;
 * reappears smoothly on hover or mouse movement.
 * Displays a large back arrow, video title, resolution, captions count, and subtitle tags.
 */
export function VideoDetailHeader(props: VideoDetailHeaderProps) {
  const lang = () => props.language?.() ?? "zh";
  const m = () => t(lang());
  const entry = () => props.entry();
  const quality = () => entry().quality ?? (props.audioOnly?.() ? "Audio" : "Video");

  const isVisible = () => (props.visible ? props.visible() : false);
  const leftInset = () => macTitleBarInsets().left;

  const handleMouseEnter = () => {
    props.onActivity?.();
  };

  const handleMouseLeave = () => {
    // Parent handles hide countdown
  };

  const handleMouseMove = () => {
    props.onActivity?.();
  };

  return (
    <View
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={leftInset() > 0 ? { paddingLeft: leftInset() + 12 } : undefined}
      class={`absolute top-0 inset-x-0 z-30 flex-row items-center justify-between px-3 pt-3 pb-6 sm:px-5 sm:pt-4 bg-gradient-to-b from-black/90 via-black/45 to-transparent transition-all duration-300 ease-out ${
        isVisible()
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      {/* Left: Large back arrow + Title + Resolution / Subtitle metadata */}
      <View class="flex-1 min-w-0 flex-row items-center gap-3">
        {/* Large Prominent Back Arrow Button */}
        <Button
          onPress={props.onBack}
          class="h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/50 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black/75 hover:border-white/40 active:scale-95"
          accessibilityLabel={m().backToLibrary}
        >
          <Icon name="chevron-left" size={20} color="#ffffff" />
        </Button>

        {/* Video Title and Metadata Tags */}
        <View selectable class="flex-1 min-w-0 flex-col justify-center gap-0.5 select-text">
          <Text
            class="select-text truncate text-sm sm:text-base font-semibold text-white drop-shadow-md"
            accessibilityLabel={entry().title}
          >
            {entry().title}
          </Text>

          <View class="flex-row flex-wrap items-center gap-1.5 text-xs text-white/80">
            {/* Resolution / Quality tag pill */}
            <View class="rounded border border-white/30 bg-white/20 px-1.5 py-0.5 backdrop-blur-xs">
              <Text class="font-mono text-[10px] font-semibold text-white">
                {quality()}
              </Text>
            </View>

            <Text class="text-white opacity-60">·</Text>

            {/* Sentence count */}
            <Text class="font-mono text-[11px] text-white opacity-90">
              {props.totalSentences() > 0
                ? m().sentencesMeta(props.totalSentences())
                : props.loadingSentences()
                  ? m().parsingCaptions
                  : m().noCaptionsMeta}
            </Text>

            {/* Subtitle tag / badge if present */}
            <If when={Boolean(entry().subtitleLabel)}>
              <Text class="text-white opacity-60">·</Text>
              <Text class="truncate text-[11px] text-white opacity-90 max-w-[200px] sm:max-w-[360px]">
                {entry().subtitleLabel}
              </Text>
            </If>
          </View>
        </View>
      </View>
    </View>
  );
}
