import { Text, View } from "nsh";
import { Button } from "nsh/base";
import {
  displayDownloadPath,
  formatDiskSize,
  type DiskSpaceInfo,
} from "../library/storage";
import { Icon } from "../ui/Icon";
import { shellT } from "../ui/shellI18n";

/**
 * Subtle single-line footer at the bottom of the Library area showing the
 * active download directory (clickable to open) and volume disk space.
 */
export function LibraryStorageFooter(props: {
  downloadFolder: () => string;
  diskSpace?: () => DiskSpaceInfo | null;
  onOpenDownloadFolder?: () => void;
}) {
  const path = () => props.downloadFolder().trim();
  const diskSummary = () => {
    const info = props.diskSpace?.();
    if (!info || info.totalBytes <= 0) return "";
    const avail = formatDiskSize(info.availableBytes);
    const total = formatDiskSize(info.totalBytes);
    if (!avail || !total) return "";
    return shellT().diskSpaceSummary(avail, total);
  };

  return (
    <If when={Boolean(path())}>
      <View class="shrink-0 px-4 py-1.5">
        <View class="mx-auto w-full max-w-[1440px] flex-row items-center justify-between gap-3 px-1">
          <Button
            onPress={() => props.onOpenDownloadFolder?.()}
            disabled={!props.onOpenDownloadFolder}
            class="min-w-0 shrink flex-row items-center gap-1.5 rounded px-1 py-0.5 transition hover:bg-well/70 active:bg-accent"
            accessibilityLabel={shellT().openDownloadFolder}
            tooltip={<Text class="text-xs">{path()}</Text>}
          >
            <Icon name="folder" size={11} tone="dim" />
            <Text class="min-w-0 truncate font-mono text-[11px] text-dim">
              {displayDownloadPath(path())}
            </Text>
          </Button>
          <If when={Boolean(diskSummary())}>
            <Text class="shrink-0 font-mono text-[11px] tabular-nums text-dim">
              {diskSummary()}
            </Text>
          </If>
        </View>
      </View>
    </If>
  );
}
