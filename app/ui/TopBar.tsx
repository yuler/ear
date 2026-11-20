import { keymap, platform, Text, View, type InputRef } from "nsh";
import { Button, Input, Popover } from "nsh/base";
import { titleBar } from "nsh/desktop";
import type { ClipboardVideoPreview } from "../clipboard";
import { globalUpdateAvailable } from "../updater";
import { ClipboardCard } from "./ClipboardCard";
import { Icon } from "./Icon";
import { shellT } from "./shellI18n";
import { macTitleBarInsets } from "./titleBarInsets";

export type MediaTab = "discover" | "library" | "settings";

/** The bar's height: the macOS hidden title bar's, traffic lights centered in it. */
export const TOP_BAR_HEIGHT = 44;

function TabButton(props: {
  label: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Button
      onPress={props.onPress}
      selected={props.active}
      class={`h-7 flex-row items-center gap-1.5 rounded-md px-3 transition ${
        props.active ? "bg-raised shadow-sm" : "hover:bg-accent"
      }`}
      accessibilityLabel={props.label}
    >
      <Text
        class={`text-sm ${
          props.active ? "font-semibold text-foreground" : "text-muted-foreground"
        }`}
      >
        {props.label}
      </Text>
      <If when={(props.badge ?? 0) > 0}>
        <View
          class="min-w-[18px] items-center rounded-full bg-brand px-1.5"
          accessibilityLabel={shellT().activeDownloads(props.badge ?? 0)}
        >
          <Text class="font-mono text-[10px] font-semibold tabular-nums text-brand-foreground">
            {props.badge}
          </Text>
        </View>
      </If>
    </Button>
  );
}

/**
 * The window's top bar, on every page: `Discover | Library`, the link field
 * (its parsed link's card pops over the content below it) and Settings.
 */
export function TopBar(props: {
  activeTab: () => MediaTab;
  onSelectTab: (tab: MediaTab) => void;
  onOpenSettings: () => void;
  activeDownloadCount: () => number;
  url: () => string;
  onUrlChange: (v: string) => void;
  onClearUrl: () => void;
  onInputRef: (ref: InputRef | null) => void;
  onSubmit: () => void;
  onReadClipboard: () => void;
  /** Show the clipboard button (auto-detect off, empty field). */
  showClipboardButton: () => boolean;
  preview: () => ClipboardVideoPreview | null;
  parsing: () => boolean;
  selectedQualityId: () => string;
  onSelectQuality: (qualityId: string) => void;
  selectedTrackId: () => string | null;
  onSelectTrack: (trackId: string) => void;
  onDownload: (preview: ClipboardVideoPreview) => void;
  onDismissPreview: () => void;
}) {
  const t = shellT;
  const insets = () => macTitleBarInsets();
  const libraryBadge = () =>
    props.activeTab() === "discover" ? props.activeDownloadCount() : 0;

  const field = (
    <View class="h-8 w-full flex-row items-center gap-2 rounded-lg border border-line bg-well px-2.5">
      <Icon
        name={props.url().trim().length > 0 ? "link" : "search"}
        size={13}
        tone="muted-foreground"
      />
      <Input
        ref={props.onInputRef}
        value={props.url()}
        onChange={(e) => props.onUrlChange(e.value)}
        placeholder={t().linkPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        submitBehavior="submit"
        onSubmit={props.onSubmit}
        class="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-sm text-foreground placeholder:text-dim"
      />
      <If when={props.parsing()}>
        <Icon name="loader" size={13} tone="muted-foreground" class="animate-spin" />
      </If>
      <If when={!props.parsing() && props.url().length > 0}>
        <Button
          onPress={props.onClearUrl}
          class="h-4 w-4 items-center justify-center rounded-full bg-dim/40 active:bg-dim/60"
          accessibilityLabel={t().clearLink}
        >
          <Icon name="x" size={9} tone="foreground" />
        </Button>
      </If>
      <If when={props.url().length === 0}>
        <View class="flex-row items-center gap-1">
          <If when={props.showClipboardButton()}>
            <Button
              onPress={props.onReadClipboard}
              class="h-6 w-6 items-center justify-center rounded-md active:bg-accent"
              accessibilityLabel={t().readClipboard}
            >
              <Icon name="clipboard" size={12} tone="muted-foreground" />
            </Button>
          </If>
          <View class="rounded border border-line px-1.5 py-0.5" accessibilityLabel={t().focusLink}>
            <Text class="font-mono text-[10px] text-dim">{keymap.label("mod+l")}</Text>
          </View>
        </View>
      </If>
    </View>
  );

  return (
    <View
      desktop={{ windowDrag: platform.os === "macos" }}
      style={{
        height: TOP_BAR_HEIGHT,
        paddingLeft: insets().left > 0 ? insets().left + 8 : 12,
        paddingRight: titleBar().right ? titleBar().right + 8 : 12,
      }}
      class="shrink-0 flex-row items-center gap-3 border-b border-line bg-background"
    >
      <View class="shrink-0 flex-row items-center gap-0.5 rounded-lg bg-well p-0.5">
        <TabButton
          label={t().discover}
          active={props.activeTab() === "discover"}
          onPress={() => props.onSelectTab("discover")}
        />
        <TabButton
          label={t().library}
          active={props.activeTab() === "library"}
          badge={libraryBadge()}
          onPress={() => props.onSelectTab("library")}
        />
      </View>

      <View class="min-w-0 flex-1 items-center">
        <View class="w-full max-w-[560px]">
          <Popover
            open={Boolean(props.preview())}
            placement="bottom"
            align="start"
            offset={6}
            closeOnPressOutside={false}
            onOpenChange={(e) => {
              if (!e.open && e.reason === "cancel") props.onDismissPreview();
            }}
            popupClass="w-[480px] rounded-lg border border-line bg-popover shadow-xl"
            trigger={field}
          >
            <If when={props.preview()}>
              {(getPreview) => (
                <ClipboardCard
                  preview={getPreview}
                  parsing={props.parsing}
                  selectedQualityId={props.selectedQualityId}
                  onSelectQuality={props.onSelectQuality}
                  selectedTrackId={props.selectedTrackId}
                  onSelectTrack={props.onSelectTrack}
                  onDownload={props.onDownload}
                  onDismiss={props.onDismissPreview}
                />
              )}
            </If>
          </Popover>
        </View>
      </View>

      <Button
        onPress={props.onOpenSettings}
        selected={props.activeTab() === "settings"}
        class={`relative h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
          props.activeTab() === "settings" ? "bg-well" : "hover:bg-well"
        }`}
        accessibilityLabel={t().settings}
      >
        <Icon
          name="settings"
          size={16}
          tone={props.activeTab() === "settings" ? "brand" : "muted-foreground"}
        />
        <If when={globalUpdateAvailable()}>
          <View class="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand" />
        </If>
      </Button>
    </View>
  );
}
