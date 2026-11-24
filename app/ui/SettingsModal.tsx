import { keymap, Scroll, Text, View } from "nsh";
import { Button } from "nsh/base";
import { SettingsView } from "../views/SettingsView";
import { Icon } from "./Icon";
import { shellT } from "./shellI18n";

export type SettingsModalProps = {
  open: () => boolean;
  onClose: () => void;
  onOpenShortcuts: () => void;
};

function SettingsModalDialog(props: {
  onClose: () => void;
  onOpenShortcuts: () => void;
}) {
  keymap.bind(
    {
      // Suppress underlying library/player shortcuts while modal is open;
      // Escape is coordinated centrally in App's overlay stack.
      space: () => {},
      enter: () => {},
      delete: () => {},
      backspace: () => {},
      up: () => {},
      down: () => {},
      left: () => {},
      right: () => {},
      o: () => {},
      x: () => {},
      a: () => {},
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
    <View class="fixed inset-0 z-40 flex-col items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
      <Button
        onPress={props.onClose}
        class="absolute inset-0 cursor-default"
        accessibilityLabel="Close settings overlay"
      />

      <View
        style={{ height: 496, maxHeight: "85%" }}
        class="relative z-10 w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-line bg-background shadow-2xl"
        accessibilityLabel={shellT().settings}
      >
        <View class="shrink-0 flex-row items-center justify-between border-b border-line bg-well/30 px-5 py-3.5">
          <View class="flex-row items-center gap-2.5">
            <View class="h-7 w-7 items-center justify-center rounded-lg bg-well">
              <Icon name="settings" size={15} tone="muted-foreground" />
            </View>
            <Text class="text-sm font-semibold text-foreground">
              {shellT().settings}
            </Text>
          </View>

          <Button
            onPress={props.onClose}
            class="h-7 w-7 items-center justify-center rounded-lg border border-line bg-well transition hover:bg-accent active:scale-95"
            accessibilityLabel={shellT().close}
          >
            <Icon name="x" size={13} tone="foreground" />
          </Button>
        </View>

        <Scroll class="min-h-0 flex-1">
          <SettingsView embedded onOpenShortcuts={props.onOpenShortcuts} />
        </Scroll>
      </View>
    </View>
  );
}

export function SettingsModal(props: SettingsModalProps) {
  return (
    <If when={props.open()}>
      <SettingsModalDialog
        onClose={props.onClose}
        onOpenShortcuts={props.onOpenShortcuts}
      />
    </If>
  );
}
