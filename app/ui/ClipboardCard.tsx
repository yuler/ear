import { Image, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { ClipboardVideoPreview } from "../clipboard";
import { Icon } from "./Icon";

/** Clipboard / typed-link preview: confirm to parse & download. */
export function ClipboardCard(props: {
  preview: () => ClipboardVideoPreview;
  loading: () => boolean;
  onConfirm: (preview: ClipboardVideoPreview) => void;
  onDismiss: () => void;
}) {
  return (
    <View class="gap-3 rounded-xl border border-line bg-popover p-4 shadow-xl">
      <View class="flex-row items-center justify-between">
        <View class="flex-row items-center gap-1.5">
          <Icon name="clipboard" size={13} tone="muted-foreground" />
          <Text class="text-xs font-medium text-muted-foreground">
            {props.preview().source === "clipboard"
              ? "From your clipboard"
              : "From link"}
          </Text>
        </View>
        <Button
          onPress={props.onDismiss}
          class="h-6 w-6 items-center justify-center rounded-md active:bg-accent"
          accessibilityLabel="Dismiss"
        >
          <Icon name="x" size={14} tone="muted-foreground" />
        </Button>
      </View>

      <View class="flex-col gap-4 sm:flex-row sm:items-center">
        <View class="relative h-[90px] w-full shrink-0 overflow-hidden rounded-lg border border-line bg-well sm:w-[160px]">
          <Image
            src={props.preview().thumbnailUrl}
            class="h-full w-full object-cover"
          />
          <View class="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5">
            <Text class="font-mono text-[11px] font-medium tabular-nums text-white">
              {props.preview().durationLabel}
            </Text>
          </View>
        </View>

        <View class="min-w-0 flex-1 gap-1">
          <Text class="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {props.preview().title}
          </Text>
          <Text class="text-xs text-muted-foreground">
            {props.preview().channel}
          </Text>
        </View>

        <View class="shrink-0 items-end justify-center gap-1.5 sm:pl-2">
          <Button
            onPress={() => props.onConfirm(props.preview())}
            class="rounded-lg bg-[#2f7cf6] px-4 py-2 active:opacity-90"
          >
            <Text class="text-sm font-semibold text-white">
              {props.loading() ? "Opening…" : "Open"}
            </Text>
          </Button>
          <Text class="font-mono text-[11px] text-dim">Return ↵</Text>
        </View>
      </View>
    </View>
  );
}
