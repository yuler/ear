import {
  Clipboard,
  effect,
  keymap,
  Scroll,
  signal,
  Text,
  View,
} from "nsh";
import { exists, readFile } from "fs/promises";
import { Button } from "nsh/base";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import { showToast } from "../ui/Toast";
import type { CaptionCue, Sentence } from "../youtube/types";
import { formatSentenceTime } from "./sentencePlayer";

export type RawSubtitlesModalProps = {
  open: () => boolean;
  onClose: () => void;
  captionsPath: () => string | null | undefined;
  cues: () => CaptionCue[];
  sentences: () => Sentence[];
  language: () => EarLocale;
};

type RawTab = "cues" | "json";

/** Format raw subtitle payload for inspection and clipboard copy. */
export function buildRawSubtitlesJson(
  captionsPath: string | null | undefined,
  cues: readonly CaptionCue[],
  sentences: readonly Sentence[],
): string {
  return JSON.stringify(
    {
      captionsPath: captionsPath ?? null,
      cueCount: cues.length,
      sentenceCount: sentences.length,
      cues,
      sentences,
    },
    null,
    2,
  );
}

function RawSubtitlesModalDialog(props: Omit<RawSubtitlesModalProps, "open">) {
  const m = () => t(props.language());
  const tab = signal<RawTab>("cues");
  const rawFileText = signal<string | null>(null);
  const loadingFile = signal(false);

  // Load the verbatim captions file on disk when available.
  effect(() => {
    const path = props.captionsPath();
    if (!path) {
      rawFileText.set(null);
      return;
    }
    let cancelled = false;
    loadingFile.set(true);
    void (async () => {
      try {
        if (await exists(path)) {
          const text = await readFile(path, "utf8");
          if (!cancelled) {
            try {
              rawFileText.set(JSON.stringify(JSON.parse(text), null, 2));
            } catch {
              rawFileText.set(text);
            }
          }
        } else if (!cancelled) {
          rawFileText.set(null);
        }
      } catch {
        if (!cancelled) rawFileText.set(null);
      } finally {
        if (!cancelled) loadingFile.set(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  keymap.bind(
    {
      escape: props.onClose,
      space: () => {},
      enter: () => {},
      left: () => {},
      right: () => {},
      up: () => {},
      down: () => {},
      r: () => {},
      m: () => {},
      b: () => {},
      "[": () => {},
      "]": () => {},
      "0": () => {},
    },
    { when: "notEditing" },
  );

  const jsonContent = () =>
    rawFileText() ??
    buildRawSubtitlesJson(props.captionsPath(), props.cues(), props.sentences());

  const copyRawJson = () => {
    void Clipboard.writeText(jsonContent())
      .then(() => showToast(m().copied, "info"))
      .catch(() => {});
  };

  return (
    <View class="fixed inset-0 z-[80] flex-col items-center justify-center bg-black/65 p-4 backdrop-blur-md sm:p-6">
      <Button
        onPress={props.onClose}
        class="absolute inset-0 cursor-default"
        accessibilityLabel="Close raw subtitles overlay"
      />

      <View
        style={{ height: 600, maxHeight: "88%" }}
        class="relative z-10 w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-line bg-background shadow-2xl"
        accessibilityLabel={m().rawSubtitles}
      >
        {/* Header */}
        <View class="shrink-0 flex-row items-center justify-between gap-3 border-b border-line bg-well/40 px-5 py-3.5">
          <View class="min-w-0 flex-1 flex-row items-center gap-2.5">
            <View class="h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-well">
              <Icon name="subtitles" size={15} tone="muted-foreground" />
            </View>
            <View class="min-w-0 flex-1">
              <Text class="text-sm font-semibold text-foreground">
                {m().rawSubtitles}
              </Text>
              <Text class="truncate font-mono text-[11px] text-dim">
                {props.cues().length} cues · {props.sentences().length} sentences
                {props.captionsPath() ? ` · ${props.captionsPath()}` : ""}
              </Text>
            </View>
          </View>

          <View class="shrink-0 flex-row items-center gap-2">
            {/* Tab toggle */}
            <View class="flex-row items-center rounded-lg border border-line bg-well p-0.5">
              <Button
                onPress={() => tab.set("cues")}
                class={`rounded-md px-2.5 py-1 transition ${
                  tab() === "cues" ? "bg-brand" : "hover:bg-accent"
                }`}
                accessibilityLabel={m().rawCuesTab}
              >
                <Text
                  class={`text-xs font-medium ${
                    tab() === "cues" ? "text-brand-foreground" : "text-muted-foreground"
                  }`}
                >
                  {m().rawCuesTab} ({props.cues().length})
                </Text>
              </Button>
              <Button
                onPress={() => tab.set("json")}
                class={`rounded-md px-2.5 py-1 transition ${
                  tab() === "json" ? "bg-brand" : "hover:bg-accent"
                }`}
                accessibilityLabel={m().rawJsonTab}
              >
                <Text
                  class={`text-xs font-medium ${
                    tab() === "json" ? "text-brand-foreground" : "text-muted-foreground"
                  }`}
                >
                  {m().rawJsonTab}
                </Text>
              </Button>
            </View>

            <Button
              onPress={copyRawJson}
              class="flex-row items-center gap-1.5 rounded-lg border border-line bg-well px-2.5 py-1.5 transition hover:bg-accent active:scale-95"
              accessibilityLabel={m().copyRawJson}
            >
              <Icon name="clipboard" size={13} tone="foreground" />
              <Text class="text-xs font-medium text-foreground">{m().copyRawJson}</Text>
            </Button>

            <Button
              onPress={props.onClose}
              class="h-7 w-7 items-center justify-center rounded-lg border border-line bg-well transition hover:bg-accent active:scale-95"
              accessibilityLabel="Close"
            >
              <Icon name="x" size={13} tone="foreground" />
            </Button>
          </View>
        </View>

        {/* Body */}
        <Scroll class="min-h-0 flex-1 p-4">
          <If when={tab() === "cues"}>
            <If
              when={props.cues().length > 0}
              else={
                <View class="items-center justify-center py-12">
                  <Text class="text-xs text-muted-foreground">{m().noRawCues}</Text>
                </View>
              }
            >
              <View selectable class="gap-1.5 select-text">
                <Each of={props.cues()} key={(c, i) => `${i}-${c.startMs}-${c.endMs}`}>
                  {(getCue, getIdx) => (
                    <View class="flex-row items-start gap-3 rounded-lg border border-line/60 bg-card px-3 py-2">
                      <Text class="w-8 shrink-0 font-mono text-[11px] tabular-nums text-dim">
                        #{getIdx()}
                      </Text>
                      <View class="w-36 shrink-0">
                        <Text class="font-mono text-[11px] tabular-nums text-brand">
                          {formatSentenceTime(getCue().startMs)} →{" "}
                          {formatSentenceTime(getCue().endMs)}
                        </Text>
                        <Text class="font-mono text-[10px] tabular-nums text-dim">
                          {getCue().startMs}–{getCue().endMs}ms
                        </Text>
                      </View>
                      <Text class="min-w-0 flex-1 select-text text-xs leading-relaxed text-foreground">
                        {getCue().text}
                      </Text>
                    </View>
                  )}
                </Each>
              </View>
            </If>
          </If>

          <If when={tab() === "json"}>
            <View selectable class="rounded-xl border border-line bg-well/60 p-3.5 select-text">
              <If
                when={!loadingFile()}
                else={
                  <Text class="font-mono text-xs text-muted-foreground">Loading…</Text>
                }
              >
                <Text class="select-text font-mono text-[11px] leading-relaxed text-foreground">
                  {jsonContent()}
                </Text>
              </If>
            </View>
          </If>
        </Scroll>
      </View>
    </View>
  );
}

export function RawSubtitlesModal(props: RawSubtitlesModalProps) {
  return (
    <If when={props.open()}>
      <RawSubtitlesModalDialog
        onClose={props.onClose}
        captionsPath={props.captionsPath}
        cues={props.cues}
        sentences={props.sentences}
        language={props.language}
      />
    </If>
  );
}
