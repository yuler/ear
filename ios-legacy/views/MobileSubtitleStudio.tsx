import { Clipboard, effect, Scroll, signal, Text, View, type ScrollRef, type ViewRef } from "nsh";
import { Button } from "nsh/base";
import { Haptics } from "nsh/mobile";
import type { Locale } from "../i18n";
import {
  clampSentenceIndex,
  computeSpokenWordProgress,
  formatSentenceTime,
  formatTimeRange,
  normalizeWordToken,
  splitSentenceTokens,
  type Sentence,
} from "../player/captions";
import { playerCopyFor } from "../player/playerI18n";

/** Active sentence study inspector + scrollable transcript list aligned with Desktop SubtitleStudio. */
export function MobileSubtitleStudio(props: {
  sentences: () => Sentence[];
  loading: () => boolean;
  activeIndex: () => number;
  currentTimeSec: () => number;
  paused: () => boolean;
  maskAll: () => boolean;
  isRevealed: (index: number) => boolean;
  onToggleReveal: (index: number) => void;
  onListen: (sentence: Sentence) => void;
  onRepeatSentence: () => void;
  locale: () => Locale;
  onCopied?: (msg: string) => void;
}) {
  const pc = () => playerCopyFor(props.locale());
  const selectedWord = signal<{ sentenceIdx: number; tokenIdx: number; raw: string } | null>(null);
  const revealedWords = signal<Set<string>>(new Set());
  const bookmarked = signal<Set<number>>(new Set());
  const starredWords = signal<Set<string>>(new Set());

  let scrollNode: ScrollRef | null = null;
  let scrollOffsetY = 0;
  let scrollViewportH = 0;
  const rowNodes = new Map<number, ViewRef>();

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

  // Auto-scroll active sentence into the upper third of the transcript list.
  effect(() => {
    const idx = props.activeIndex();
    if (props.sentences().length === 0) return;
    const row = rowNodes.get(idx);
    if (!row || !scrollNode) return;
    const scroll = scrollNode;
    void Promise.all([row.measure(), scroll.measure()]).then(([r, sc]) => {
      if (!r || !sc) return;
      const rowTop = r.pagePosition.y - sc.pagePosition.y;
      const viewH = scrollViewportH || sc.bounds.size.height;
      const rowH = r.bounds.size.height || 48;
      const targetY = Math.max(0, scrollOffsetY + rowTop - (viewH * 0.3 - rowH / 2));
      scroll.scrollTo({ y: targetY, animated: true });
    });
  });

  const isSentenceMasked = (s: Sentence): boolean =>
    props.maskAll() && !props.isRevealed(s.index);

  const handleWordPress = (s: Sentence, tokenIdx: number, raw: string) => {
    Haptics.selection();
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
    Haptics.selection();
    const next = new Set(bookmarked());
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    bookmarked.set(next);
  };

  const toggleStarWord = (raw: string) => {
    Haptics.selection();
    const key = normalizeWordToken(raw) || raw.toLowerCase();
    const next = new Set(starredWords());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    starredWords.set(next);
  };

  const copySentence = (s: Sentence) => {
    Haptics.selection();
    void Clipboard.writeText(s.text)
      .then(() => props.onCopied?.(pc().copied))
      .catch(() => {});
  };

  if (props.loading()) {
    return (
      <View class="flex-1 items-center justify-center p-6">
        <Text class="text-sm text-muted-foreground">{pc().loadingCaptions}</Text>
      </View>
    );
  }

  if (props.sentences().length === 0) {
    return (
      <View class="flex-1 items-center justify-center gap-1.5 p-6">
        <Text class="text-[15px] font-semibold text-foreground">{pc().noCaptionsTitle}</Text>
        <Text class="text-center text-xs leading-relaxed text-muted-foreground">
          {pc().noCaptionsDesc}
        </Text>
      </View>
    );
  }

  const cur = activeSentence();
  const tokens = cur ? splitSentenceTokens(cur.text) : [];
  const spoken = cur
    ? computeSpokenWordProgress(cur, props.currentTimeSec(), tokens)
    : { progress: 0, spokenIndex: -1 };
  const sweeping = !props.paused() && spoken.spokenIndex >= 0 && spoken.spokenIndex < tokens.length;
  const selWord =
    cur && selectedWord()?.sentenceIdx === cur.index ? selectedWord() : null;

  return (
    <View class="min-h-0 flex-1 flex-col bg-background">
      {/* Active Sentence Study Card */}
      {cur ? (
        <View class="shrink-0 flex-col gap-2 px-3 pt-3 pb-2">
          <View class="overflow-hidden rounded-2xl border border-line/70 bg-card shadow-sm">
            {/* 2px live speech progress hairline */}
            <View class="h-[2px] w-full bg-well">
              <View
                style={{ width: `${Math.round(spoken.progress * 100)}%` }}
                class="h-full bg-tint"
              />
            </View>

            <View class="flex-col gap-2.5 px-3.5 pt-2.5 pb-2.5">
              {/* Top strip: rhythm metadata or selected word */}
              <View class="flex-row items-center justify-between gap-2">
                {selWord ? (
                  <View class="min-w-0 flex-1 flex-row items-center gap-2">
                    <Text class="text-sm font-bold text-tint">
                      {selWord.raw.replace(/[.,!?;:]+$/, "")}
                    </Text>
                    <Text class="text-xs text-muted-foreground">{pc().selectedWord}</Text>
                  </View>
                ) : (
                  <View class="min-w-0 flex-1 flex-row flex-wrap items-center gap-1.5">
                    <Text class="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                      {formatTimeRange(cur.startMs, cur.endMs)}
                    </Text>
                    <Text class="text-[11px] text-dim">·</Text>
                    <Text class="font-mono text-[11px] text-muted-foreground">
                      {cur.wpm} wpm
                    </Text>
                    <View class="rounded bg-amber-soft px-1.5 py-0.5">
                      <Text class="font-mono text-[10px] font-semibold text-amber">
                        {cur.difficulty}
                      </Text>
                    </View>
                  </View>
                )}

                {selWord ? (
                  <View class="flex-row items-center gap-1.5">
                    <Button
                      onPress={() => toggleStarWord(selWord.raw)}
                      class="rounded-full bg-amber-soft px-2.5 py-1 active:opacity-70"
                    >
                      <Text class="text-xs font-semibold text-amber">
                        {starredWords().has(
                          normalizeWordToken(selWord.raw) || selWord.raw.toLowerCase(),
                        )
                          ? "★"
                          : "☆"}
                      </Text>
                    </Button>
                    <Button
                      onPress={() => selectedWord.set(null)}
                      class="rounded-full bg-well px-2 py-1 active:opacity-70"
                    >
                      <Text class="text-xs font-semibold text-muted-foreground">✕</Text>
                    </Button>
                  </View>
                ) : (
                  <Text class="font-mono text-[11px] tabular-nums text-dim">
                    {`${cur.index + 1}/${props.sentences().length}`}
                  </Text>
                )}
              </View>

              {/* Interactive word chips with spoken highlight & mask peek */}
              <View class="flex-row flex-wrap items-center gap-x-1 gap-y-1.5">
                {tokens.map((tok, idx) => {
                  const wordHidden =
                    isSentenceMasked(cur) && !revealedWords().has(`${cur.index}:${idx}`);
                  const isSel = Boolean(selWord && selWord.tokenIdx === idx && !wordHidden);
                  const isSpokenNow = sweeping && spoken.spokenIndex === idx;
                  const isUpcoming = sweeping && idx > spoken.spokenIndex;
                  return (
                    <Button
                      onPress={() => handleWordPress(cur, idx, tok)}
                      class={`rounded-lg border px-1.5 py-0.5 ${
                        wordHidden
                          ? isSpokenNow
                            ? "border-tint/40 bg-tint/20"
                            : "border-transparent bg-well"
                          : isSel
                            ? "border-tint bg-tint-soft"
                            : isSpokenNow
                              ? "border-transparent bg-tint-soft"
                              : "border-transparent"
                      }`}
                    >
                      <Text
                        style={{ opacity: wordHidden ? 0 : isUpcoming ? 0.5 : 1 }}
                        class="text-[16px] font-semibold leading-snug text-foreground"
                      >
                        {tok}
                      </Text>
                    </Button>
                  );
                })}
              </View>

              {/* Micro action bar */}
              <View class="flex-row items-center justify-between border-t border-line/60 pt-2">
                <View class="flex-row items-center gap-2">
                  <Button
                    onPress={() => {
                      Haptics.selection();
                      props.onRepeatSentence();
                    }}
                    class="rounded-lg bg-well px-2.5 py-1 active:opacity-70"
                  >
                    <Text class="text-xs font-medium text-foreground">{`↻ ${pc().repeatSentence}`}</Text>
                  </Button>
                  <Button
                    onPress={() => {
                      Haptics.selection();
                      props.onToggleReveal(cur.index);
                    }}
                    class={`rounded-lg px-2.5 py-1 active:opacity-70 ${
                      !isSentenceMasked(cur) ? "bg-tint-soft" : "bg-well"
                    }`}
                  >
                    <Text
                      class={`text-xs font-medium ${
                        !isSentenceMasked(cur) ? "text-tint" : "text-foreground"
                      }`}
                    >
                      {isSentenceMasked(cur) ? pc().revealSentence : pc().hideSentence}
                    </Text>
                  </Button>
                  <Button
                    onPress={() => copySentence(cur)}
                    class="rounded-lg bg-well px-2.5 py-1 active:opacity-70"
                  >
                    <Text class="text-xs font-medium text-foreground">{pc().copySentence}</Text>
                  </Button>
                </View>

                <Button
                  onPress={() => toggleBookmark(cur.index)}
                  class={`rounded-lg px-2.5 py-1 active:opacity-70 ${
                    bookmarked().has(cur.index) ? "bg-tint-soft" : "bg-well"
                  }`}
                >
                  <Text
                    class={`text-xs font-semibold ${
                      bookmarked().has(cur.index) ? "text-tint" : "text-muted-foreground"
                    }`}
                  >
                    {bookmarked().has(cur.index) ? "★" : "☆"}
                  </Text>
                </Button>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* Scrollable Transcript Stream */}
      <Scroll
        ref={(node) => {
          scrollNode = node;
        }}
        scrollEventThrottle={50}
        onScroll={(e) => {
          scrollOffsetY = e.offset.y;
          scrollViewportH = e.size.height;
        }}
        onLayout={(e) => {
          scrollViewportH = e.bounds.size.height;
        }}
        class="min-h-0 flex-1"
      >
        <View class="flex-col gap-1 px-3 pt-1 pb-10">
          {props.sentences().map((s) => {
            const active = props.activeIndex() === s.index;
            const masked = isSentenceMasked(s);
            return (
              <View
                ref={(node) => {
                  if (node) rowNodes.set(s.index, node);
                  else rowNodes.delete(s.index);
                }}
                onPress={() => {
                  Haptics.selection();
                  if (props.maskAll() && active) {
                    props.onToggleReveal(s.index);
                  }
                  props.onListen(s);
                }}
                class={`flex-row items-start gap-2.5 rounded-xl px-2.5 py-2 ${
                  active ? "bg-tint-soft" : "bg-transparent active:bg-card"
                }`}
              >
                <View
                  class={`mt-1 h-3.5 w-[3px] shrink-0 rounded-full ${
                    active ? "bg-tint" : "bg-transparent"
                  }`}
                />
                <Text
                  class={`mt-0.5 w-9 shrink-0 font-mono text-[11px] tabular-nums ${
                    active ? "text-tint" : "text-dim"
                  }`}
                >
                  {formatSentenceTime(s.startMs)}
                </Text>
                <View class="relative min-w-0 flex-1">
                  <Text
                    style={{ opacity: masked ? 0 : 1 }}
                    class={`text-sm leading-snug ${
                      active ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                    }`}
                  >
                    {s.text}
                  </Text>
                  {masked ? (
                    <View class="pointer-events-none absolute inset-0 justify-center gap-1.5 py-0.5">
                      <View
                        class={`h-2.5 w-4/5 rounded-full ${
                          active ? "bg-tint/25" : "bg-foreground/10"
                        }`}
                      />
                      {s.wordCount > 7 ? (
                        <View
                          class={`h-2.5 w-3/5 rounded-full ${
                            active ? "bg-tint/15" : "bg-foreground/10"
                          }`}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
                {bookmarked().has(s.index) ? (
                  <View class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tint" />
                ) : null}
              </View>
            );
          })}
        </View>
      </Scroll>
    </View>
  );
}
