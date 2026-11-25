// Word tokenization and spoken-word progress math: desktop/views/subtitleStudioHelpers.ts
// Active sentence study inspector card: desktop/views/ActiveSentenceInspector.tsx
import {
  Clipboard,
  effect,
  Scroll,
  signal,
  View,
  type ScrollRef,
  type ViewRef,
} from "nsh";
import { t, type EarLocale } from "../ui/i18n";
import { showToast } from "../ui/Toast";
import type { Sentence } from "../youtube/types";
import { ActiveSentenceInspector } from "./ActiveSentenceInspector";
import type { SubtitleTextSize } from "./playerLayout";
import { SentenceList } from "./SentenceList";
import { clampSentenceIndex } from "./sentencePlayer";
import {
  computeSpokenWordProgress,
  normalizeWordToken,
  splitSentenceTokens,
} from "./subtitleStudioHelpers";

export { computeSpokenWordProgress, normalizeWordToken, splitSentenceTokens };

export type SubtitleStudioProps = {
  sentences: () => Sentence[];
  loading: () => boolean;
  activeIndex: () => number;
  currentTimeSec?: () => number;
  paused: () => boolean;
  maskAll: () => boolean;
  isRevealed: (index: number) => boolean;
  onToggleReveal: (index: number) => void;
  onListen: (sentence: Sentence) => void;
  onRepeatSentence: () => void;
  onOpenRawSubtitles?: () => void;
  side: () => boolean;
  compact: () => boolean;
  large?: () => boolean;
  language: () => EarLocale;
  textSize: () => SubtitleTextSize;
  scrollRef: (node: ScrollRef | null) => void;
  onStreamScroll: (offsetY: number, viewportH: number) => void;
  onStreamLayout: (viewportH: number) => void;
  rowRef: (index: number, node: ViewRef | null) => void;
};

/**
 * Dual-Zone Subtitle Studio (Proposal B):
 * - Landscape (`!side`): horizontal split — Left scrollable transcript stream + Right active sentence card.
 * - Portrait (`side`): vertical split — Top scrollable transcript stream + Bottom active sentence card.
 * - Minimum window (`compact`): hides timestamps & note input to keep reading spacious at 800×560.
 */
export function SubtitleStudio(props: SubtitleStudioProps) {
  const m = () => t(props.language());
  const selectedWord = signal<{ sentenceIdx: number; tokenIdx: number; raw: string } | null>(null);
  const revealedWords = signal<Set<string>>(new Set());
  const bookmarked = signal<Set<number>>(new Set());
  const starredWords = signal<Set<string>>(new Set());
  const notes = signal<Record<number, string>>({});

  const activeSentence = (): Sentence | null => {
    const list = props.sentences();
    if (list.length === 0) return null;
    return list[clampSentenceIndex(props.activeIndex(), list.length)] ?? null;
  };

  effect(() => {
    const idx = props.activeIndex();
    const cur = selectedWord();
    if (cur && cur.sentenceIdx !== idx) selectedWord.set(null);
  });

  effect(() => {
    props.maskAll();
    revealedWords.set(new Set());
  });

  const isSentenceMasked = (s: Sentence): boolean =>
    props.maskAll() && !props.isRevealed(s.index);

  const handleWordPress = (s: Sentence, tokenIdx: number, raw: string) => {
    const wordKey = `${s.index}:${tokenIdx}`;
    if (isSentenceMasked(s) && !revealedWords().has(wordKey)) {
      const next = new Set(revealedWords());
      next.add(wordKey);
      revealedWords.set(next);
    }
    const cur = selectedWord();
    if (cur && cur.sentenceIdx === s.index && cur.tokenIdx === tokenIdx) {
      selectedWord.set(null);
    } else {
      selectedWord.set({ sentenceIdx: s.index, tokenIdx, raw });
    }
  };

  const toggleBookmark = (idx: number) => {
    const next = new Set(bookmarked());
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    bookmarked.set(next);
  };

  const toggleStarWord = (raw: string) => {
    const key = normalizeWordToken(raw) || raw.toLowerCase();
    const next = new Set(starredWords());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    starredWords.set(next);
  };

  const copySentence = (s: Sentence) => {
    void Clipboard.writeText(s.text)
      .then(() => showToast(m().copied, "info"))
      .catch(() => {});
  };

  const streamPane = (
    <Scroll
      ref={props.scrollRef}
      scrollEventThrottle={50}
      onScroll={(e) => props.onStreamScroll(e.offset.y, e.size.height)}
      onLayout={(e) => props.onStreamLayout(e.bounds.size.height)}
      class="min-h-0 flex-1"
    >
      <View class="pr-1">
        <SentenceList
          showHeader={false}
          sentences={props.sentences}
          loading={props.loading}
          activeIndex={props.activeIndex}
          paused={props.paused}
          maskAll={props.maskAll}
          isRevealed={props.isRevealed}
          isBookmarked={(idx) => bookmarked().has(idx)}
          compact={props.compact}
          onToggleReveal={props.onToggleReveal}
          onListen={props.onListen}
          language={props.language}
          textSize={props.textSize}
          rowRef={props.rowRef}
        />
      </View>
    </Scroll>
  );

  const inspectorNode = (
    <If when={activeSentence()}>
      {(getCur) => (
        <ActiveSentenceInspector
          sentence={getCur}
          totalCount={() => props.sentences().length}
          currentTimeSec={() => props.currentTimeSec?.() ?? 0}
          paused={props.paused}
          masked={() => isSentenceMasked(getCur())}
          compact={props.compact}
          large={() => Boolean(props.large?.())}
          language={props.language}
          selectedWord={selectedWord}
          revealedWords={revealedWords}
          isBookmarked={() => bookmarked().has(getCur().index)}
          isWordStarred={(raw) =>
            starredWords().has(normalizeWordToken(raw) || raw.toLowerCase())
          }
          noteValue={() => notes()[getCur().index] ?? ""}
          onNoteChange={(idx, val) => notes.set({ ...notes(), [idx]: val })}
          onWordPress={handleWordPress}
          onClearWord={() => selectedWord.set(null)}
          onStarWord={toggleStarWord}
          onToggleBookmark={toggleBookmark}
          onToggleReveal={props.onToggleReveal}
          onRepeatSentence={props.onRepeatSentence}
          onCopySentence={copySentence}
          onOpenRawSubtitles={props.onOpenRawSubtitles}
        />
      )}
    </If>
  );

  return (
    <View class="min-h-0 flex-1 bg-well/65">
      <If
        when={!props.loading() && props.sentences().length > 0}
        else={
          <View class="mx-auto min-h-0 w-full max-w-[880px] flex-1 px-4 py-3">
            {streamPane}
          </View>
        }
      >
        <View
          class={`min-h-0 flex-1 ${
            props.side()
              ? props.compact()
                ? "w-full flex-col gap-2 px-3 py-2.5"
                : "w-full flex-col gap-3 px-3.5 py-3"
              : props.compact()
                ? "mx-auto w-full max-w-[1360px] flex-row gap-2.5 px-3 py-2.5"
                : "mx-auto w-full max-w-[1360px] flex-row gap-4 px-4 py-3.5"
          }`}
        >
          {/* Left (landscape) / Top (portrait): clean 2D transcript stream */}
          <View class="min-h-0 min-w-0 flex-1">{streamPane}</View>

          {/* Right (landscape) / Bottom (portrait): active sentence study card */}
          <If
            when={props.side()}
            else={
              <Scroll class="min-h-0 min-w-0 flex-1">
                {inspectorNode}
              </Scroll>
            }
          >
            <View class="shrink-0">{inspectorNode}</View>
          </If>
        </View>
      </If>
    </View>
  );
}
