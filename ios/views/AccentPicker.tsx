import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Haptics } from "nsh/mobile";
import { ACCENT_COLORS, accentSwatch } from "../mirror/accent";
import type { AccentColor } from "../mirror/types";

/** Five preset accent colors. The swatch fill stays on the preset, not the live theme. */
export function AccentPicker(props: {
  value: () => AccentColor;
  labelFor: (accent: AccentColor) => string;
  onChange: (accent: AccentColor) => void;
}) {
  return (
    <View class="flex-row gap-1.5">
      {ACCENT_COLORS.map((accent) => {
        const selected = () => props.value() === accent;
        const label = () => props.labelFor(accent);
        return (
          <Button
            accessibilityLabel={label()}
            onPress={() => {
              if (selected()) return;
              Haptics.selection();
              props.onChange(accent);
            }}
            class={`flex-1 items-center gap-1 rounded-xl border-2 px-1 py-2 ${
              selected() ? "border-foreground bg-card" : "border-transparent"
            }`}
          >
            <View
              style={{ backgroundColor: accentSwatch(accent) }}
              class="h-7 w-7 rounded-full"
            />
            <Text class="text-[11px] font-medium text-foreground">{label()}</Text>
          </Button>
        );
      })}
    </View>
  );
}
