import { platform, Scroll, Text, View, type JSX } from "nsh";
import { Button, Input, Switch } from "nsh/base";
import { titleBar } from "nsh/desktop";
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
import {
  defaultDownloadFolder,
  libraryRoot,
  mediaRoot,
  openDirectory,
} from "../library/paths";
import type {
  Appearance,
  DefaultQuality,
  EarLocale,
  SentenceLengthMode,
} from "../store";
import { Icon } from "../ui/Icon";
import { settings, updateSettings } from "../ui/settings";

function Segmented<T extends string | number>(props: {
  options: readonly { value: T; label: string }[];
  value: () => T;
  onChange: (v: T) => void;
}) {
  return (
    <View class="flex-row rounded-lg border border-line bg-well p-1">
      {props.options.map((opt) => {
        const active = () => props.value() === opt.value;
        return (
          <Button
            onPress={() => props.onChange(opt.value)}
            class={`rounded-md px-3.5 py-1.5 transition ${
              active() ? "bg-primary shadow-sm" : "bg-transparent active:bg-raised"
            }`}
          >
            <Text
              class={`text-xs font-semibold ${
                active() ? "text-primary-foreground" : "text-muted-foreground"
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

const LANGUAGES: readonly { value: EarLocale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

const SENTENCE_LENGTHS: readonly { value: SentenceLengthMode; label: string }[] = [
  { value: "short", label: "短句" },
  { value: "medium", label: "适中" },
  { value: "long", label: "长句" },
];

const DEFAULT_QUALITIES: readonly { value: DefaultQuality; label: string }[] = [
  { value: "360p", label: "360p (极速/手机)" },
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "audio", label: "Audio" },
];

/** Dedicated full-page Settings view with storage directories, engine details, and preferences. */
export function SettingsView(props?: { onBack?: () => void; onClose?: () => void }) {
  const currentMediaDir = () => mediaRoot(settings().downloadFolder);
  const currentLibDir = () => {
    try {
      return libraryRoot();
    } catch {
      return "~/.local/share/dev.yuler.ear/library";
    }
  };

  return (
    <View class="flex-1 flex-col min-w-0 h-full bg-background">
      {/* 1. Page Header (macOS window dragging + Title) */}
      <View
        desktop={{ windowDrag: platform.os === "macos" }}
        style={{
          paddingLeft: 24,
          paddingRight: titleBar().right ? titleBar().right + 16 : 24,
          paddingTop: 16,
          paddingBottom: 16,
        }}
        class="border-b border-line bg-background"
      >
        <View class="mx-auto w-full max-w-[760px] flex-row items-center justify-between">
          <View class="flex-row items-center gap-3">
            <View class="flex-col gap-0.5">
              <View class="flex-row items-center gap-2">
                <View class="h-6 w-6 items-center justify-center rounded-lg bg-well">
                  <Icon name="settings" size={14} tone="primary" />
                </View>
                <Text class="text-base font-bold tracking-tight text-foreground">
                  Settings
                </Text>
              </View>
              <Text class="text-xs text-muted-foreground">
                Storage directories, downloader engine, and preferences
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 2. Workspace scroll area with categorized cards */}
      <Scroll class="flex-1">
        <View class="mx-auto w-full max-w-[760px] gap-6 p-6 md:p-8 pb-16">
          {/* Section 1: Storage & Directories */}
          <View class="flex-col gap-3">
            <View class="flex-row items-center gap-2 px-1">
              <Icon name="folder" size={14} tone="primary" />
              <Text class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                存储目录 (Storage & Directories)
              </Text>
            </View>
            <View class="flex-col rounded-2xl border border-line bg-card p-5 gap-4">
              {/* 1.1 Download Folder */}
              <View class="gap-2.5">
                <View class="gap-0.5">
                  <Text class="text-sm font-semibold text-foreground">
                    下载目录 (Download Folder)
                  </Text>
                  <Text class="text-xs leading-relaxed text-muted-foreground">
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
                    class="min-w-0 flex-1 rounded-lg border border-line bg-well px-3 py-2 text-sm text-foreground placeholder:text-dim"
                  />
                  <Button
                    onPress={() => void openDirectory(currentMediaDir())}
                    class="flex-row items-center gap-1.5 rounded-lg border border-line bg-raised px-3.5 py-2 transition active:bg-accent"
                    accessibilityLabel="Open download directory in file manager"
                  >
                    <Icon name="folder" size={14} tone="foreground" />
                    <Text class="text-xs font-medium text-foreground">打开文件夹</Text>
                  </Button>
                </View>

                <View selectable class="flex-row items-center gap-1 select-text">
                  <Text class="text-xs text-muted-foreground select-text">当前位置：</Text>
                  <Text class="font-mono text-xs text-dim select-text">
                    {currentMediaDir()}
                  </Text>
                </View>
              </View>

              {/* 1.2 Data & Captions */}
              <View class="gap-2.5 border-t border-line pt-4">
                <View class="gap-0.5">
                  <Text class="text-sm font-semibold text-foreground">
                    元数据与字幕存储 (Data & Captions)
                  </Text>
                  <Text class="text-xs leading-relaxed text-muted-foreground">
                    保存任务描述元数据、提取的 JSON 字幕 (captions.json) 及去重索引 (archive.jsonl)。纯本地文件系统组织，轻量可靠。
                  </Text>
                </View>

                <View class="flex-row items-center gap-2">
                  <Input
                    readonly
                    value={currentLibDir()}
                    autoCapitalize="none"
                    autoCorrect={false}
                    class="min-w-0 flex-1 rounded-lg border border-line bg-well px-3 py-2 font-mono text-xs text-foreground select-text"
                  />
                  <Button
                    onPress={() => void openDirectory(currentLibDir())}
                    class="shrink-0 flex-row items-center gap-1.5 rounded-lg border border-line bg-raised px-3.5 py-2 transition active:bg-accent"
                    accessibilityLabel="Open data directory in file manager"
                  >
                    <Icon name="folder" size={14} tone="foreground" />
                    <Text class="text-xs font-medium text-foreground">打开数据目录</Text>
                  </Button>
                </View>
              </View>
            </View>
          </View>

          {/* Section 2: Appearance & Preferences */}
          <View class="flex-col gap-3">
            <View class="flex-row items-center gap-2 px-1">
              <Icon name="sparkles" size={14} tone="primary" />
              <Text class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                通用偏好与外观 (Preferences & Appearance)
              </Text>
            </View>
            <View class="flex-col rounded-2xl border border-line bg-card p-5 gap-4">
              {/* 2.1 Appearance */}
              <View class="flex-row items-center justify-between gap-6 pb-4 border-b border-line">
                <View class="min-w-0 flex-1 gap-0.5">
                  <Text class="text-sm font-semibold text-foreground">外观主题 (Appearance)</Text>
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

              {/* 2.2 Language */}
              <View class="flex-row items-center justify-between gap-6 pb-4 border-b border-line">
                <View class="min-w-0 flex-1 gap-0.5">
                  <Text class="text-sm font-semibold text-foreground">语言 (Language)</Text>
                  <Text class="text-xs text-muted-foreground">
                    English (English first) · 中文
                  </Text>
                </View>
                <Segmented
                  options={LANGUAGES}
                  value={() => settings().language}
                  onChange={(v) => updateSettings({ language: v })}
                />
              </View>

              {/* 2.3 Sentence Length */}
              <View class="flex-row items-center justify-between gap-6 pb-4 border-b border-line">
                <View class="min-w-0 flex-1 gap-0.5">
                  <Text class="text-sm font-semibold text-foreground">默认分句长度 (Sentence Length)</Text>
                  <Text class="text-xs text-muted-foreground">
                    短句 (推荐初学精听) · 适中 (自然停顿) · 长句 (段落语境)
                  </Text>
                </View>
                <Segmented
                  options={SENTENCE_LENGTHS}
                  value={() => settings().sentenceLength}
                  onChange={(v) => updateSettings({ sentenceLength: v })}
                />
              </View>

              {/* 2.4 Default Quality */}
              <View class="flex-row items-center justify-between gap-6 pb-4 border-b border-line">
                <View class="min-w-0 flex-1 gap-0.5">
                  <Text class="text-sm font-semibold text-foreground">默认下载清晰度 (Default Quality)</Text>
                  <Text class="text-xs text-muted-foreground">
                    默认首选 360p（体积小/极速下载/手机同步友好），可自由切换
                  </Text>
                </View>
                <Segmented
                  options={DEFAULT_QUALITIES}
                  value={() => settings().defaultQuality ?? "360p"}
                  onChange={(v) => updateSettings({ defaultQuality: v })}
                />
              </View>

              {/* 2.5 Clipboard detection */}
              <View class="flex-row items-center justify-between gap-6">
                <View class="min-w-0 flex-1 gap-0.5">
                  <Text class="text-sm font-semibold text-foreground">剪贴板自动识别 (Clipboard)</Text>
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

          {/* Section 3: Engine Architecture */}
          <View class="flex-col gap-3">
            <View class="flex-row items-center gap-2 px-1">
              <Icon name="link" size={14} tone="primary" />
              <Text class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                核心引擎 (Engine Architecture)
              </Text>
            </View>
            <View class="flex-col rounded-2xl border border-line bg-card p-5 gap-3.5">
              <View class="flex-col gap-1">
                <View class="flex-row items-center gap-2">
                  <Text class="text-sm font-semibold text-foreground">
                    解析与下载引擎 (Rust ear CLI)
                  </Text>
                  <View class="rounded-full bg-ready-soft px-2 py-0.5">
                    <Text class="font-mono text-[10px] font-semibold text-muted-foreground">Ready</Text>
                  </View>
                </View>
                <Text class="text-xs leading-relaxed text-muted-foreground">
                  内置 Rust 独立命令行工具，采用 YouTube VisionOS 协议解析清晰度及字幕轨，提供 4 线程 HTTP Range 并行分块下载与 FFmpeg 快速自动合成。
                </Text>
              </View>

              <View class="flex-row flex-wrap items-center gap-2 pt-1">
                <View class="flex-row items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1">
                  <Icon name="check" size={11} tone="ready" />
                  <Text class="text-[11px] text-muted-foreground">4 线程并行 Range 分块</Text>
                </View>
                <View class="flex-row items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1">
                  <Icon name="check" size={11} tone="ready" />
                  <Text class="text-[11px] text-muted-foreground">VisionOS 协议解析</Text>
                </View>
                <View class="flex-row items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1">
                  <Icon name="check" size={11} tone="ready" />
                  <Text class="text-[11px] text-muted-foreground">FFmpeg 无损快速混流</Text>
                </View>
                <View class="flex-row items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1">
                  <Icon name="check" size={11} tone="ready" />
                  <Text class="text-[11px] text-muted-foreground">JSON3 双语字幕提取</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Section 4: About Ear & Updates */}
          <View class="flex-col rounded-2xl border border-line bg-card p-5 gap-3.5">
            <View class="flex-row items-center justify-between">
              <View class="flex-row items-center gap-3">
                <View class="h-9 w-9 items-center justify-center rounded-xl bg-well">
                  <Icon name="headphones" size={18} tone="primary" />
                </View>
                <View class="flex-col">
                  <Text class="text-sm font-bold text-foreground">Ear · Immersion Player</Text>
                  <Text class="text-xs text-muted-foreground">
                    Local-first, zero cloud lock-in · v{CURRENT_APP_VERSION}
                  </Text>
                </View>
              </View>
              <Button
                disabled={globalUpdateChecking()}
                onPress={() => void runGlobalUpdateCheck()}
                class="rounded-lg border border-line bg-raised px-3 py-1.5 transition active:scale-95"
              >
                <Text class="text-xs font-semibold text-foreground">
                  {globalUpdateChecking() ? "检查中..." : "检查更新"}
                </Text>
              </Button>
            </View>

            {globalUpdateAvailable() && globalUpdateResult()?.hasUpdate ? (
              <View class="flex-row items-center justify-between rounded-xl border border-line bg-well px-3 py-2">
                <View class="flex-row items-center gap-2">
                  <View class="h-2 w-2 rounded-full bg-primary" />
                  <Text class="text-xs font-medium text-foreground">
                    发现新版本 v{globalUpdateResult()?.latestVersion}
                  </Text>
                </View>
                <Button
                  onPress={() => globalUpdateModalOpen.set(true)}
                  class="rounded-md bg-primary px-2.5 py-1 transition active:scale-95"
                >
                  <Text class="text-xs font-semibold text-primary-foreground">
                    查看更新
                  </Text>
                </Button>
              </View>
            ) : globalUpdateStatus() === "error" && globalUpdateError() ? (
              <Text class="text-xs text-destructive">
                检查更新失败: {globalUpdateError()}
              </Text>
            ) : globalUpdateStatus() === "up_to_date" ? (
              <Text class="text-xs text-muted-foreground">
                当前已是最新版本 (v{CURRENT_APP_VERSION})
              </Text>
            ) : null}
          </View>
        </View>
      </Scroll>
    </View>
  );
}
