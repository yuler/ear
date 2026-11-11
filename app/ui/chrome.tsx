import { keymap, Text, View } from "nsh";
import { settings } from "./settings";

export type ChromeScreen = "home" | "blind" | "loop" | "list";

function Keycap(props: { keys: string; label: string }) {
  return (
    <View class="flex-row items-center gap-1.5">
      <Text class="font-mono text-[11px] font-medium text-foreground">
        {props.keys}
      </Text>
      <Text class="text-[11px] text-muted-foreground">{props.label}</Text>
    </View>
  );
}

/**
 * Minimal bottom shortcut bar — hidden by default, enabled in Settings.
 * Shows only contextual shortcuts for the active mode; no host status dot or theme button.
 */
export function ChromeHint(props?: {
  screen?: ChromeScreen;
  onSelectScreen?: (s: ChromeScreen) => void;
  lessonTitle?: string | null;
  sentenceCount?: number;
  dojoCount?: number;
}) {
  const screen = props?.screen ?? "home";
  const modL = keymap.label("mod+l");
  const modComma = keymap.label("mod+,");

  return (
    <If when={settings().showFooter}>
      <View class="border-t border-line bg-background px-4 py-2">
        <View class="mx-auto w-full max-w-[960px] flex-row flex-wrap items-center justify-between gap-3">
          <View class="flex-row flex-wrap items-center gap-4">
            <Keycap keys={modL} label="Link" />
            <Keycap keys="↵" label="Parse" />
            <If when={screen === "blind"}>
              <View class="flex-row items-center gap-4">
                <Keycap keys="Space" label="Play" />
                <Keycap keys="R" label="Reveal" />
                <Keycap keys="1 / 2 / 3" label="Pass · Lag · Blind" />
              </View>
            </If>
            <If when={screen === "loop"}>
              <View class="flex-row items-center gap-4">
                <Keycap keys="↵" label="Check Diff" />
              </View>
            </If>
          </View>

          <Keycap keys={modComma} label="Settings" />
        </View>
      </View>
    </If>
  );
}
