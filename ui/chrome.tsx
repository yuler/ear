import { colorScheme, keymap, setColorScheme, Text, View } from "nsh";
import { Button } from "nsh/base";
import { isNativeHost } from "../youtube/host";
import { Icon } from "./Icon";

export type ChromeScreen = "home" | "blind" | "loop" | "list";

function Keycap(props: { keys: string; label: string }) {
  return (
    <View class="flex-row items-center gap-1.5">
      <View class="rounded border border-line bg-raised px-1.5 py-0.5">
        <Text class="font-mono text-[10px] font-semibold text-foreground">
          {props.keys}
        </Text>
      </View>
      <Text class="text-[11px] text-muted-foreground">{props.label}</Text>
    </View>
  );
}

export function ChromeHint(props?: {
  screen?: ChromeScreen;
  onSelectScreen?: (s: ChromeScreen) => void;
  lessonTitle?: string | null;
  sentenceCount?: number;
  dojoCount?: number;
}) {
  const screen = props?.screen ?? "home";
  const modL = keymap.label("mod+l");

  const toggleScheme = () => {
    setColorScheme(colorScheme() === "dark" ? "light" : "dark");
  };

  return (
    <View class="border-t border-line bg-panel px-4 py-2">
      <View class="flex-row flex-wrap items-center justify-between gap-2">
        {/* Left: Host status & active lesson indicator */}
        <View class="flex-row items-center gap-3">
          <View class="flex-row items-center gap-1.5">
            <View
              class={`h-2 w-2 rounded-full ${
                isNativeHost() ? "bg-ready" : "bg-amber"
              }`}
            />
            <Text class="font-mono text-[11px] text-muted-foreground">
              {isNativeHost() ? "Native Host · Ready" : "Studio Preview"}
            </Text>
          </View>

          <If when={props?.lessonTitle}>
            <View class="hidden flex-row items-center gap-2 sm:flex">
              <Text class="text-xs text-dim">·</Text>
              <Text class="max-w-[260px] truncate text-xs text-foreground">
                {props?.lessonTitle}
              </Text>
              <Text class="font-mono text-[11px] tabular-nums text-faint">
                ({props?.sentenceCount ?? 0} lines)
              </Text>
            </View>
          </If>
        </View>

        {/* Center/Right: Contextual Desktop Keyboard Shortcuts */}
        <View class="hidden flex-row flex-wrap items-center gap-3.5 md:flex">
          <Keycap keys={modL} label="Focus Link" />
          <Keycap keys="Return ↵" label="Parse / Download" />
          <If when={screen === "blind"}>
            <View class="flex-row items-center gap-3.5">
              <Keycap keys="Space" label="Play" />
              <Keycap keys="R" label="Reveal" />
              <Keycap keys="1 / 2 / 3" label="Pass · Lag · Blind" />
            </View>
          </If>
          <If when={screen === "loop"}>
            <View class="flex-row items-center gap-3.5">
              <Keycap keys="Enter" label="Check Diff" />
              <Keycap keys="0.8 / 1 / 1.2×" label="Loop Rate" />
            </View>
          </If>
          <Button
            onPress={toggleScheme}
            class="flex-row items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 active:bg-accent"
          >
            <Icon name="sun-moon" size={12} tone="amber" />
            <Text class="font-mono text-[10px] font-medium text-muted-foreground">
              {colorScheme() === "dark" ? "Dark" : "Light"}
            </Text>
          </Button>
        </View>

        {/* Compact Mobile Bottom Switcher when on narrow screen */}
        <If when={props?.onSelectScreen}>
          <View class="flex-row items-center gap-1 md:hidden">
            <Button
              onPress={() => props?.onSelectScreen?.("home")}
              class={`rounded-lg px-2.5 py-1 ${
                screen === "home" ? "bg-amber" : "bg-raised"
              }`}
            >
              <Text
                class={`text-xs font-medium ${
                  screen === "home" ? "text-ink" : "text-foreground"
                }`}
              >
                Library
              </Text>
            </Button>
            <Button
              onPress={() => props?.onSelectScreen?.("blind")}
              class={`rounded-lg px-2.5 py-1 ${
                screen === "blind" ? "bg-amber" : "bg-raised"
              }`}
            >
              <Text
                class={`text-xs font-medium ${
                  screen === "blind" ? "text-ink" : "text-foreground"
                }`}
              >
                Blind
              </Text>
            </Button>
            <Button
              onPress={() => props?.onSelectScreen?.("loop")}
              class={`rounded-lg px-2.5 py-1 ${
                screen === "loop" ? "bg-amber" : "bg-raised"
              }`}
            >
              <Text
                class={`text-xs font-medium ${
                  screen === "loop" ? "text-ink" : "text-foreground"
                }`}
              >
                Dojo
              </Text>
            </Button>
            <Button
              onPress={() => props?.onSelectScreen?.("list")}
              class={`rounded-lg px-2.5 py-1 ${
                screen === "list" ? "bg-amber" : "bg-raised"
              }`}
            >
              <Text
                class={`text-xs font-medium ${
                  screen === "list" ? "text-ink" : "text-foreground"
                }`}
              >
                Lines
              </Text>
            </Button>
          </View>
        </If>
      </View>
    </View>
  );
}
