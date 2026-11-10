import { Text, View, type JSX } from "nsh";
import { Button, Input, Switch } from "nsh/base";
import {
  defaultDownloadFolder,
  libraryRoot,
  mediaRoot,
  openDirectory,
} from "../library/paths";
import type { Appearance } from "../store";
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

/** Centered settings modal with storage details, folder quick-open, and preferences. */
export function SettingsPanel(props: { onClose: () => void }) {
  const currentMediaDir = () => mediaRoot(settings().downloadFolder);
  const currentLibDir = () => {
    try {
      return libraryRoot();
    } catch {
      return "~/.local/share/com.cozilla.ear/library";
    }
  };

  return (
    <View class="absolute inset-0 items-center justify-center p-6">
      <Button
        onPress={props.onClose}
        class="absolute inset-0 bg-black/50"
        accessibilityLabel="Close settings"
      />
      <View class="w-full max-w-[480px] rounded-xl border border-line bg-popover px-5 pt-4 pb-4 shadow-xl">
        {/* Header */}
        <View class="flex-row items-center justify-between pb-3 border-b border-line">
          <View class="gap-0.5">
            <Text class="text-base font-semibold text-foreground">Settings</Text>
            <Text class="text-xs text-muted-foreground">
              Storage directories, downloader engine, and preferences
            </Text>
          </View>
          <Button
            onPress={props.onClose}
            class="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
            accessibilityLabel="Close"
          >
            <Icon name="x" size={14} tone="muted-foreground" />
          </Button>
        </View>

        {/* 1. Download Folder with Open Current Location Button */}
        <View class="gap-2 border-b border-line py-3.5">
          <View class="gap-0.5">
            <Text class="text-sm font-semibold text-foreground">
              下载目录 (Download Folder)
            </Text>
            <Text class="text-xs text-muted-foreground leading-relaxed">
              视频与音频文件的本地存储目录（默认 ~/Downloads）。下载完成后文件会保存在这里，可随时修改。
            </Text>
          </View>

          <View class="flex-row items-center gap-2">
            <Input
              value={settings().downloadFolder}
              onChange={(e) => updateSettings({ downloadFolder: e.value })}
              placeholder={defaultDownloadFolder()}
              autoCapitalize="none"
              autoCorrect={false}
              class="min-w-0 flex-1 rounded-md border border-line bg-well px-3 py-1.5 text-sm text-foreground placeholder:text-dim"
            />
            <Button
              onPress={() => void openDirectory(currentMediaDir())}
              class="flex-row items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 active:bg-accent"
              accessibilityLabel="Open download directory in file manager"
            >
              <Icon name="folder" size={13} tone="foreground" />
              <Text class="text-xs font-medium text-foreground">打开文件夹</Text>
            </Button>
          </View>

          <Text class="font-mono text-[11px] text-dim">
            当前位置：{currentMediaDir()}
          </Text>
        </View>

        {/* 2. Metadata & Captions Storage */}
        <View class="gap-2 border-b border-line py-3.5">
          <View class="gap-0.5">
            <Text class="text-sm font-semibold text-foreground">
              元数据与字幕存储 (Data & Captions)
            </Text>
            <Text class="text-xs text-muted-foreground leading-relaxed">
              保存任务描述元数据、提取的 JSON 字幕 (captions.json) 及去重索引 (archive.jsonl)。纯本地文件系统组织，轻量可靠。
            </Text>
          </View>

          <View class="flex-row items-center justify-between gap-2">
            <Text class="min-w-0 flex-1 truncate font-mono text-[11px] text-dim">
              {currentLibDir()}
            </Text>
            <Button
              onPress={() => void openDirectory(currentLibDir())}
              class="shrink-0 flex-row items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 active:bg-accent"
              accessibilityLabel="Open data directory in file manager"
            >
              <Icon name="folder" size={13} tone="foreground" />
              <Text class="text-xs font-medium text-foreground">打开数据目录</Text>
            </Button>
          </View>
        </View>

        {/* 3. Engine Architecture note */}
        <View class="gap-1 border-b border-line py-3">
          <Text class="text-sm font-semibold text-foreground">
            解析与下载引擎 (Rust ear CLI)
          </Text>
          <Text class="text-xs leading-relaxed text-muted-foreground">
            内置 Rust 独立命令行工具，采用 YouTube VisionOS 协议解析清晰度及字幕轨，提供 4 线程 HTTP Range 并行分块下载与 FFmpeg 快速自动合成。
          </Text>
        </View>

        {/* 4. Appearance & Preferences */}
        <View class="flex-row items-center justify-between gap-6 border-b border-line py-3">
          <View class="min-w-0 flex-1 gap-0.5">
            <Text class="text-sm text-foreground">外观主题 (Appearance)</Text>
            <Text class="text-xs text-muted-foreground">
              深色 / 浅色 / 跟随系统
            </Text>
          </View>
          <Segmented
            options={APPEARANCE}
            value={() => settings().appearance}
            onChange={(v) => updateSettings({ appearance: v })}
          />
        </View>

        <View class="flex-row items-center justify-between gap-6 pt-3">
          <View class="min-w-0 flex-1 gap-0.5">
            <Text class="text-sm text-foreground">剪贴板自动识别 (Clipboard)</Text>
            <Text class="text-xs text-muted-foreground">
              启动或激活窗口时自动识别 YouTube 链接
            </Text>
          </View>
          <Toggle
            label="Clipboard detection"
            checked={() => settings().clipboardAuto}
            onChange={(v) => updateSettings({ clipboardAuto: v })}
          />
        </View>
      </View>
    </View>
  );
}
