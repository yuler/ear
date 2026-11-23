import { platform, Text, View, type InputRef } from "nsh";
import { Button, Input, Popover } from "nsh/base";
import { titleBar } from "nsh/desktop";
import type { ClipboardVideoPreview } from "../clipboard";
import { globalUpdateAvailable } from "../updater";
import { ClipboardCard } from "./ClipboardCard";
import { Icon } from "./Icon";
import { shellT } from "./shellI18n";
import { formatKeystroke } from "./shortcuts";
import { macTitleBarInsets } from "./titleBarInsets";

export type AppPage = "library" | "discover";

/** The bar's height: slightly roomier for the larger search bar. */
export const TOP_BAR_HEIGHT = 48;

/**
 * The window's top bar, on every page: left-aligned search / link input
 * (its parsed link's card pops directly below it) and the Settings trigger.
 */
export function TopBar(props: {
  settingsOpen: () => boolean;
  onOpenSettings: () => void;
  url: () => string;
  isLink: () => boolean;
  onUrlChange: (v: string) => void;
  onClearUrl: () => void;
  onInputRef: (ref: InputRef | null) => void;
  onSubmit: () => void;
  onReadClipboard: () => void;
  /** Show the clipboard button (auto-detect off, empty field). */
  showClipboardButton: () => boolean;
  preview: () => ClipboardVideoPreview | null;
  parsing: () => boolean;
  parseMessage?: () => string;
  selectedQualityId: () => string;
  onSelectQuality: (qualityId: string) => void;
  selectedTrackId: () => string | null;
  onSelectTrack: (trackId: string) => void;
  onDownload: (preview: ClipboardVideoPreview) => void;
  onDismissPreview: () => void;
}) {
  const t = shellT;
  const insets = () => macTitleBarInsets();

  const field = (
    <View class="h-9 w-full flex-row items-center gap-2.5 rounded-xl border border-line bg-well px-3">
      <Icon
        name={props.isLink() || Boolean(props.preview()) ? "link" : "search"}
        size={15}
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
        <Icon name="loader" size={14} tone="muted-foreground" class="animate-spin" />
      </If>
      <If when={!props.parsing() && props.url().length > 0}>
        <Button
          onPress={props.onClearUrl}
          class="h-4.5 w-4.5 items-center justify-center rounded-full bg-dim/40 active:bg-dim/60"
          accessibilityLabel={t().clearLink}
        >
          <Icon name="x" size={10} tone="foreground" />
        </Button>
      </If>
      <If when={props.url().length === 0}>
        <View class="flex-row items-center gap-1.5">
          <If when={props.showClipboardButton()}>
            <Button
              onPress={props.onReadClipboard}
              class="h-6 w-6 items-center justify-center rounded-md active:bg-accent"
              accessibilityLabel={t().readClipboard}
            >
              <Icon name="clipboard" size={13} tone="muted-foreground" />
            </Button>
          </If>
          <View class="rounded border border-line px-1.5 py-0.5" accessibilityLabel={t().focusLink}>
            <Text class="font-mono text-[10px] text-dim">{formatKeystroke("mod+l")}</Text>
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
        paddingLeft: insets().left > 0 ? insets().left + 8 : 16,
        paddingRight: titleBar().right ? titleBar().right + 8 : 16,
      }}
      class="shrink-0 flex-row items-center gap-3 bg-background"
    >
      <View class="min-w-0 flex-1 flex-row items-center">
        <View class="w-full max-w-[760px]">
          <Popover
            open={Boolean(props.preview())}
            placement="bottom"
            align="start"
            offset={4}
            closeOnPressOutside={false}
            onOpenChange={(e) => {
              if (!e.open && e.reason === "cancel") props.onDismissPreview();
            }}
            popupClass="w-[360px] sm:w-[700px] lg:w-[860px] rounded-xl border border-line bg-popover shadow-2xl"
            trigger={field}
          >
            <If when={props.preview()}>
              {(getPreview) => (
                <ClipboardCard
                  preview={getPreview}
                  parsing={props.parsing}
                  parseMessage={props.parseMessage}
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
        selected={props.settingsOpen()}
        class={`relative h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
          props.settingsOpen() ? "bg-well" : "hover:bg-well"
        }`}
        accessibilityLabel={t().settings}
      >
        <Icon
          name="settings"
          size={16}
          tone={props.settingsOpen() ? "brand" : "muted-foreground"}
        />
        <If when={globalUpdateAvailable()}>
          <View class="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand" />
        </If>
      </Button>
    </View>
  );
}
