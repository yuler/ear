import { Text, View } from "nsh";

/**
 * Non-interactive diagonal "DEV" corner ribbon shown in local development builds
 * so Dev windows are immediately distinguishable from Production windows.
 */
export function DevRibbon() {
  return (
    <View class="pointer-events-none absolute top-0 right-0 w-24 h-24 overflow-hidden z-50">
      <View class="absolute top-3 -right-8 w-28 py-0.5 bg-amber-500/85 border-y border-amber-300/40 rotate-45 items-center justify-center shadow-sm">
        <Text class="text-[10px] font-bold tracking-[0.18em] text-zinc-950 uppercase">
          DEV
        </Text>
      </View>
    </View>
  );
}
