import {
  Clipboard,
  effect,
  Scroll,
  signal,
  Text,
  View,
  type ScrollRef,
  type ViewRef,
} from "nsh";
import { Button, Input } from "nsh/base";
import { AppTooltip } from "../ui/AppTooltip";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import { showToast } from "../ui/Toast";
import type { Sentence } from "../youtube/types";
import type { SubtitleTextSize } from "./playerLayout";
import { SentenceList } from "./SentenceList";
import { clampSentenceIndex, formatTimeRange } from "./sentencePlayer";

export type SubtitleStudioProps = {
  sentences: () => Sentence[];
  loading: () => boolean;
  activeIndex: () => number;
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

/** Normalize a word token for star/selection lookup (strips surrounding punctuation). */
export function normalizeWordToken(raw: string): string {
  return raw.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
}

/** Split a sentence into clickable display tokens. */
export function splitSentenceTokens(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function ActiveSentenceInspector(props: {
  sentence: () => Sentence;
  totalCount: () => number;
  masked: () => boolean;
  compact: () => boolean;
  large: () => boolean;
  language: () => EarLocale;
  selectedWord: () => { sentenceIdx: number; tokenIdx: number; raw: string } | null;
  revealedWords: () => Set<string>;
  isBookmarked: () => boolean;
  isWordStarred: (raw: string) => boolean;
  noteValue: () => string;
  onNoteChange: (sentenceIdx: number, value: string) => void;
  onWordPress: (s: Sentence, tokenIdx: number, raw: string) => void;
  onClearWord: () => void;
  onStarWord: (raw: string) => void;
  onToggleBookmark: (sentenceIdx: number) => void;
  onToggleReveal: (sentenceIdx: number) => void;
  onRepeatSentence: () => void;
  onCopySentence: (s: Sentence) => void;
  onOpenRawSubtitles?: () => void;
}) {
  const m = () => t(props.language());
  const cur = () => props.sentence();
  const tokens = () => splitSentenceTokens(cur().text);
  const selWord = () => {
    const sel = props.selectedWord();
    return sel && sel.sentenceIdx === cur().index ? sel : null;
  };
  const wordTextClass = () => {
    if (props.compact()) return "text-[17px] leading-snug";
    if (props.large()) return "text-[23px] leading-snug";
    return "text-xl leading-snug";
  };

  return (
    <View class={props.compact() ? "gap-2" : "gap-2.5"}>
      {/* Top Callout Strip: warm amber sentence rhythm bar, or brand-blue selected word bar */}
      <View
        class={`flex-row items-center justify-between gap-2 rounded-xl border px-3.5 ${
          props.compact() ? "py-1.5" : "py-2"
        } ${
          selWord()
            ? "border-brand/35 bg-brand-soft"
            : "border-amber/30 bg-amber-soft"
        }`}
      >
        <If
          when={Boolean(selWord())}
          else={
            <View class="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
              <Text class="font-mono text-xs font-semibold tabular-nums text-foreground">
                {formatTimeRange(cur().startMs, cur().endMs)}
              </Text>
              <Text class="text-xs text-muted-foreground">·</Text>
              <Text class="font-mono text-xs tabular-nums text-muted-foreground">
                {cur().wpm} wpm
              </Text>
              <View class="rounded-md bg-background/60 px-1.5 py-0.5">
                <Text class="font-mono text-[10px] font-semibold text-amber">
                  {cur().difficulty}
                </Text>
              </View>
            </View>
          }
        >
          <View class="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
            <Text class="text-sm font-bold text-foreground">
              {(selWord()?.raw ?? "").replace(/[.,!?;:]+$/, "")}
            </Text>
            <Text class="text-xs text-muted-foreground">{m().selectedWord}</Text>
          </View>
        </If>

        <If
          when={Boolean(selWord())}
          else={
            <Button
              onPress={() => props.onToggleBookmark(cur().index)}
              class="h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-background/50"
              accessibilityLabel={
                props.isBookmarked() ? m().unbookmarkSentence : m().bookmarkSentence
              }
              tooltip={
                <AppTooltip
                  label={
                    props.isBookmarked() ? m().unbookmarkSentence : m().bookmarkSentence
                  }
                />
              }
            >
              <Icon
                name="bookmark"
                size={14}
                tone={props.isBookmarked() ? "brand" : "muted-foreground"}
              />
            </Button>
          }
        >
          <View class="shrink-0 flex-row items-center gap-1">
            <Button
              onPress={() => {
                const w = selWord();
                if (w) props.onStarWord(w.raw);
              }}
              class="h-7 w-7 items-center justify-center rounded-lg transition hover:bg-background/50"
              accessibilityLabel={m().starWord}
              tooltip={<AppTooltip label={m().starWord} />}
            >
              <Icon
                name="star"
                size={14}
                tone={
                  selWord() && props.isWordStarred(selWord()!.raw)
                    ? "amber"
                    : "muted-foreground"
                }
              />
            </Button>
            <Button
              onPress={props.onClearWord}
              class="h-7 w-7 items-center justify-center rounded-lg transition hover:bg-background/50"
              accessibilityLabel="Clear word selection"
            >
              <Icon name="x" size={13} tone="muted-foreground" />
            </Button>
          </View>
        </If>
      </View>

      {/* Elevated Active Sentence Study Card */}
      <View
        class={`rounded-2xl border border-line bg-card shadow-sm ${
          props.compact() ? "gap-2 px-3.5 pt-3 pb-2" : "gap-2.5 px-4 pt-4 pb-3"
        }`}
      >
        {/* Interactive word chips (tap to focus or peek individual masked words) */}
        <View class="flex-row flex-wrap items-center gap-x-1 gap-y-1.5">
          <Each of={tokens()} key={(_tok, idx) => `${cur().index}-${idx}`}>
            {(getTok, getIdx) => {
              const wordHidden = () =>
                props.masked() && !props.revealedWords().has(`${cur().index}:${getIdx()}`);
              const isSel = () => {
                const w = selWord();
                return Boolean(w && w.tokenIdx === getIdx() && !wordHidden());
              };
              return (
                <Button
                  onPress={() => props.onWordPress(cur(), getIdx(), getTok())}
                  class={`rounded-lg border px-1.5 py-0.5 transition ${
                    wordHidden()
                      ? "border-transparent bg-well hover:bg-brand-soft"
                      : isSel()
                        ? "border-brand bg-brand-soft"
                        : "border-transparent hover:bg-brand-soft/60"
                  }`}
                  accessibilityLabel={wordHidden() ? "Peek masked word" : getTok()}
                >
                  <Text
                    class={`font-semibold ${wordTextClass()} ${
                      wordHidden() ? "text-transparent" : "text-foreground"
                    }`}
                  >
                    {getTok()}
                  </Text>
                </Button>
              );
            }}
          </Each>
        </View>

        <If when={props.masked()}>
          <Text class="text-xs text-muted-foreground">{m().blindPeekHint}</Text>
        </If>

        {/* Compact per-sentence note input (hidden on 800x560 compact layout) */}
        <If when={!props.compact()}>
          <View class="rounded-lg border border-line bg-well px-2.5 py-1.5">
            <Input
              value={props.noteValue()}
              onChange={(e) => props.onNoteChange(cur().index, e.value)}
              placeholder={m().notePlaceholder}
              class="w-full text-xs text-foreground placeholder:text-dim"
            />
          </View>
        </If>

        {/* Bottom Micro Action Bar */}
        <View class="flex-row items-center justify-between gap-2 border-t border-line/70 pt-2">
          <View class="flex-row items-center gap-1">
            <Button
              onPress={props.onRepeatSentence}
              class="h-7 w-7 items-center justify-center rounded-lg transition hover:bg-well active:bg-accent"
              accessibilityLabel={m().repeatSentence}
              tooltip={<AppTooltip label={`${m().repeatSentence} (R)`} />}
            >
              <Icon name="repeat" size={14} tone="muted-foreground" />
            </Button>
            <Button
              onPress={() => props.onToggleReveal(cur().index)}
              class={`h-7 w-7 items-center justify-center rounded-lg transition ${
                !props.masked() ? "bg-brand-soft" : "hover:bg-well active:bg-accent"
              }`}
              accessibilityLabel={props.masked() ? m().revealSentence : m().hideSentence}
              tooltip={
                <AppTooltip
                  label={props.masked() ? m().revealSentence : m().hideSentence}
                />
              }
            >
              <Icon
                name={props.masked() ? "eye-off" : "eye"}
                size={14}
                tone={!props.masked() ? "brand" : "muted-foreground"}
              />
            </Button>
            <Button
              onPress={() => props.onCopySentence(cur())}
              class="h-7 w-7 items-center justify-center rounded-lg transition hover:bg-well active:bg-accent"
              accessibilityLabel={m().copySentence}
              tooltip={<AppTooltip label={m().copySentence} />}
            >
              <Icon name="clipboard" size={14} tone="muted-foreground" />
            </Button>
            <Button
              onPress={() => props.onToggleBookmark(cur().index)}
              class={`h-7 w-7 items-center justify-center rounded-lg transition ${
                props.isBookmarked() ? "bg-brand-soft" : "hover:bg-well active:bg-accent"
              }`}
              accessibilityLabel={
                props.isBookmarked() ? m().unbookmarkSentence : m().bookmarkSentence
              }
              tooltip={
                <AppTooltip
                  label={
                    props.isBookmarked() ? m().unbookmarkSentence : m().bookmarkSentence
                  }
                />
              }
            >
              <Icon
                name="bookmark"
                size={14}
                tone={props.isBookmarked() ? "brand" : "muted-foreground"}
              />
            </Button>
            <If when={Boolean(props.onOpenRawSubtitles)}>
              <Button
                onPress={() => props.onOpenRawSubtitles?.()}
                class="h-7 w-7 items-center justify-center rounded-lg transition hover:bg-well active:bg-accent"
                accessibilityLabel={m().rawSubtitles}
                tooltip={<AppTooltip label={m().rawSubtitles} />}
              >
                <Icon name="subtitles" size={14} tone="muted-foreground" />
              </Button>
            </If>
          </View>
          <Text class="font-mono text-[11px] tabular-nums text-dim">
            {cur().index + 1}/{props.totalCount()} · {cur().wpm} wpm
          </Text>
        </View>
      </View>
    </View>
  );
}

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
