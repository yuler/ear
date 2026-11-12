import {
  effect,
  keymap,
  LayoutAnimation,
  platform,
  Text,
  View,
  type InputRef,
} from "nsh";
import { Button, Input } from "nsh/base";
import { titleBar } from "nsh/desktop";
import type { ClipboardVideoPreview } from "../clipboard";
import type { ActivityKind } from "./ActivityBanner";
import { ClipboardCard } from "./ClipboardCard";
import { Icon } from "./Icon";

export type MediaTab = "video" | "audio" | "discover" | "settings";

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
  parsing?: () => boolean;
  parseMessage?: () => string;
  activePreview?: () => ClipboardVideoPreview | null;
  selectedQualityId?: () => string;
  onSelectQuality?: (qualityId: string) => void;
  selectedTrackId?: () => string | null;
  onSelectTrack?: (trackId: string) => void;
  onDownloadPreview?: (preview: ClipboardVideoPreview) => void;
  onDismissPreview?: () => void;
  activeTab?: () => MediaTab;
  onSelectTab?: (tab: MediaTab) => void;
  videoCount?: () => number;
  audioCount?: () => number;
  activeDownloadCount?: () => number;
  discoverCount?: () => number;
  onOpenSettings?: () => void;
  activityKind: () => ActivityKind;
  activityProgress: () => number;
}) {
  const hasDropdown = () => Boolean(props.activePreview?.());
  const isSpinning = () =>
    props.loading() || Boolean(props.parsing?.());

  effect(() => {
    const _open = hasDropdown();
    try {
      LayoutAnimation.easeInEaseOut();
    } catch {
      // ignore on test host
    }
  });

  return (
    <View
      desktop={{ windowDrag: platform.os === "macos" }}
      class="border-b border-line bg-background"
    >
      <View
        style={{
          paddingLeft: 16,
          paddingRight: titleBar().right ? titleBar().right + 4 : 16,
        }}
        class="py-3"
      >
        <View class="mx-auto w-full max-w-[960px] gap-2">
          {/* Row 1: Downbit-style expandable omnibar */}
          <View class="w-full flex-row items-start">
            {/* Expandable Omnibar + Dropdown Drawer */}
            <View class="min-w-0 flex-1">
              <View
                class={`w-full flex-row items-center gap-2.5 border bg-well px-3 py-1.5 transition ${
                  hasDropdown()
                    ? "rounded-t-xl border-[#2f7cf6]/60"
                    : "rounded-lg border-line"
                }`}
              >
                <Icon
                  name={props.url().trim().length > 0 ? "link" : "search"}
                  size={14}
                  tone={hasDropdown() ? "foreground" : "muted-foreground"}
                />
                <Input
                  ref={props.onInputRef}
                  value={props.url()}
                  onChange={(e) => props.onUrlChange(e.value)}
                  placeholder="Paste a YouTube link to download"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  submitBehavior="submit"
                  onSubmit={props.onSubmitParse}
                  class="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-sm text-foreground placeholder:text-dim"
                />
                <If when={isSpinning()}>
                  <Icon
                    name="loader"
                    size={14}
                    tone="amber"
                    class="animate-spin"
                  />
                </If>
                <If when={!isSpinning() && props.url().length > 0}>
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
                <If when={!isSpinning() && props.url().length === 0}>
                  <View class="flex-row items-center gap-1.5">
                    <If when={props.showClipboardButton()}>
                      <Button
                        onPress={props.onReadClipboard}
                        class="h-6 w-6 items-center justify-center rounded active:bg-accent"
                        accessibilityLabel="Read clipboard"
                      >
                        <Icon
                          name="clipboard"
                          size={13}
                          tone="muted-foreground"
                        />
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

              {/* Attached dropdown drawer right below the input bar */}
              <If when={props.activePreview?.() ?? null}>
                {(getPreview) => (
                  <ClipboardCard
                    preview={getPreview}
                    loading={props.loading}
                    parsing={() => props.parsing?.() ?? false}
                    parseMessage={() => props.parseMessage?.() ?? ""}
                    selectedQualityId={() =>
                      props.selectedQualityId?.() ?? "360p"
                    }
                    onSelectQuality={(q) => props.onSelectQuality?.(q)}
                    selectedTrackId={() => props.selectedTrackId?.() ?? null}
                    onSelectTrack={(t) => props.onSelectTrack?.(t)}
                    onDownload={(p) => props.onDownloadPreview?.(p)}
                    onDismiss={() => props.onDismissPreview?.()}
                  />
                )}
              </If>
            </View>
          </View>
        </View>
      </View>

      {/* 1px activity progress line */}
      <View class="h-px w-full">
        <If when={props.activityKind()}>
          <View
            style={{ width: `${Math.max(4, props.activityProgress())}%` }}
            class="h-full bg-[#2f7cf6] transition"
          />
        </If>
      </View>
    </View>
  );
}
