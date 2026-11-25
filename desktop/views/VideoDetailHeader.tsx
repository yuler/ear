import { signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import { macTitleBarInsets } from "../ui/titleBarInsets";
import { PLAYER_HEADER_H } from "./playerLayout";

export type VideoDetailHeaderProps = {
  title: () => string;
  onBack: () => void;
  language: () => EarLocale;
  /** While playing (paused === false), the header fades out unless hovered/focused. */
  paused?: () => boolean;
  /** Overlays directly on the dark video stage (true by default). */
  overVideo?: () => boolean;
  /** Optional width constraint so the header spans only the video stage in side mode. */
  width?: () => number;
};

/** Pure visibility rule: shown when paused, hovered, or keyboard-focused. */
export function shouldShowPlayerHeader(
  paused: boolean,
  hovered: boolean,
  focused = false,
): boolean {
  return paused || hovered || focused;
}

/**
 * Floating slim player header with a subtle top-to-bottom transparent gradient
 * and weakened title. Auto-hides while playing unless hovered or focused.
 */
export function VideoDetailHeader(props: VideoDetailHeaderProps) {
  const m = () => t(props.language());
  const leftInset = () => macTitleBarInsets().left;
  const hovered = signal(false);
  const paused = () => props.paused?.() ?? true;
  const overVideo = () => props.overVideo?.() ?? true;
  const visible = () => shouldShowPlayerHeader(paused(), hovered());

  return (
    <View
      onMouseEnter={() => hovered.set(true)}
      onMouseLeave={() => hovered.set(false)}
      style={{
        height: PLAYER_HEADER_H + 14,
        ...(props.width ? { width: props.width() } : {}),
        opacity: visible() ? 1 : 0,
        transitionProperty: "opacity",
        transitionDuration: "240ms",
        transitionTimingFunction: "ease-out",
      }}
      focusWithinStyle={{ opacity: 1 }}
      class={`absolute top-0 left-0 z-30 flex-col justify-start ${
        props.width ? "" : "right-0"
      } ${
        overVideo()
          ? "bg-linear-to-b from-black/75 via-black/35 to-transparent"
          : "bg-linear-to-b from-background/95 via-background/65 to-transparent"
      }`}
    >
      <View
        style={{
          height: PLAYER_HEADER_H,
          paddingLeft: leftInset() > 0 ? leftInset() + 8 : 8,
        }}
        class="relative w-full flex-row items-center gap-2 pr-3"
      >
        <Button
          onPress={props.onBack}
          class={`z-10 h-7 shrink-0 flex-row items-center gap-1 rounded-md px-2 transition ${
            overVideo()
              ? "hover:bg-white/15 active:bg-white/20"
              : "hover:bg-accent/80 active:bg-accent"
          }`}
          accessibilityLabel={m().backToLibrary}
        >
          <Icon
            name="chevron-left"
            size={15}
            color={overVideo() ? "rgba(255, 255, 255, 0.8)" : undefined}
            tone={overVideo() ? undefined : "muted-foreground"}
          />
          <Text
            class={`text-xs font-medium ${
              overVideo() ? "text-white/80" : "text-muted-foreground"
            }`}
          >
            {m().back}
          </Text>
        </Button>

        <View class="pointer-events-none min-w-0 flex-1 justify-center">
          <Text
            class={`truncate text-xs font-normal ${
              overVideo() ? "text-white/70" : "text-muted-foreground/80"
            }`}
            accessibilityLabel={props.title()}
          >
            {props.title()}
          </Text>
        </View>
      </View>
    </View>
  );
}
