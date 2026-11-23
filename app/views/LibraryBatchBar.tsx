import { createMotion, Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";

/**
 * Floating bottom-fixed capsule toolbar shown when Library multi-select mode
 * is active. Provides select-all toggle, reveal folder (for a single item),
 * batch delete, and exit controls.
 */
export function LibraryBatchBar(props: {
  selectedCount: () => number;
  allSelected: () => boolean;
  canDelete: boolean;
  onToggleSelectAll: () => void;
  onOpenFolder?: () => void;
  onDeleteSelected: () => void;
  onExit: () => void;
}) {
  const t = shellT;
  const barMotion = createMotion({
    enter: "fadeInUp",
    duration: 160,
  });

  const count = () => props.selectedCount();
  const hasSelection = () => count() > 0;

  return (
    <View class="pointer-events-none absolute right-0 bottom-5 left-0 z-20 items-center px-4">
      <View
        style={barMotion.style}
        class="pointer-events-auto flex-row items-center gap-1 rounded-full border border-line bg-popover px-2.5 py-1.5 shadow-2xl"
        accessibilityLabel={t().batchToolbar}
      >
        <View class="flex-row items-center gap-1.5 pr-1 pl-1.5">
          <View class="min-w-[22px] items-center justify-center rounded-full bg-brand px-1.5 py-0.5">
            <Text class="font-mono text-[11px] font-semibold tabular-nums text-brand-foreground">
              {count()}
            </Text>
          </View>
          <Text class="text-xs font-medium text-foreground">
            {t().selectedCount(count())}
          </Text>
        </View>

        <View class="mx-1 h-4 w-px bg-line" />

        <Button
          onPress={props.onToggleSelectAll}
          class="flex-row items-center gap-1.5 rounded-full px-3 py-1.5 transition hover:bg-well active:bg-accent"
          accessibilityLabel={
            props.allSelected() ? t().deselectAll : t().selectAll
          }
        >
          <Text class="text-xs font-medium text-foreground">
            {props.allSelected() ? t().deselectAll : t().selectAll}
          </Text>
        </Button>

        <If when={count() === 1 && Boolean(props.onOpenFolder)}>
          <Button
            onPress={() => props.onOpenFolder?.()}
            class="flex-row items-center gap-1.5 rounded-full px-3 py-1.5 transition hover:bg-well active:bg-accent"
            accessibilityLabel={t().openFolder}
          >
            <Icon name="folder" size={13} tone="muted-foreground" />
            <Text class="text-xs font-medium text-foreground">
              {t().openFolder}
            </Text>
          </Button>
        </If>

        <If when={props.canDelete}>
          <Button
            disabled={!hasSelection()}
            onPress={props.onDeleteSelected}
            class={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
              hasSelection()
                ? "bg-danger-soft hover:opacity-90 active:opacity-80"
                : "opacity-40"
            }`}
            accessibilityLabel={t().deleteSelected}
          >
            <Icon
              name="trash"
              size={13}
              tone={hasSelection() ? "danger" : "muted-foreground"}
            />
            <Text
              class={`text-xs font-medium ${
                hasSelection() ? "text-danger" : "text-muted-foreground"
              }`}
            >
              {t().delete}
            </Text>
          </Button>
        </If>

        <View class="mx-0.5 h-4 w-px bg-line" />

        <Button
          onPress={props.onExit}
          class="h-7 w-7 items-center justify-center rounded-full transition hover:bg-well active:bg-accent"
          accessibilityLabel={t().exitSelectMode}
        >
          <Icon name="x" size={13} tone="muted-foreground" />
        </Button>
      </View>
    </View>
  );
}
