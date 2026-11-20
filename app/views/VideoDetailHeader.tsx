import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "../ui/Icon";
import { t, type EarLocale } from "../ui/i18n";
import { macTitleBarInsets } from "../ui/titleBarInsets";
import { PLAYER_HEADER_H } from "./playerLayout";

export type VideoDetailHeaderProps = {
  title: () => string;
  onBack: () => void;
  language: () => EarLocale;
};

/** Fixed slim header across the full width: back on the left, title centered. */
export function VideoDetailHeader(props: VideoDetailHeaderProps) {
  const m = () => t(props.language());
  const leftInset = () => macTitleBarInsets().left;

  return (
    <View
      style={{ height: PLAYER_HEADER_H, paddingLeft: leftInset() > 0 ? leftInset() + 8 : 8 }}
      class="w-full shrink-0 flex-row items-center border-b border-border bg-background pr-2"
    >
      <Button
        onPress={props.onBack}
        class="z-10 h-8 flex-row items-center gap-1 rounded-md px-2 hover:bg-accent"
        accessibilityLabel={m().backToLibrary}
      >
        <Icon name="chevron-left" size={16} tone="foreground" />
        <Text class="text-sm text-foreground">{m().back}</Text>
      </Button>
      <View class="pointer-events-none absolute inset-y-0 left-40 right-40 items-center justify-center">
        <Text
          class="truncate text-sm font-medium text-foreground"
          accessibilityLabel={props.title()}
        >
          {props.title()}
        </Text>
      </View>
    </View>
  );
}
