import { Text, View, type JSX } from "nsh";
import { Button, Input, Switch } from "nsh/base";
import { defaultDownloadFolder } from "../library/paths";
import type { PlaybackRate } from "../player";
import type { Appearance, SubtitleSize } from "../store";
import { Icon } from "./Icon";
import { settings, updateSettings } from "./settings";

function Segmented<T extends string | number>(props: {
  options: readonly { value: T; label: string }[];
  value: () => T;
  onChange: (v: T) => void;
}) {
  return (
    <View class="flex-row rounded-md border border-line p-0.5">
      {props.options.map((opt) => (
        <Button
          onPress={() => props.onChange(opt.value)}
          class={`rounded px-3 py-1 ${
            props.value() === opt.value ? "bg-primary" : "bg-transparent"
          }`}
        >
          <Text
            class={`text-xs font-medium ${
              props.value() === opt.value
                ? "text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            {opt.label}
          </Text>
        </Button>
      ))}
    </View>
  );
}

function Row(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <View class="flex-row items-center justify-between gap-6 border-b border-line py-3.5">
      <View class="min-w-0 flex-1 gap-0.5">
        <Text class="text-sm text-foreground">{props.label}</Text>
        <If when={props.hint}>
          <Text class="text-xs text-muted-foreground">{props.hint}</Text>
        </If>
      </View>
      {props.children}
    </View>
  );
}

function Toggle(props: {
  checked: () => boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Switch
      checked={props.checked()}
      onChange={(e) => props.onChange(e.checked)}
      accessibilityLabel={props.label}
      trackClass="h-5 w-9 rounded-full bg-line p-0.5 checked:bg-primary"
      thumbClass="h-4 w-4 rounded-full bg-background transition checked:translate-x-4"
    />
  );
}

const APPEARANCE: readonly { value: Appearance; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const RATES: readonly { value: PlaybackRate; label: string }[] = [
  { value: 0.8, label: "0.8×" },
  { value: 1, label: "1×" },
  { value: 1.2, label: "1.2×" },
];

const SIZES: readonly { value: SubtitleSize; label: string }[] = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
];

/** Centered settings modal over a dimmed backdrop. */
export function SettingsPanel(props: { onClose: () => void }) {
  return (
    <View class="absolute inset-0 items-center justify-center p-6">
      <Button
        onPress={props.onClose}
        class="absolute inset-0 bg-black/50"
        accessibilityLabel="Close settings"
      />
      <View class="w-full max-w-[440px] rounded-md border border-line bg-popover px-5 pt-4 pb-2 shadow-xl">
        <View class="flex-row items-center justify-between pb-2">
          <Text class="text-base font-semibold text-foreground">Settings</Text>
          <Button
            onPress={props.onClose}
            class="h-7 w-7 items-center justify-center rounded active:bg-accent"
            accessibilityLabel="Close"
          >
            <Icon name="x" size={14} tone="muted-foreground" />
          </Button>
        </View>

        <Row label="Appearance">
          <Segmented
            options={APPEARANCE}
            value={() => settings().appearance}
            onChange={(v) => updateSettings({ appearance: v })}
          />
        </Row>
        <Row label="Default speed" hint="Blind Flow & Loop Dojo">
          <Segmented
            options={RATES}
            value={() => settings().preferredRate}
            onChange={(v) => updateSettings({ preferredRate: v })}
          />
        </Row>
        <Row label="Subtitle size">
          <Segmented
            options={SIZES}
            value={() => settings().subtitleSize}
            onChange={(v) => updateSettings({ subtitleSize: v })}
          />
        </Row>
        <Row label="Shortcut bar" hint="Keyboard hints at the bottom">
          <Toggle
            label="Shortcut bar"
            checked={() => settings().showFooter}
            onChange={(v) => updateSettings({ showFooter: v })}
          />
        </Row>
        <View class="flex-row items-center justify-between gap-6 border-b border-line py-3.5">
          <View class="min-w-0 flex-1 gap-0.5">
            <Text class="text-sm text-foreground">Clipboard detection</Text>
            <Text class="text-xs text-muted-foreground">
              Pick up YouTube links automatically
            </Text>
          </View>
          <Toggle
            label="Clipboard detection"
            checked={() => settings().clipboardAuto}
            onChange={(v) => updateSettings({ clipboardAuto: v })}
          />
        </View>
        <View class="gap-1.5 py-3.5">
          <Text class="text-sm text-foreground">Download folder</Text>
          <Text class="text-xs text-muted-foreground">
            Video and audio files (default ~/Downloads)
          </Text>
          <Input
            value={settings().downloadFolder}
            onChange={(e) => updateSettings({ downloadFolder: e.value })}
            placeholder={defaultDownloadFolder()}
            autoCapitalize="none"
            autoCorrect={false}
            class="mt-1 rounded-md border border-line bg-well px-3 py-1.5 text-sm text-foreground placeholder:text-dim"
          />
        </View>
      </View>
    </View>
  );
}
