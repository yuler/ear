import { keymap, Text, View, type InputRef } from "nsh";
import { Button, Input } from "nsh/base";
import { titleBar } from "nsh/desktop";
import type { ActivityKind } from "./ActivityBanner";
import type { ChromeScreen } from "./chrome";
import { Icon } from "./Icon";

const TABS: readonly { key: ChromeScreen; label: string }[] = [
  { key: "home", label: "Library" },
  { key: "blind", label: "Blind Flow" },
  { key: "loop", label: "Loop Dojo" },
  { key: "list", label: "Sentences" },
];

export function TopBar(props: {
  url: () => string;
  onUrlChange: (v: string) => void;
  onClearUrl?: () => void;
  onInputRef: (ref: InputRef | null) => void;
  onSubmitParse: () => void;
  onReadClipboard: () => void;
  /** Show the manual clipboard button (auto-detect off, empty field). */
  showClipboardButton: () => boolean;
  loading: () => boolean;
  screen: () => ChromeScreen;
  onSelectScreen: (s: ChromeScreen) => void;
  dojoCount: () => number;
  totalVideos: () => number;
  onOpenSettings: () => void;
  activityKind: () => ActivityKind;
  activityProgress: () => number;
}) {
  return (
    <View desktop={{ windowDrag: true }} class="border-b border-line bg-background">
      <View
        style={{
          paddingLeft: (titleBar().left || 16) + 4,
          paddingRight: (titleBar().right || 16) + 4,
        }}
        class="pt-3"
      >
        <View class="mx-auto w-full max-w-[960px] gap-2">
          {/* Row 1: wordmark · Downbit-style omnibar · settings */}
          <View class="w-full flex-row items-center gap-4">
            <Button
              onPress={() => props.onSelectScreen("home")}
              class="py-1"
              accessibilityLabel="Ear home"
            >
              <Text class="text-base font-semibold tracking-tight text-foreground">
                Ear
              </Text>
            </Button>

            <View class="min-w-0 flex-1 flex-row items-center gap-2.5 rounded-lg border border-line bg-well px-3 py-1.5">
              <Icon
                name={props.url().trim().length > 0 ? "link" : "search"}
                size={14}
                tone="muted-foreground"
              />
              <Input
                ref={props.onInputRef}
                value={props.url()}
                onChange={(e) => props.onUrlChange(e.value)}
                placeholder="Paste a YouTube link to download, or search"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                submitBehavior="submit"
                onSubmit={props.onSubmitParse}
                class="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-sm text-foreground placeholder:text-dim"
              />
              <If when={props.loading()}>
                <Icon
                  name="loader"
                  size={14}
                  tone="muted-foreground"
                  class="animate-spin"
                />
              </If>
              <If when={!props.loading() && props.url().length > 0}>
                <Button
                  onPress={() =>
                    props.onClearUrl
                      ? props.onClearUrl()
                      : props.onUrlChange("")
                  }
                  class="h-4 w-4 items-center justify-center rounded-full bg-dim/40 active:bg-dim/60"
                  accessibilityLabel="Clear link"
                >
                  <Icon name="x" size={10} tone="foreground" />
                </Button>
              </If>
              <If when={!props.loading() && props.url().length === 0}>
                <View class="flex-row items-center gap-1.5">
                  <If when={props.showClipboardButton()}>
                    <Button
                      onPress={props.onReadClipboard}
                      class="h-6 w-6 items-center justify-center rounded active:bg-accent"
                      accessibilityLabel="Read clipboard"
                    >
                      <Icon name="clipboard" size={13} tone="muted-foreground" />
                    </Button>
                  </If>
                  <Button
                    onPress={props.onSubmitParse}
                    class="rounded border border-line bg-raised px-1.5 py-0.5 active:bg-accent"
                    accessibilityLabel="Focus link field"
                  >
                    <Text class="font-mono text-[11px] text-dim">
                      {keymap.label("mod+l")}
                    </Text>
                  </Button>
                </View>
              </If>
            </View>

            <Button
              onPress={props.onOpenSettings}
              class="h-8 w-8 items-center justify-center rounded-md active:bg-accent"
              accessibilityLabel="Settings"
            >
              <Icon name="settings" size={16} tone="muted-foreground" />
            </Button>
          </View>

          {/* Row 2: text tabs */}
          <View class="flex-row items-center gap-6">
            {TABS.map((tab) => (
              <Button
                onPress={() => props.onSelectScreen(tab.key)}
                class={`flex-row items-center gap-1.5 border-b-2 pt-1 pb-2 ${
                  props.screen() === tab.key
                    ? "border-foreground"
                    : "border-transparent"
                }`}
              >
                <Text
                  class={`text-sm ${
                    props.screen() === tab.key
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {tab.label}
                </Text>
                <If when={tab.key === "home"}>
                  <Text class="font-mono text-xs tabular-nums text-dim">
                    {props.totalVideos()}
                  </Text>
                </If>
                <If when={tab.key === "loop" && props.dojoCount() > 0}>
                  <Text class="font-mono text-xs tabular-nums text-dim">
                    {props.dojoCount()}
                  </Text>
                </If>
              </Button>
            ))}
          </View>
        </View>
      </View>

      {/* 1px activity progress line */}
      <View class="h-px w-full">
        <If when={props.activityKind()}>
          <View
            style={{ width: `${Math.max(4, props.activityProgress())}%` }}
            class="h-full bg-foreground transition"
          />
        </If>
      </View>
    </View>
  );
}
