import { keymap, Scroll, Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "./Icon";
import { settings } from "./settings";
import {
  formatKeystroke,
  getShortcutCategories,
  getShortcutsCopy,
  type ShortcutCategory,
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
    <View class="flex-row items-center justify-between gap-3 border-b border-line/40 py-2 last:border-b-0">
      <Text class="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {props.item.label}
      </Text>
      <View class="shrink-0 flex-row items-center gap-1">
        <Each of={props.item.keys} key={(k) => k}>
          {(k) => <KeycapBadge keyText={k()} />}
        </Each>
      </View>
    </View>
  );
}

function CategoryCard(props: { category: ShortcutCategory }) {
  return (
    <View class="flex-col gap-1 rounded-xl border border-line bg-well/20 p-3.5">
      <View class="border-b border-line/60 pb-1.5">
        <Text class="text-xs font-semibold tracking-wide text-primary">
          {props.category.title}
        </Text>
      </View>
      <View class="flex-col">
        <Each of={props.category.shortcuts} key={(item) => item.id}>
          {(getItem) => <ShortcutRow item={getItem()} />}
        </Each>
      </View>
    </View>
  );
}

function ShortcutsModalDialog(props: { onClose: () => void }) {
  const copy = () => getShortcutsCopy(settings().language);
  const categories = () => getShortcutCategories(settings().language);
  const byKey = (key: ShortcutCategory["key"]) =>
    categories().find((c) => c.key === key);

  keymap.bind(
    {
      escape: props.onClose,
      "shift+/": props.onClose,
      f1: props.onClose,
      // Intercept and suppress underlying actions while modal is frontmost
      space: () => {},
      enter: () => {},
      delete: () => {},
      backspace: () => {},
      up: () => {},
      down: () => {},
      left: () => {},
      right: () => {},
      o: () => {},
      r: () => {},
      m: () => {},
      b: () => {},
      "[": () => {},
      "]": () => {},
      "0": () => {},
      "alt+1": () => {},
      "alt+2": () => {},
      "alt+3": () => {},
    },
    { when: "notEditing" },
  );

  return (
    <View class="fixed inset-0 z-50 flex-col items-center justify-center bg-black/65 backdrop-blur-md p-4 sm:p-6">
      {/* Click outside to dismiss backdrop */}
      <Button
        onPress={props.onClose}
        class="absolute inset-0 cursor-default"
        accessibilityLabel="Close shortcuts overlay"
      />

      {/* Centered Modal Card */}
      <View
        style={{ height: 620, maxHeight: "90%" }}
        class="relative z-10 w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-line bg-background shadow-2xl"
        accessibilityLabel={copy().title}
      >
        {/* Top Header */}
        <View class="shrink-0 flex-row items-center justify-between border-b border-line bg-well/30 px-5 py-3.5">
          <View class="flex-row items-center gap-2.5">
            <View class="h-7 w-7 items-center justify-center rounded-lg bg-well">
              <Icon name="help-circle" size={15} tone="muted-foreground" />
            </View>
            <Text class="text-sm font-semibold text-foreground">
              {copy().title}
            </Text>
          </View>

          <Button
            onPress={props.onClose}
            class="h-7 w-7 items-center justify-center rounded-lg border border-line bg-well transition hover:bg-accent active:scale-95"
            accessibilityLabel={copy().close}
          >
            <Icon name="x" size={13} tone="foreground" />
          </Button>
        </View>

        {/* Scrollable Shortcut Categories (2 balanced columns on wide screen) */}
        <Scroll class="min-h-0 flex-1 p-5">
          <View class="flex-col gap-4 pb-2 md:flex-row md:items-start">
            <View class="flex-1 flex-col gap-4">
              <If when={byKey("global")}>
                {(cat) => <CategoryCard category={cat()} />}
              </If>
              <If when={byKey("list")}>
                {(cat) => <CategoryCard category={cat()} />}
              </If>
            </View>
            <View class="flex-1 flex-col gap-4">
              <If when={byKey("player")}>
                {(cat) => <CategoryCard category={cat()} />}
              </If>
            </View>
          </View>
        </Scroll>
      </View>
    </View>
  );
}

export function ShortcutsModal(props: ShortcutsModalProps) {
  return (
    <If when={props.open()}>
      <ShortcutsModalDialog onClose={props.onClose} />
    </If>
  );
}
