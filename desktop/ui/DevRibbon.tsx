import { Text, View } from "nsh";

/**
 * Non-interactive diagonal "DEV" corner ribbon shown in local development builds
 * so Dev windows are immediately distinguishable from Production windows.
 */
export function DevRibbon() {
  return (
    <View class="pointer-events-none absolute top-0 left-0 z-50 h-24 w-24 overflow-hidden opacity-40">
      <View class="absolute top-3 -left-8 w-28 -rotate-45 items-center justify-center border-y border-amber-300/40 bg-amber-500/80 py-0.5 shadow-sm">
        <Text class="text-[10px] font-bold tracking-[0.18em] text-zinc-950 uppercase">
          DEV
        </Text>
      </View>
    </View>
  );
}
