import { effect, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { AppTooltip } from "../ui/AppTooltip";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import type { Sentence } from "../youtube/types";
import { formatTimeRange } from "./sentencePlayer";
import {
  computeSpokenWordProgress,
  splitSentenceTokens,
} from "./subtitleStudioHelpers";

export type ActiveSentenceInspectorProps = {
  sentence: () => Sentence;
  totalCount: () => number;
  currentTimeSec: () => number;
  paused: () => boolean;
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
};

/**
 * Right (landscape) / Bottom (portrait) study inspector for the active sentence:
 * callout strip, 2px speech progress line, sentence glide + word-by-word sweep,
 * note field (desktop), and bottom micro action bar.
 */
export function ActiveSentenceInspector(props: ActiveSentenceInspectorProps) {
  const m = () => t(props.language());
  const cur = () => props.sentence();
  const tokens = () => splitSentenceTokens(cur().text);
  const spoken = () =>
    computeSpokenWordProgress(cur(), props.currentTimeSec(), tokens());
  const sweeping = () =>
    !props.paused() &&
    spoken().spokenIndex >= 0 &&
    spoken().spokenIndex < tokens().length;

  // Subtle upward glide when switching to a new sentence without shifting card height.
  const sentenceEntered = signal(true);
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  effect(() => {
    cur().index;
    sentenceEntered.set(false);
    if (enterTimer) clearTimeout(enterTimer);
    enterTimer = setTimeout(() => {
      sentenceEntered.set(true);
    }, 16);
    return () => {
      if (enterTimer) clearTimeout(enterTimer);
    };
  });

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

      {/* Elevated Active Sentence Study Card (fixed height across mask toggles) */}
      <View class="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
        {/* Live 2px sentence speech progress hairline */}
        <View class="h-[2px] w-full bg-well">
          <View
            style={{ width: `${Math.round(spoken().progress * 100)}%` }}
            class="h-full bg-brand transition-all duration-100"
          />
        </View>

        <View
          class={props.compact() ? "gap-2 px-3.5 pt-3 pb-2" : "gap-2.5 px-4 pt-3.5 pb-3"}
        >
          {/* Interactive word chips with sentence glide & word-by-word sweep */}
          <View
            style={{
              opacity: sentenceEntered() ? 1 : 0.35,
              transform: sentenceEntered() ? [{ translateY: 0 }] : [{ translateY: 5 }],
              transitionProperty: "opacity, transform",
              transitionDuration: sentenceEntered() ? "220ms" : "0ms",
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            class="flex-row flex-wrap items-center gap-x-1 gap-y-1.5"
          >
            <Each of={tokens()} key={(_tok, idx) => `${cur().index}-${idx}`}>
              {(getTok, getIdx) => {
                const wordHidden = () =>
                  props.masked() && !props.revealedWords().has(`${cur().index}:${getIdx()}`);
                const isSel = () => {
                  const w = selWord();
                  return Boolean(w && w.tokenIdx === getIdx() && !wordHidden());
                };
                const isSpokenNow = () => sweeping() && spoken().spokenIndex === getIdx();
                const isSpokenPast = () => sweeping() && getIdx() < spoken().spokenIndex;
                const isUpcoming = () => sweeping() && getIdx() > spoken().spokenIndex;
                const staggerDelay = (): `${number}ms` =>
                  `${Math.min(getIdx() * 16, 200)}ms`;

                return (
                  <Button
                    onPress={() => props.onWordPress(cur(), getIdx(), getTok())}
                    style={{
                      transform: isSpokenNow() ? [{ scale: 1.04 }] : [{ scale: 1 }],
                      transitionProperty: "background-color, border-color, transform",
                      transitionDuration: "160ms",
                      transitionTimingFunction: "ease-out",
                    }}
                    class={`rounded-lg border px-1.5 py-0.5 ${
                      wordHidden()
                        ? isSpokenNow()
                          ? "border-brand/40 bg-brand/25"
                          : isSpokenPast()
                            ? "border-transparent bg-brand/12"
                            : "border-transparent bg-well hover:bg-brand-soft"
                        : isSel()
                          ? "border-brand bg-brand-soft"
                          : isSpokenNow()
                            ? "border-transparent bg-brand-soft/90"
                            : "border-transparent hover:bg-brand-soft/60"
                    }`}
                    accessibilityLabel={wordHidden() ? "Peek masked word" : getTok()}
                  >
                    <Text
                      style={{
                        opacity: wordHidden() ? 0 : isUpcoming() ? 0.45 : 1,
                        transitionProperty: "opacity",
                        transitionDuration: "180ms",
                        transitionDelay: sweeping() ? "0ms" : staggerDelay(),
                        transitionTimingFunction: "ease-out",
                      }}
                      class={`font-semibold text-foreground ${wordTextClass()}`}
                    >
                      {getTok()}
                    </Text>
                  </Button>
                );
              }}
            </Each>
          </View>

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
    </View>
  );
}
