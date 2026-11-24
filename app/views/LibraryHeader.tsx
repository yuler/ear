import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";

/**
 * Compact Library section bar: title + count, with the multi-select activation
 * toggle placed right beside Library.
 */
export function LibraryHeader(props: {
  visibleCount: () => number;
  totalCount: () => number;
  isSearching: () => boolean;
  canSelect: () => boolean;
  selectionMode: () => boolean;
  onToggleSelectionMode: () => void;
}) {
  return (
    <View class="shrink-0 flex-row flex-wrap items-center gap-2 px-1">
      <View class="flex-row items-center gap-1.5">
        <Text class="text-sm font-semibold text-foreground">
          {shellT().library}
        </Text>
        <Text class="font-mono text-xs tabular-nums text-dim">
          {props.isSearching()
            ? `${props.visibleCount()} / ${props.totalCount()}`
            : `${props.totalCount()}`}
        </Text>
      </View>

      <If when={props.canSelect() || props.selectionMode()}>
        <Button
          onPress={props.onToggleSelectionMode}
          selected={props.selectionMode()}
          class={`flex-row items-center gap-1 rounded-md border px-2 py-0.5 transition ${
            props.selectionMode()
              ? "border-brand/50 bg-brand-soft hover:opacity-90"
              : "border-line/80 bg-well/50 hover:bg-well active:bg-accent"
          }`}
          accessibilityLabel={
            props.selectionMode() ? shellT().done : shellT().select
          }
        >
          <Icon
            name="check-square"
            size={11}
            tone={props.selectionMode() ? "brand" : "muted-foreground"}
          />
          <Text
            class={`text-[11px] font-medium leading-tight ${
              props.selectionMode() ? "text-brand" : "text-muted-foreground"
            }`}
          >
            {props.selectionMode() ? shellT().done : shellT().select}
          </Text>
        </Button>
      </If>
    </View>
  );
}
