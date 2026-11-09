import { colorScheme, setColorScheme, Text, View, type InputRef } from "nsh";
import { Button, Input } from "nsh/base";
import { titleBar } from "nsh/desktop";
import type { ChromeScreen } from "./chrome";
import { Icon } from "./Icon";

export function TopBar(props: {
  url: () => string;
  onUrlChange: (v: string) => void;
  onInputRef: (ref: InputRef | null) => void;
  onSubmitParse: () => void;
  onReadClipboard: () => void;
  loading: () => boolean;
  saving: () => boolean;
  hasLesson: () => boolean;
  onSaveLocal: () => void;
  screen: () => ChromeScreen;
  onSelectScreen: (s: ChromeScreen) => void;
  dojoCount: () => number;
  totalVideos: () => number;
}) {
  return (
    <View
      desktop={{ windowDrag: true }}
      style={{
        paddingLeft: (titleBar().left || 16) + 4,
        paddingRight: (titleBar().right || 16) + 4,
      }}
      class="gap-2.5 border-b border-line bg-panel py-3"
    >
      <View class="mx-auto w-full max-w-[1160px] gap-2.5">
        {/* Row 1: Downbit Top Link Omnibar + Big Parse Button */}
        <View class="w-full flex-row items-center gap-2.5">
          <If when={titleBar().left === 0}>
            <View class="hidden flex-row items-center gap-1.5 pr-1 sm:flex">
              <View class="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <View class="h-3 w-3 rounded-full bg-[#febc2e]" />
              <View class="h-3 w-3 rounded-full bg-[#28c840]" />
            </View>
          </If>

          <Button
            onPress={() => props.onSelectScreen("home")}
            class="flex-row items-center gap-2 rounded-xl border border-line bg-raised px-3.5 py-2.5 active:bg-accent"
          >
            <View class="h-6 w-6 items-center justify-center rounded-lg bg-amber/20">
              <Icon name="ear" size={14} tone="amber" />
            </View>
            <Text class="text-sm font-bold tracking-tight text-foreground">
              Ear
            </Text>
          </Button>

          {/* Wide Downbit-style Rounded URL Input Bar */}
          <View class="min-w-0 flex-1 flex-row items-center gap-2.5 rounded-xl border border-line bg-well px-3.5 py-2">
            <Icon name="link" size={15} tone="muted-foreground" />
            <Input
              ref={props.onInputRef}
              value={props.url()}
              onChange={(e) => props.onUrlChange(e.value)}
              placeholder="https://www.youtube.com/watch?v=... or paste video link"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              submitBehavior="submit"
              onSubmit={props.onSubmitParse}
              class="min-w-0 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-dim"
            />
            <If when={props.url().length > 0}>
              <Button
                onPress={() => props.onUrlChange("")}
                class="h-6 w-6 items-center justify-center rounded-full bg-raised active:bg-accent"
                accessibilityLabel="Clear link"
              >
                <Icon name="x" size={12} tone="muted-foreground" />
              </Button>
            </If>
            <If when={props.url().length === 0}>
              <Button
                onPress={props.onReadClipboard}
                class="flex-row items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 py-1 active:bg-accent"
                accessibilityLabel="Read clipboard"
              >
                <Icon name="clipboard" size={12} tone="amber" />
                <Text class="text-xs font-medium text-muted-foreground">
                  Clipboard
                </Text>
              </Button>
            </If>
          </View>

          {/* Large Primary Parse Button */}
          <Button
            onPress={props.onSubmitParse}
            class="flex-row items-center gap-2 rounded-xl bg-primary px-5 py-2.5 transition active:opacity-90"
          >
            <Icon
              name={props.loading() ? "loader" : "sparkles"}
              size={15}
              tone="primary-foreground"
              class={props.loading() ? "animate-spin" : ""}
            />
            <Text class="text-sm font-bold text-primary-foreground">
              {props.loading() ? "Parsing..." : "Parse"}
            </Text>
          </Button>
        </View>

        {/* Row 2: Clean Mode Switcher Pills + Download & Appearance Actions */}
        <View class="w-full flex-row flex-wrap items-center justify-between gap-2">
          <View class="flex-row items-center gap-1 rounded-xl border border-line bg-well p-1">
            <Button
              onPress={() => props.onSelectScreen("home")}
              class={`flex-row items-center gap-1.5 rounded-lg px-4 py-2 ${
                props.screen() === "home" ? "bg-amber" : "bg-transparent"
              }`}
            >
              <Icon
                name="folder"
                size={13}
                tone={props.screen() === "home" ? "ink" : "muted-foreground"}
              />
              <Text
                class={`text-xs font-bold ${
                  props.screen() === "home"
                    ? "text-ink"
                    : "text-muted-foreground"
                }`}
              >
                Library ({props.totalVideos()})
              </Text>
            </Button>

            <Button
              onPress={() => props.onSelectScreen("blind")}
              class={`flex-row items-center gap-1.5 rounded-lg px-4 py-2 ${
                props.screen() === "blind" ? "bg-amber" : "bg-transparent"
              }`}
            >
              <Icon
                name="headphones"
                size={13}
                tone={props.screen() === "blind" ? "ink" : "muted-foreground"}
              />
              <Text
                class={`text-xs font-bold ${
                  props.screen() === "blind"
                    ? "text-ink"
                    : "text-muted-foreground"
                }`}
              >
                Blind Flow
              </Text>
            </Button>

            <Button
              onPress={() => props.onSelectScreen("loop")}
              class={`flex-row items-center gap-1.5 rounded-lg px-4 py-2 ${
                props.screen() === "loop" ? "bg-amber" : "bg-transparent"
              }`}
            >
              <Icon
                name="repeat"
                size={13}
                tone={props.screen() === "loop" ? "ink" : "muted-foreground"}
              />
              <Text
                class={`text-xs font-bold ${
                  props.screen() === "loop"
                    ? "text-ink"
                    : "text-muted-foreground"
                }`}
              >
                Loop Dojo
              </Text>
              <If when={props.dojoCount() > 0}>
                <View
                  class={`rounded-full px-1.5 py-0.5 ${
                    props.screen() === "loop" ? "bg-ink/20" : "bg-amber-soft"
                  }`}
                >
                  <Text
                    class={`font-mono text-[10px] font-bold tabular-nums ${
                      props.screen() === "loop" ? "text-ink" : "text-amber"
                    }`}
                  >
                    {props.dojoCount()}
                  </Text>
                </View>
              </If>
            </Button>

            <Button
              onPress={() => props.onSelectScreen("list")}
              class={`flex-row items-center gap-1.5 rounded-lg px-4 py-2 ${
                props.screen() === "list" ? "bg-amber" : "bg-transparent"
              }`}
            >
              <Icon
                name="list"
                size={13}
                tone={props.screen() === "list" ? "ink" : "muted-foreground"}
              />
              <Text
                class={`text-xs font-bold ${
                  props.screen() === "list"
                    ? "text-ink"
                    : "text-muted-foreground"
                }`}
              >
                Sentences
              </Text>
            </Button>
          </View>

          <View class="flex-row items-center gap-2">
            <If when={props.hasLesson()}>
              <Button
                onPress={props.onSaveLocal}
                class="flex-row items-center gap-2 rounded-xl border border-line bg-raised px-4 py-2 active:bg-accent"
              >
                <Icon
                  name={props.saving() ? "loader" : "download"}
                  size={14}
                  tone="amber"
                  class={props.saving() ? "animate-spin" : ""}
                />
                <Text class="text-xs font-bold text-foreground">
                  {props.saving() ? "Saving..." : "Download"}
                </Text>
              </Button>
            </If>

            <Button
              onPress={() =>
                setColorScheme(colorScheme() === "dark" ? "light" : "dark")
              }
              class="h-9 w-9 items-center justify-center rounded-xl border border-line bg-raised active:bg-accent"
              accessibilityLabel="Toggle color scheme"
            >
              <Icon name="sun-moon" size={14} tone="amber" />
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}
