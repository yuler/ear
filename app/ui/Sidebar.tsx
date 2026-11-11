import { platform, Text, View } from "nsh";
import { Button } from "nsh/base";
import { titleBar } from "nsh/desktop";
import { Icon } from "./Icon";
import { globalUpdateAvailable } from "../updater";
import type { MediaTab } from "./TopBar";

export type SidebarProps = {
  activeTab: () => MediaTab;
  onSelectTab: (tab: MediaTab) => void;
  videoCount: () => number;
  audioCount: () => number;
  discoverCount?: () => number;
  activeDownloadCount?: () => number;
  onOpenSettings: () => void;
};

export function Sidebar(props: SidebarProps) {
  const isTabActive = (tab: MediaTab) => props.activeTab() === tab;

  return (
    <View
      desktop={{ windowDrag: false }}
      class="w-56 shrink-0 flex-col justify-between border-r border-line bg-well/20 select-none"
    >
      <View class="flex-col gap-4">
        {/* Top Header: macOS traffic lights safe area + App Branding */}
        <View
          desktop={{ windowDrag: platform.os === "macos" }}
          style={{
            paddingTop: 14,
            paddingLeft: (titleBar().left || 16) + 4,
            paddingRight: 16,
          }}
          class="flex-col pb-1"
        >
          <View class="flex-row items-center gap-2.5 py-1" accessibilityLabel="Ear">
            <View class="h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
              <Icon name="headphones" size={16} color="#2f7cf6" />
            </View>
            <View class="flex-col">
              <Text class="text-sm font-bold tracking-tight text-foreground">
                Ear
              </Text>
              <Text class="text-[10px] text-dim">Immersion Player</Text>
            </View>
          </View>
        </View>

        {/* Navigation Sections */}
        <View class="gap-4 px-3">
          {/* Section 1: Feeds / Recommendations */}
          <View class="gap-1">
            <Text class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
              Feeds
            </Text>

            {/* Discover */}
            <Button
              onPress={() => props.onSelectTab("discover")}
              class={`flex-row items-center justify-between rounded-lg px-2.5 py-2 transition ${
                isTabActive("discover")
                  ? "bg-primary/15 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-well hover:text-foreground"
              }`}
              accessibilityLabel="Discover"
            >
              <View class="flex-row items-center gap-2.5">
                <Icon
                  name="compass"
                  size={15}
                  tone={isTabActive("discover") ? "primary" : "muted-foreground"}
                />
                <Text
                  class={`text-sm ${
                    isTabActive("discover")
                      ? "font-semibold text-primary"
                      : "text-foreground"
                  }`}
                >
                  Discover
                </Text>
              </View>
              <View class="rounded-full bg-ready/15 px-2 py-0.5">
                <Text class="font-mono text-[11px] font-semibold text-ready">
                  {props.discoverCount?.() ?? 40}
                </Text>
              </View>
            </Button>
          </View>

          {/* Section 2: Library */}
          <View class="gap-1">
            <Text class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
              Library
            </Text>

            {/* Videos Tab */}
            <Button
              onPress={() => props.onSelectTab("video")}
              class={`flex-row items-center justify-between rounded-lg px-2.5 py-2 transition ${
                isTabActive("video")
                  ? "bg-primary/15 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-well hover:text-foreground"
              }`}
              accessibilityLabel="Videos"
            >
              <View class="flex-row items-center gap-2.5">
                <Icon
                  name="film"
                  size={15}
                  tone={isTabActive("video") ? "primary" : "muted-foreground"}
                />
                <Text
                  class={`text-sm ${
                    isTabActive("video")
                      ? "font-semibold text-primary"
                      : "text-foreground"
                  }`}
                >
                  Videos
                </Text>
              </View>
              <View class="flex-row items-center gap-1.5">
                <If when={(props.activeDownloadCount?.() ?? 0) > 0}>
                  <View class="flex-row items-center gap-1 rounded-full bg-[#2f7cf6]/20 px-1.5 py-0.5">
                    <Icon
                      name="loader"
                      size={10}
                      color="#2f7cf6"
                      class="animate-spin"
                    />
                    <Text class="font-mono text-[10px] font-semibold tabular-nums text-[#2f7cf6]">
                      {props.activeDownloadCount?.()}
                    </Text>
                  </View>
                </If>
                <Text class="font-mono text-xs tabular-nums text-dim">
                  {props.videoCount()}
                </Text>
              </View>
            </Button>

            {/* Audio Tab */}
            <Button
              onPress={() => props.onSelectTab("audio")}
              class={`flex-row items-center justify-between rounded-lg px-2.5 py-2 transition ${
                isTabActive("audio")
                  ? "bg-primary/15 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-well hover:text-foreground"
              }`}
              accessibilityLabel="Audio"
            >
              <View class="flex-row items-center gap-2.5">
                <Icon
                  name="music"
                  size={15}
                  tone={isTabActive("audio") ? "primary" : "muted-foreground"}
                />
                <Text
                  class={`text-sm ${
                    isTabActive("audio")
                      ? "font-semibold text-primary"
                      : "text-foreground"
                  }`}
                >
                  Audio
                </Text>
              </View>
              <Text class="font-mono text-xs tabular-nums text-dim">
                {props.audioCount()}
              </Text>
            </Button>
          </View>
        </View>
      </View>

      {/* Bottom Footer: Settings Button */}
      <View class="border-t border-line p-3">
        <Button
          onPress={() => {
            if (props.onOpenSettings) {
              props.onOpenSettings();
            } else {
              props.onSelectTab("settings");
            }
          }}
          class={`w-full flex-row items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${
            isTabActive("settings")
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:bg-well hover:text-foreground"
          }`}
          accessibilityLabel="Settings"
        >
          <Icon
            name="settings"
            size={15}
            tone={isTabActive("settings") ? "primary" : "muted-foreground"}
          />
          <View class="flex-row items-center gap-2">
            <Text
              class={`text-sm ${
                isTabActive("settings")
                  ? "font-semibold text-primary"
                  : "text-foreground"
              }`}
            >
              Settings
            </Text>
            {globalUpdateAvailable() && (
              <View class="h-2 w-2 rounded-full bg-primary" />
            )}
          </View>
        </Button>
      </View>
    </View>
  );
}
