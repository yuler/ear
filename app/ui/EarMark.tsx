import { colorScheme, Image, token, View } from "nsh";
import earArc from "./icons/ear-arc.svg";
import earLoop from "./icons/ear-loop.svg";

/** Two-tone Loop Resonance ("e)") brand mark adapting to light and dark modes. */
export function EarMark(props: { size?: number }) {
  const size = props.size ?? 18;
  const accentColor = () => (colorScheme() === "dark" ? "#2f7cf6" : "#2563eb");

  return (
    <View style={{ width: size, height: size }} class="relative">
      <Image
        src={earLoop}
        class="absolute inset-0"
        style={{
          width: size,
          height: size,
          tintColor: String(token("foreground")),
        }}
      />
      <Image
        src={earArc}
        class="absolute inset-0"
        style={{
          width: size,
          height: size,
          tintColor: accentColor(),
        }}
      />
    </View>
  );
}
