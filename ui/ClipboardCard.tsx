import { signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { ClipboardVideoPreview } from "./clipboard";
import { Icon } from "./Icon";

export function ClipboardCard(props: {
  preview: () => ClipboardVideoPreview;
  loading: () => boolean;
  onConfirm: (preview: ClipboardVideoPreview) => void;
  onDismiss: () => void;
}) {
  const selectedFormat = signal<"Best" | "Audio" | "Subtitles">("Best");

  return (
    <View class="gap-3 rounded-2xl border border-line bg-popover p-4 shadow-xl">
      {/* Top header row: "From your clipboard" + dismiss */}
      <View class="flex-row items-center justify-between">
        <View class="flex-row items-center gap-2">
          <Icon name="clipboard" size={14} tone="muted-foreground" />
          <Text class="text-xs font-medium text-muted-foreground">
            {props.preview().source === "clipboard"
              ? "From your clipboard"
              : "Detected YouTube video"}
          </Text>
          <View class="rounded-full bg-amber-soft px-2 py-0.5">
            <Text class="font-mono text-[10px] font-semibold text-amber">
              {props.preview().videoId}
            </Text>
          </View>
        </View>

        <Button
          onPress={props.onDismiss}
          class="h-7 w-7 items-center justify-center rounded-full bg-raised active:bg-accent"
          accessibilityLabel="Dismiss clipboard prompt"
        >
          <Icon name="x" size={13} tone="muted-foreground" />
        </Button>
      </View>

      {/* Main row: Thumbnail + Title/Pills + Big Action Button */}
      <View class="flex-col gap-4 md:flex-row md:items-center">
        {/* Left: 16:9 Video Cover Preview with Duration Pill */}
        <Button
          onPress={() => props.onConfirm(props.preview())}
          class={`h-[104px] w-full shrink-0 justify-between overflow-hidden rounded-xl border border-line p-3 md:w-[184px] ${props.preview().accentBg}`}
        >
          <View class="flex-row items-center justify-between">
            <View class="rounded-md bg-ground/75 px-2 py-0.5">
              <Text
                class={`font-mono text-[9px] font-bold uppercase tracking-wider ${props.preview().accentText}`}
              >
                {props.preview().badgeText}
              </Text>
            </View>
          </View>

          <View class="items-center justify-center">
            <View class="h-9 w-9 items-center justify-center rounded-full bg-ground/80">
              <Icon name="play" size={15} tone="paper" />
            </View>
          </View>

          <View class="flex-row items-center justify-between">
            <Text class="font-mono text-[10px] text-paper">
              {props.preview().speaker}
            </Text>
            <View class="rounded-md bg-ground/90 px-2 py-0.5">
              <Text class="font-mono text-xs font-bold tabular-nums text-paper">
                {props.preview().durationLabel}
              </Text>
            </View>
          </View>
        </Button>

        {/* Center: Video Title, Channel & Downbit-style Format Pills */}
        <View class="min-w-0 flex-1 gap-2">
          <Text class="line-clamp-2 text-base font-bold leading-snug text-foreground">
            {props.preview().title}
          </Text>

          <Text class="text-xs text-muted-foreground">
            {props.preview().channel}
          </Text>

          {/* Format & Subtitle Pills (Downbit style) */}
          <View class="flex-row flex-wrap items-center gap-1.5 pt-0.5">
            {(["Best", "Audio", "Subtitles"] as const).map((fmt) => (
              <Button
                onPress={() => selectedFormat.set(fmt)}
                class={`rounded-full px-3 py-1 ${
                  selectedFormat() === fmt
                    ? "bg-primary"
                    : "border border-line bg-raised"
                }`}
              >
                <Text
                  class={`text-xs font-semibold ${
                    selectedFormat() === fmt
                      ? "text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {fmt}
                </Text>
              </Button>
            ))}

            <View class="rounded-full border border-line bg-raised px-3 py-1">
              <Text class="text-xs font-medium text-muted-foreground">
                M4A · MP4
              </Text>
            </View>

            <View class="flex-row items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1">
              <Icon name="subtitles" size={12} tone="amber" />
              <Text class="text-xs font-medium text-foreground">
                Subtitles · EN
              </Text>
            </View>
          </View>
        </View>

        {/* Right: Large Downbit CTA Button + "Return ↵" hint */}
        <View class="shrink-0 items-center gap-1.5 md:pl-2">
          <Button
            onPress={() => props.onConfirm(props.preview())}
            class="w-full flex-row items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 transition active:opacity-90 md:w-auto"
          >
            <Icon
              name={props.loading() ? "loader" : "download"}
              size={16}
              tone="primary-foreground"
              class={props.loading() ? "animate-spin" : ""}
            />
            <Text class="text-base font-bold text-primary-foreground">
              {props.loading() ? "Parsing..." : "Download & Practice"}
            </Text>
          </Button>
          <Text class="font-mono text-xs text-muted-foreground">
            Return ↵
          </Text>
        </View>
      </View>
    </View>
  );
}
