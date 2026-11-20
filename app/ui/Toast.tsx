import { signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "./Icon";
import { shellT } from "./shellI18n";

export type ToastKind = "error" | "info";

type ToastState = { id: number; message: string; kind: ToastKind };

const current = signal<ToastState | null>(null);
let nextId = 1;

/** Shows a short message at the bottom of the window; errors stay longer. */
export function showToast(message: string, kind: ToastKind = "info"): void {
  const id = nextId++;
  current.set({ id, message, kind });
  setTimeout(
    () => {
      if (current()?.id === id) current.set(null);
    },
    kind === "error" ? 8000 : 4000,
  );
}

export function dismissToast(): void {
  current.set(null);
}

/** The toast itself; mount once near the root. */
export function ToastHost() {
  return (
    <If when={current()}>
      {(toast) => (
        <View class="pointer-events-none absolute right-0 bottom-4 left-0 z-40 items-center px-4">
          <View
            role="alert"
            class={`pointer-events-auto max-w-[520px] flex-row items-center gap-2 rounded-lg border bg-popover py-2 pr-1.5 pl-3 shadow-lg ${
              toast().kind === "error" ? "border-destructive/50" : "border-line"
            }`}
          >
            <Text
              class={`min-w-0 flex-1 text-sm ${
                toast().kind === "error" ? "text-destructive" : "text-foreground"
              }`}
            >
              {toast().message}
            </Text>
            <Button
              onPress={dismissToast}
              class="h-6 w-6 items-center justify-center rounded-md active:bg-accent"
              accessibilityLabel={shellT().dismiss}
            >
              <Icon name="x" size={12} tone="muted-foreground" />
            </Button>
          </View>
        </View>
      )}
    </If>
  );
}
