import { Text, View } from "nsh";
import { Button } from "nsh/base";
import {
  displayDownloadPath,
  formatDiskSize,
  type DiskSpaceInfo,
} from "../library/storage";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";
import { formatKeystroke } from "../ui/shortcuts";

function ShortcutHint(props: { keys: string; active?: boolean }) {
  return (
    <View
      class={`rounded border px-1 py-0.5 ${
        props.active
          ? "border-brand/35 bg-brand/10"
          : "border-line/80 bg-background/60"
      }`}
    >
      <Text
        class={`font-mono text-[10px] leading-none ${
          props.active ? "text-brand" : "text-dim"
        }`}
      >
        {formatKeystroke(props.keys)}
      </Text>
    </View>
  );
}

/**
 * Compact Library section bar: title + count, an icon+shortcut multi-select
 * toggle right beside Library, Select All / Deselect All while multi-select
 * is active, and the download folder + remaining disk space tightly below.
 */
export function LibraryHeader(props: {
  visibleCount: () => number;
  totalCount: () => number;
  isSearching: () => boolean;
  canSelect: () => boolean;
  selectionMode: () => boolean;
  allSelected: () => boolean;
  onToggleSelectionMode: () => void;
  onToggleSelectAll: () => void;
  downloadFolder?: () => string;
  diskSpace?: () => DiskSpaceInfo | null;
  onOpenDownloadFolder?: () => void;
}) {
  const downloadPath = () => (props.downloadFolder?.() ?? "").trim();
  const diskSummary = () => {
    const info = props.diskSpace?.();
    if (!info || info.totalBytes <= 0) return "";
    const avail = formatDiskSize(info.availableBytes);
    const total = formatDiskSize(info.totalBytes);
    if (!avail || !total) return "";
    return shellT().diskSpaceSummary(avail, total);
  };

  return (
    <View class="shrink-0 flex-col gap-0.5 px-1">
      <View class="flex-row flex-wrap items-center gap-2">
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
            class={`flex-row items-center gap-1 rounded-md border px-1.5 py-0.5 transition ${
              props.selectionMode()
                ? "border-brand/50 bg-brand-soft hover:opacity-90"
                : "border-line/80 bg-well/50 hover:bg-well active:bg-accent"
            }`}
            accessibilityLabel={
              props.selectionMode() ? shellT().done : shellT().multiSelect
            }
            tooltip={
              <Text class="text-xs">
                {props.selectionMode() ? shellT().exitSelectMode : shellT().multiSelect}
              </Text>
            }
          >
            <Icon
              name="list-checks"
              size={12}
              tone={props.selectionMode() ? "brand" : "muted-foreground"}
            />
            <ShortcutHint keys="s" active={props.selectionMode()} />
          </Button>
        </If>

        <If when={props.selectionMode()}>
          <Button
            onPress={props.onToggleSelectAll}
            selected={props.allSelected()}
            class={`flex-row items-center gap-1.5 rounded-md border px-2 py-0.5 transition ${
              props.allSelected()
                ? "border-brand/50 bg-brand-soft hover:opacity-90"
                : "border-line/80 bg-well/50 hover:bg-well active:bg-accent"
            }`}
            accessibilityLabel={
              props.allSelected() ? shellT().deselectAll : shellT().selectAll
            }
          >
            <Text
              class={`text-[11px] font-medium leading-tight ${
                props.allSelected() ? "text-brand" : "text-foreground"
              }`}
            >
              {props.allSelected() ? shellT().deselectAll : shellT().selectAll}
            </Text>
            <ShortcutHint keys="a" active={props.allSelected()} />
          </Button>
        </If>
      </View>

      <If when={Boolean(downloadPath())}>
        <View class="flex-row flex-wrap items-center gap-1.5">
          <Button
            onPress={() => props.onOpenDownloadFolder?.()}
            disabled={!props.onOpenDownloadFolder}
            class="-ml-1 min-w-0 shrink flex-row items-center gap-1.5 rounded px-1 py-0.5 transition hover:bg-well/70 active:bg-accent"
            accessibilityLabel={shellT().openDownloadFolder}
            tooltip={<Text class="text-xs">{downloadPath()}</Text>}
          >
            <Icon name="folder" size={11} tone="dim" />
            <Text class="min-w-0 truncate font-mono text-[11px] text-dim">
              {displayDownloadPath(downloadPath())}
            </Text>
          </Button>
          <If when={Boolean(diskSummary())}>
            <Text class="text-[11px] text-dim/60">·</Text>
            <Text class="shrink-0 font-mono text-[11px] tabular-nums text-dim">
              {diskSummary()}
            </Text>
          </If>
        </View>
      </If>
    </View>
  );
}
