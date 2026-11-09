import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "./Icon";

export type ActivityKind = "parsing" | "downloading" | null;

export function ActivityBanner(props: {
  kind: () => ActivityKind;
  progress: () => number;
  targetTitle: () => string;
  error: () => string | null;
  status: () => string | null;
  onDismissStatus: () => void;
}) {
  const parseStep = () => {
    const p = props.progress();
    if (p < 38) return 1;
    if (p < 74) return 2;
    return 3;
  };

  const parseStageLabel = () => {
    const step = parseStep();
    if (step === 1) return "Connecting & parsing YouTube watch page...";
    if (step === 2) return "Extracting VisionOS progressive audio stream...";
    return "Merging English CC cues into practice sentences...";
  };

  const downloadStageLabel = () => {
    const p = props.progress();
    if (p < 40) return "Writing timed captions (captions.json)...";
    if (p < 82) return "Streaming M4A audio track to local disk...";
    return "Indexing offline lesson in local library...";
  };

  return (
    <View class="gap-2.5">
      {/* Animated Parsing Card */}
      <If when={props.kind() === "parsing"}>
        <View class="gap-3 rounded-2xl border border-amber/50 bg-popover p-4 shadow-lg">
          <View class="flex-row items-center justify-between gap-3">
            <View class="flex-row items-center gap-3">
              <View class="h-10 w-10 items-center justify-center rounded-xl bg-amber/20 animate-pulse">
                <Icon
                  name="loader"
                  size={20}
                  tone="amber"
                  class="animate-spin"
                />
              </View>
              <View class="gap-0.5">
                <View class="flex-row items-center gap-2">
                  <Text class="text-sm font-bold text-foreground">
                    Parsing Video & Subtitles...
                  </Text>
                  <View class="rounded-full bg-amber-soft px-2.5 py-0.5 animate-pulse">
                    <Text class="font-mono text-xs font-bold tabular-nums text-amber">
                      {props.progress()}%
                    </Text>
                  </View>
                </View>
                <Text class="text-xs text-muted-foreground">
                  {parseStageLabel()} · {props.targetTitle()}
                </Text>
              </View>
            </View>

            <View class="hidden flex-row items-center gap-1.5 sm:flex">
              <View
                class={`rounded-full px-2.5 py-1 ${
                  parseStep() >= 1 ? "bg-amber-soft" : "bg-raised"
                }`}
              >
                <Text
                  class={`font-mono text-[10px] font-semibold ${
                    parseStep() >= 1 ? "text-amber" : "text-faint"
                  }`}
                >
                  1 · Video Info
                </Text>
              </View>
              <View
                class={`rounded-full px-2.5 py-1 ${
                  parseStep() >= 2 ? "bg-amber-soft" : "bg-raised"
                }`}
              >
                <Text
                  class={`font-mono text-[10px] font-semibold ${
                    parseStep() >= 2 ? "text-amber" : "text-faint"
                  }`}
                >
                  2 · Audio Stream
                </Text>
              </View>
              <View
                class={`rounded-full px-2.5 py-1 ${
                  parseStep() >= 3 ? "bg-amber-soft" : "bg-raised"
                }`}
              >
                <Text
                  class={`font-mono text-[10px] font-semibold ${
                    parseStep() >= 3 ? "text-amber" : "text-faint"
                  }`}
                >
                  3 · EN Subtitles
                </Text>
              </View>
            </View>
          </View>

          {/* Animated Progress Bar */}
          <View class="h-2.5 w-full overflow-hidden rounded-full bg-well">
            <View
              style={{ width: `${Math.max(8, props.progress())}%` }}
              class="h-full rounded-full bg-amber transition animate-pulse"
            />
          </View>
        </View>
      </If>

      {/* Animated Downloading Card */}
      <If when={props.kind() === "downloading"}>
        <View class="gap-3 rounded-2xl border border-ready/50 bg-popover p-4 shadow-lg">
          <View class="flex-row items-center justify-between gap-3">
            <View class="flex-row items-center gap-3">
              <View class="h-10 w-10 items-center justify-center rounded-xl bg-ready-soft animate-pulse">
                <Icon
                  name="download"
                  size={20}
                  tone="ready"
                  class="animate-bounce"
                />
              </View>
              <View class="gap-0.5">
                <View class="flex-row items-center gap-2">
                  <Text class="text-sm font-bold text-foreground">
                    Downloading to Local Library...
                  </Text>
                  <View class="rounded-full bg-ready-soft px-2.5 py-0.5 animate-pulse">
                    <Text class="font-mono text-xs font-bold tabular-nums text-ready">
                      {props.progress()}%
                    </Text>
                  </View>
                </View>
                <Text class="text-xs text-muted-foreground">
                  {downloadStageLabel()} · {props.targetTitle()}
                </Text>
              </View>
            </View>

            <View class="hidden flex-row items-center gap-1.5 sm:flex">
              <View class="rounded-full bg-ready-soft px-2.5 py-1">
                <Text class="font-mono text-[10px] font-semibold text-ready">
                  M4A + JSON3
                </Text>
              </View>
            </View>
          </View>

          {/* Downbit-style Animated Download Bar */}
          <View class="h-2.5 w-full overflow-hidden rounded-full bg-well">
            <View
              style={{ width: `${Math.max(10, props.progress())}%` }}
              class="h-full rounded-full bg-ready transition animate-pulse"
            />
          </View>
        </View>
      </If>

      {/* Error Toast */}
      <If when={props.error()}>
        <View class="flex-row items-center justify-between rounded-xl border border-danger/40 bg-danger-soft px-4 py-3">
          <Text class="text-sm font-medium text-danger">{props.error()}</Text>
          <Button
            onPress={props.onDismissStatus}
            class="h-7 w-7 items-center justify-center rounded-lg active:opacity-70"
          >
            <Icon name="x" size={14} tone="danger" />
          </Button>
        </View>
      </If>

      {/* Status Toast */}
      <If when={!props.kind() && props.status()}>
        <View class="flex-row items-center justify-between rounded-xl border border-line bg-panel px-4 py-2.5">
          <View class="flex-row items-center gap-2">
            <Icon name="check" size={14} tone="ready" />
            <Text class="font-mono text-xs text-muted-foreground">
              {props.status()}
            </Text>
          </View>
          <Button
            onPress={props.onDismissStatus}
            class="h-6 w-6 items-center justify-center rounded-md active:opacity-70"
          >
            <Icon name="x" size={12} tone="muted-foreground" />
          </Button>
        </View>
      </If>
    </View>
  );
}
