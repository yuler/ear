import { Text, View, type JSX } from "nsh";
import { Button } from "nsh/base";
import { Haptics } from "nsh/mobile";

/** iOS HIG inset-grouped section container (uppercase header + rounded card + footer caption). */
export function IosGroupedSection(props: {
  title?: string;
  footer?: string;
  children?: JSX.Element;
}) {
  return (
    <View class="flex-col gap-1.5">
      {props.title ? (
        <Text class="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.title}
        </Text>
      ) : null}
      <View class="overflow-hidden rounded-2xl bg-card border border-line/60">
        {props.children}
      </View>
      {props.footer ? (
        <Text class="px-4 text-xs leading-relaxed text-muted-foreground">
          {props.footer}
        </Text>
      ) : null}
    </View>
  );
}

/** Standard iOS HIG 44pt+ grouped row with optional hairline separator. */
export function IosGroupedRow(props: {
  title: string;
  subtitle?: string;
  trailing?: JSX.Element;
  destructive?: boolean;
  showDivider?: boolean;
  onPress?: () => void;
}) {
  const inner = (
    <View class="flex-col">
      <View class="min-h-[48px] flex-row items-center justify-between gap-3 px-4 py-2.5">
        <View class="min-w-0 flex-1 flex-col gap-0.5">
          <Text
            class={`text-[15px] font-medium ${
              props.destructive ? "text-destructive" : "text-foreground"
            }`}
          >
            {props.title}
          </Text>
          {props.subtitle ? (
            <Text class="text-xs text-muted-foreground">{props.subtitle}</Text>
          ) : null}
        </View>
        {props.trailing ? <View class="shrink-0">{props.trailing}</View> : null}
      </View>
      {props.showDivider ? <View class="ml-4 h-[1px] bg-line/60" /> : null}
    </View>
  );

  if (props.onPress) {
    return (
      <Button
        onPress={() => {
          Haptics.selection();
          props.onPress?.();
        }}
        class="w-full bg-transparent active:bg-accent"
      >
        {inner}
      </Button>
    );
  }
  return inner;
}

/** iOS HIG segmented control with haptic selection feedback. */
export function IosSegmented<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: () => T;
  onChange: (next: T) => void;
}) {
  return (
    <View class="flex-row rounded-xl bg-well p-0.5">
      {props.options.map((opt) => {
        const active = () => props.value() === opt.value;
        return (
          <Button
            onPress={() => {
              if (!active()) {
                Haptics.selection();
                props.onChange(opt.value);
              }
            }}
            class={`flex-1 items-center justify-center rounded-[10px] px-3 py-1.5 transition ${
              active() ? "bg-card shadow-sm" : "bg-transparent active:opacity-70"
            }`}
          >
            <Text
              class={`text-[13px] ${
                active()
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground"
              }`}
            >
              {opt.label}
            </Text>
          </Button>
        );
      })}
    </View>
  );
}

export type BadgeTone = "ready" | "syncing" | "queued" | "away" | "action";

/** Compact iOS pill badge for mirror item status. */
export function IosStatusBadge(props: { label: string; tone: BadgeTone }) {
  const pillClass =
    props.tone === "ready"
      ? "bg-ready-soft"
      : props.tone === "syncing"
        ? "bg-tint-soft"
        : props.tone === "action"
          ? "bg-tint-soft"
          : "bg-well";

  const textClass =
    props.tone === "ready"
      ? "text-ready"
      : props.tone === "syncing" || props.tone === "action"
        ? "text-tint"
        : "text-muted-foreground";

  return (
    <View class={`rounded-full px-2 py-0.5 ${pillClass}`}>
      <Text class={`text-[11px] font-semibold ${textClass}`}>{props.label}</Text>
    </View>
  );
}

/** Format milliseconds into mm:ss or h:mm:ss. */
export function formatDurationMs(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Format byte size into compact human-readable MB/GB label. */
export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
