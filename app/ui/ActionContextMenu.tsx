import { Text, type JSX } from "nsh";
import { ContextMenu, MenuItem, MenuSeparator } from "nsh/base";
import { Icon, type IconName } from "./Icon";
import { formatKeystroke } from "./shortcuts";

export type ContextMenuActionItem = {
  label: string;
  icon: IconName;
  shortcut?: string;
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type ContextMenuEntry =
  | { type: "separator" }
  | ContextMenuActionItem;

/**
 * App-styled right-click context menu with a leading SVG icon on every action.
 * Uses `nsh/base` ContextMenu instead of native `Menu.popup` so icons render
 * consistently beside labels across Linux (GTK), macOS, and Windows.
 */
export function ActionContextMenu(props: {
  items: () => (ContextMenuEntry | null)[];
  trigger: JSX.Element;
  disabled?: boolean;
  class?: string;
}) {
  const entries = () =>
    props.items().filter((item): item is ContextMenuEntry => item !== null);

  return (
    <ContextMenu
      class={props.class}
      disabled={props.disabled}
      offset={4}
      popupClass="min-w-[196px] rounded-xl border border-line bg-popover p-1 shadow-xl transition-opacity duration-100"
      popupStartingClass="opacity-0"
      popupEndingClass="opacity-0"
      trigger={props.trigger}
    >
      <Each
        of={entries()}
        key={(item, idx) =>
          "type" in item ? `sep-${idx}` : `${item.icon}-${item.label}-${idx}`
        }
      >
        {(getItem) => (
          <If
            when={"type" in getItem()}
            else={(() => {
              const action = () => getItem() as ContextMenuActionItem;
              return (
                <MenuItem
                  checked={action().checked}
                  disabled={action().disabled}
                  onSelect={() => action().onSelect()}
                  class={`flex-row items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition disabled:opacity-45 ${
                    action().destructive
                      ? "hover:bg-danger-soft focus:bg-danger-soft active:bg-danger-soft"
                      : "hover:bg-well focus:bg-well active:bg-accent"
                  }`}
                >
                  <Icon
                    name={action().icon}
                    size={14}
                    tone={
                      action().destructive
                        ? "danger"
                        : action().checked
                          ? "brand"
                          : "muted-foreground"
                    }
                  />
                  <Text
                    class={`min-w-0 flex-1 text-xs font-medium ${
                      action().destructive ? "text-danger" : "text-foreground"
                    }`}
                  >
                    {action().label}
                  </Text>
                  <If when={Boolean(action().shortcut)}>
                    <Text class="ml-3 shrink-0 font-mono text-[10px] text-dim">
                      {formatKeystroke(action().shortcut ?? "")}
                    </Text>
                  </If>
                </MenuItem>
              );
            })()}
          >
            <MenuSeparator class="my-1 h-px bg-line/70" />
          </If>
        )}
      </Each>
    </ContextMenu>
  );
}
