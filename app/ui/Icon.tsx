import { Image, token, type Tokens } from "nsh";
import chevronLeft from "./icons/chevron-left.svg";
import chevronRight from "./icons/chevron-right.svg";
import clipboard from "./icons/clipboard.svg";
import link from "./icons/link.svg";
import loader from "./icons/loader.svg";
import pause from "./icons/pause.svg";
import play from "./icons/play.svg";
import repeat from "./icons/repeat.svg";
import search from "./icons/search.svg";
import settingsIcon from "./icons/settings.svg";
import x from "./icons/x.svg";

const ICONS = {
  "chevron-left": chevronLeft,
  "chevron-right": chevronRight,
  clipboard,
  link,
  loader,
  pause,
  play,
  repeat,
  search,
  settings: settingsIcon,
  x,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon(props: {
  name: IconName;
  size?: number;
  tone?: keyof Tokens;
  color?: string;
  class?: string;
}) {
  const size = props.size ?? 15;
  const tint = () =>
    props.color ??
    (props.tone ? String(token(props.tone)) : String(token("foreground")));

  return (
    <Image
      src={ICONS[props.name]}
      class={props.class}
      style={{
        width: size,
        height: size,
        tintColor: tint(),
      }}
    />
  );
}
