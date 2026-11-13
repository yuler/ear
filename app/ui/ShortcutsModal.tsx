import { Scroll, Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "./Icon";
import {
  formatKeystroke,
  SHORTCUT_CATEGORIES,
  type ShortcutItem,
} from "./shortcuts";

export type ShortcutsModalProps = {
  open: () => boolean;
  onClose: () => void;
};

function KeycapBadge(props: { keyText: string }) {
  const display = formatKeystroke(props.keyText);
  return (
    <View class="items-center justify-center rounded border border-line bg-raised px-1.5 py-0.5 shadow-2xs">
      <Text class="font-mono text-[11px] font-semibold tracking-tight text-foreground">
        {display}
      </Text>
    </View>
  );
}

function ShortcutRow(props: { item: ShortcutItem }) {
  return (
    <View class="flex-row items-center justify-between gap-3 py-1.5 border-b border-line/40 last:border-b-0">
      <View class="min-w-0 flex-1 flex-col">
        <Text class="text-xs font-medium text-foreground">
          {props.item.label}
        </Text>
        <Text class="text-[10px] text-dim line-clamp-1">
          {props.item.description}
        </Text>
      </View>
      <View class="shrink-0 flex-row items-center gap-1">
        <Each of={props.item.keys} key={(k) => k}>
          {(k) => <KeycapBadge keyText={k()} />}
        </Each>
      </View>
    </View>
  );
}

export function ShortcutsModal(props: ShortcutsModalProps) {
  return (
    <If when={props.open()}>
      <View class="fixed inset-0 z-50 flex-col items-center justify-center bg-black/65 backdrop-blur-md p-4 sm:p-6">
        {/* Click outside to dismiss backdrop */}
        <Button
          onPress={props.onClose}
          class="absolute inset-0 cursor-default"
          accessibilityLabel="Close shortcuts overlay"
        />

        {/* Centered Modal Card */}
        <View
          style={{ maxHeight: "85%" }}
          class="relative w-full max-w-[820px] flex-col rounded-2xl border border-line bg-background shadow-2xl overflow-hidden z-10"
          accessibilityLabel="Keyboard Shortcuts Panel"
        >
          {/* Top Header */}
          <View class="flex-row items-center justify-between border-b border-line px-5 py-4 bg-well/30">
            <View class="flex-row items-center gap-3">
              <View class="h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon name="help-circle" size={18} tone="primary" />
              </View>
              <View class="flex-col">
                <View class="flex-row items-center gap-2">
                  <Text class="text-base font-bold text-foreground">
                    快捷键指南
                  </Text>
                  <View class="rounded-full bg-ready/15 px-2 py-0.5">
                    <Text class="font-mono text-[10px] font-semibold text-ready">
                      通用全量驱动
                    </Text>
                  </View>
                </View>
                <Text class="text-xs text-muted-foreground">
                  所有核心操作均可通过快捷键直接触发，兼顾 Windows 与 Linux 习惯
                </Text>
              </View>
            </View>

            <View class="flex-row items-center gap-2">
              <View class="hidden items-center gap-1 sm:flex-row">
                <Text class="font-mono text-[11px] text-dim">按</Text>
                <KeycapBadge keyText="Esc" />
                <Text class="font-mono text-[11px] text-dim">或</Text>
                <KeycapBadge keyText="?" />
                <Text class="font-mono text-[11px] text-dim">关闭</Text>
              </View>
              <Button
                onPress={props.onClose}
                class="h-7 w-7 items-center justify-center rounded-lg border border-line bg-well transition hover:bg-accent active:scale-95"
                accessibilityLabel="Close"
              >
                <Icon name="x" size={13} tone="foreground" />
              </Button>
            </View>
          </View>

          {/* Scrollable Shortcut Categories (2 columns on wide screen) */}
          <Scroll class="flex-1 p-5">
            <View class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
              <Each of={SHORTCUT_CATEGORIES} key={(cat) => cat.key}>
                {(getCategory) => {
                  const cat = getCategory();
                  return (
                    <View class="flex-col rounded-xl border border-line bg-well/20 p-3.5 gap-1.5">
                      <View class="flex-row items-center justify-between pb-1 border-b border-line/60">
                        <Text class="text-xs font-bold text-primary tracking-wide">
                          {cat.title}
                        </Text>
                        <Text class="text-[10px] text-dim font-mono">
                          {cat.shortcuts.length} 组快捷键
                        </Text>
                      </View>
                      <View class="flex-col">
                        <Each of={cat.shortcuts} key={(item) => item.id}>
                          {(getItem) => <ShortcutRow item={getItem()} />}
                        </Each>
                      </View>
                    </View>
                  );
                }}
              </Each>
            </View>
          </Scroll>

          {/* Bottom Footer */}
          <View class="flex-row items-center justify-between border-t border-line bg-well/20 px-5 py-2.5">
            <Text class="text-[11px] text-muted-foreground">
              提示：在 Windows / Linux 上 Mod 键为{" "}
              <Text class="font-semibold text-foreground">Ctrl</Text>，在 macOS 上为{" "}
              <Text class="font-semibold text-foreground">⌘ (Command)</Text>。
            </Text>
            <Button
              onPress={props.onClose}
              class="rounded-lg bg-primary px-3 py-1 active:opacity-90"
              accessibilityLabel="Done"
            >
              <Text class="text-xs font-semibold text-primary-foreground">
                知道了
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </If>
  );
}
