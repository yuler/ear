import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "./Icon";

export type ActivityKind = "parsing" | "downloading" | null;

/**
 * Top activity banner for parsing progress, errors, and status notifications.
 * Active downloads are displayed directly in the Library view at the top of the list.
 */
export function ActivityBanner(props: {
  kind: () => ActivityKind;
  progress: () => number;
  targetTitle: () => string;
  error: () => string | null;
  status: () => string | null;
  onDismissStatus: () => void;
}) {
  return (
    <View class="gap-2.5">
      {/* 1. Parsing activity indicator (CLI / Shell style) */}
      <If when={props.kind() === "parsing"}>
        <View class="flex-row items-center justify-between gap-3 rounded-xl border border-line bg-popover px-3.5 py-2.5">
          <View class="min-w-0 flex-1 flex-row items-center gap-2">
            <Text class="font-mono text-xs font-bold text-[#2f7cf6]">❯</Text>
            <Icon
              name="loader"
              size={13}
              tone="amber"
              class="animate-spin"
            />
            <Text class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              ear parse: {props.targetTitle()}
            </Text>
          </View>
        </View>
      </If>

      {/* 2. Error banner */}
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

      {/* 3. Quiet status toast */}
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
