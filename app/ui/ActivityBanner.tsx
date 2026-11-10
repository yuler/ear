import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "./Icon";

export type ActivityKind = "parsing" | "downloading" | null;

/**
 * Quiet activity line + small toasts. The progress itself is the 1px line
 * at the bottom of the top bar; this only states what is happening.
 */
export function ActivityBanner(props: {
  kind: () => ActivityKind;
  progress: () => number;
  targetTitle: () => string;
  error: () => string | null;
  status: () => string | null;
  onDismissStatus: () => void;
}) {
  const label = () => {
    const p = props.progress();
    if (props.kind() === "parsing") {
      if (p < 38) return "Reading video page";
      if (p < 74) return "Finding audio";
      return "Merging captions";
    }
    if (p < 40) return "Saving captions";
    if (p < 82) return "Saving media";
    return "Indexing";
  };

  return (
    <View class="gap-2">
      <If when={props.kind()}>
        <View class="flex-row items-center gap-3">
          <Text class="font-mono text-xs tabular-nums text-muted-foreground">
            {props.progress()}%
          </Text>
          <Text class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {props.kind() === "parsing" ? "Parsing" : "Downloading"} ·{" "}
            {label()} · {props.targetTitle()}
          </Text>
        </View>
      </If>

      <If when={props.error()}>
        <View class="flex-row items-center justify-between gap-3 rounded-md border border-danger/40 px-3 py-2">
          <Text class="min-w-0 flex-1 text-xs text-danger">{props.error()}</Text>
          <Button
            onPress={props.onDismissStatus}
            class="h-6 w-6 items-center justify-center rounded active:opacity-70"
            accessibilityLabel="Dismiss"
          >
            <Icon name="x" size={12} tone="danger" />
          </Button>
        </View>
      </If>

      <If when={!props.kind() && !props.error() && props.status()}>
        <View class="flex-row items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
          <Text class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {props.status()}
          </Text>
          <Button
            onPress={props.onDismissStatus}
            class="h-6 w-6 items-center justify-center rounded active:opacity-70"
            accessibilityLabel="Dismiss"
          >
            <Icon name="x" size={12} tone="muted-foreground" />
          </Button>
        </View>
      </If>
    </View>
  );
}
