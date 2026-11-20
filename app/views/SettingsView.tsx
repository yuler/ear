import { Scroll, Text, View, type JSX } from "nsh";
import { Button, Input, Switch } from "nsh/base";
import {
  CURRENT_APP_VERSION,
  globalUpdateAvailable,
  globalUpdateChecking,
  globalUpdateError,
  globalUpdateModalOpen,
  globalUpdateResult,
  globalUpdateStatus,
  runGlobalUpdateCheck,
} from "../updater";
import { defaultDownloadFolder, mediaRoot, openDirectory } from "../library/paths";
import type { Appearance, DefaultQuality, EarLocale } from "../store";
import { t, type I18nMessages } from "../ui/i18n";
import { Icon } from "../ui/Icon";
import { settings, updateSettings } from "../ui/settings";

type Option<T> = { value: T; label: string };

function Segmented<T extends string>(props: {
  options: () => readonly Option<T>[];
  value: () => T;
  onChange: (v: T) => void;
}) {
  return (
    <View class="flex-row rounded-lg border border-line bg-well p-0.5">
      {props.options().map((opt) => {
        const active = () => props.value() === opt.value;
        return (
          <Button
            onPress={() => props.onChange(opt.value)}
            class={`rounded-md px-3 py-1 transition ${
              active() ? "bg-raised shadow-sm" : "bg-transparent active:bg-raised"
            }`}
          >
            <Text
              class={`text-xs font-medium ${
                active() ? "text-foreground" : "text-muted-foreground"
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

/** One settings row: label (and optional one-line description) left, control right. */
function Row(props: {
  label: string;
  description?: () => string | null;
  descriptionClass?: () => string;
  children?: JSX.Element;
}) {
  return (
    <View class="min-h-14 flex-row items-center justify-between gap-6 border-b border-line py-3">
      <View class="min-w-0 flex-1 gap-0.5">
        <Text class="text-sm font-medium text-foreground">{props.label}</Text>
        {props.description?.() ? (
          <Text
            class={`truncate text-xs ${props.descriptionClass?.() ?? "text-muted-foreground"}`}
          >
            {props.description()}
          </Text>
        ) : null}
      </View>
      <View class="shrink-0 flex-row items-center gap-2">{props.children}</View>
    </View>
  );
}

function SecondaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  primary?: boolean;
}) {
  return (
    <Button
      disabled={props.disabled}
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      class={`rounded-lg px-3 py-1.5 transition active:scale-95 ${
        props.primary ? "bg-primary" : "border border-line bg-raised active:bg-accent"
      }`}
    >
      <Text
        class={`text-xs font-medium ${
          props.primary ? "text-primary-foreground" : "text-foreground"
        }`}
      >
        {props.label}
      </Text>
    </Button>
  );
}

function appearanceOptions(m: I18nMessages): Option<Appearance>[] {
  return [
    { value: "dark", label: m.settingsAppearanceDark },
    { value: "light", label: m.settingsAppearanceLight },
    { value: "system", label: m.settingsAppearanceSystem },
  ];
}

function languageOptions(m: I18nMessages): Option<EarLocale>[] {
  return [
    { value: "en", label: m.english },
    { value: "zh", label: m.chinese },
  ];
}

function qualityOptions(m: I18nMessages): Option<DefaultQuality>[] {
  return [
    { value: "360p", label: "360p" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
    { value: "audio", label: m.settingsQualityAudio },
  ];
}

/** Update state line under the version row; null when idle. */
function updateDescription(m: I18nMessages): { text: string; tone: string } {
  const version = `v${CURRENT_APP_VERSION}`;
  const result = globalUpdateResult();
  if (globalUpdateAvailable() && result?.hasUpdate) {
    return {
      text: `${version} · ${m.settingsUpdateAvailable(`v${result.latestVersion}`)}`,
      tone: "text-foreground",
    };
  }
  const error = globalUpdateError();
  if (globalUpdateStatus() === "error" && error) {
    return { text: m.settingsUpdateFailed(error), tone: "text-destructive" };
  }
  if (globalUpdateStatus() === "up_to_date") {
    return { text: `${version} · ${m.settingsUpToDate}`, tone: "text-muted-foreground" };
  }
  return { text: version, tone: "text-muted-foreground" };
}

/** Full-page settings: one flat list of preferences. */
export function SettingsView(props?: { onOpenShortcuts?: () => void }) {
  const m = () => t(settings().language);
  const currentMediaDir = () => mediaRoot(settings().downloadFolder);
  const hasUpdate = () =>
    globalUpdateAvailable() && !!globalUpdateResult()?.hasUpdate;

  return (
    <Scroll class="flex-1 bg-background">
      <View class="mx-auto w-full max-w-[640px] px-6 pb-12 pt-4">
        <Row label={m().settingsDownloadFolder}>
          <Input
            value={settings().downloadFolder}
            onChange={(e) => updateSettings({ downloadFolder: e.value })}
            placeholder={defaultDownloadFolder()}
            autoCapitalize="none"
            autoCorrect={false}
            class="w-64 rounded-lg border border-line bg-well px-3 py-1.5 text-xs text-foreground placeholder:text-dim"
          />
          <SecondaryButton
            label={m().settingsOpenFolder}
            accessibilityLabel={m().settingsOpenFolderLabel}
            onPress={() => void openDirectory(currentMediaDir())}
          />
        </Row>

        <Row label={m().settingsAppearance}>
          <Segmented
            options={() => appearanceOptions(m())}
            value={() => settings().appearance}
            onChange={(v) => updateSettings({ appearance: v })}
          />
        </Row>

        <Row label={m().settingsLanguage}>
          <Segmented
            options={() => languageOptions(m())}
            value={() => settings().language}
            onChange={(v) => updateSettings({ language: v })}
          />
        </Row>

        <Row label={m().settingsDefaultQuality}>
          <Segmented
            options={() => qualityOptions(m())}
            value={() => settings().defaultQuality}
            onChange={(v) => updateSettings({ defaultQuality: v })}
          />
        </Row>

        <Row label={m().settingsClipboard} description={() => m().settingsClipboardDesc}>
          <Switch
            checked={settings().clipboardAuto}
            onChange={(e) => updateSettings({ clipboardAuto: e.checked })}
            accessibilityLabel={m().settingsClipboard}
            trackClass="h-5 w-9 rounded-full bg-line p-0.5 checked:bg-primary"
            thumbClass="h-4 w-4 rounded-full bg-background transition checked:translate-x-4"
          />
        </Row>

        <Row
          label={m().settingsVersion}
          description={() => updateDescription(m()).text}
          descriptionClass={() => updateDescription(m()).tone}
        >
          {hasUpdate() ? (
            <SecondaryButton
              primary
              label={m().settingsViewUpdate}
              onPress={() => globalUpdateModalOpen.set(true)}
            />
          ) : (
            <SecondaryButton
              label={
                globalUpdateChecking()
                  ? m().settingsCheckingUpdates
                  : m().settingsCheckUpdates
              }
              disabled={globalUpdateChecking()}
              onPress={() => void runGlobalUpdateCheck()}
            />
          )}
        </Row>

        <Button
          onPress={() => props?.onOpenShortcuts?.()}
          accessibilityLabel={m().settingsShortcuts}
          class="min-h-14 flex-row items-center justify-between gap-6 border-b border-line py-3 active:opacity-70"
        >
          <Text class="text-sm font-medium text-foreground">{m().settingsShortcuts}</Text>
          <View class="flex-row items-center gap-1">
            <Text class="text-xs text-muted-foreground">?</Text>
            <Icon name="chevron-right" size={14} tone="muted-foreground" />
          </View>
        </Button>
      </View>
    </Scroll>
  );
}
