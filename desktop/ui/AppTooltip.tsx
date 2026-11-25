import { Text } from "nsh";
import { Tooltip, type TooltipProps } from "nsh/base";

/**
 * App-styled floating tooltip bubble.
 * `nsh` renders `tooltip` elements headless (as-is), so views should pass
 * `<AppTooltip />` instead of bare `<Text>` nodes.
 */
export function AppTooltip(props: {
  label: string;
  mono?: boolean;
  placement?: TooltipProps["placement"];
  align?: TooltipProps["align"];
  offset?: number;
  delay?: number;
}) {
  return (
    <Tooltip
      placement={props.placement ?? "top"}
      align={props.align ?? "center"}
      offset={props.offset ?? 6}
      delay={props.delay ?? 350}
      class="max-w-[360px] rounded-md border border-line bg-popover px-2 py-1 shadow-md transition-opacity duration-150"
      startingClass="opacity-0"
      endingClass="opacity-0"
    >
      <Text
        class={`${
          props.mono ? "font-mono text-[11px]" : "text-xs"
        } leading-snug text-popover-foreground`}
      >
        {props.label}
      </Text>
    </Tooltip>
  );
}
