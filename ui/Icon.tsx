import { Image, token, type Tokens } from "nsh";
import arrowRight from "./icons/arrow-right.svg";
import check from "./icons/check.svg";
import chevronLeft from "./icons/chevron-left.svg";
import chevronRight from "./icons/chevron-right.svg";
import clipboard from "./icons/clipboard.svg";
import clock from "./icons/clock.svg";
import download from "./icons/download.svg";
import ear from "./icons/ear.svg";
import eyeOff from "./icons/eye-off.svg";
import eye from "./icons/eye.svg";
import folder from "./icons/folder.svg";
import gauge from "./icons/gauge.svg";
import hardDrive from "./icons/hard-drive.svg";
import headphones from "./icons/headphones.svg";
import keyboard from "./icons/keyboard.svg";
import layers from "./icons/layers.svg";
import link from "./icons/link.svg";
import list from "./icons/list.svg";
import loader from "./icons/loader.svg";
import more from "./icons/more.svg";
import panelLeft from "./icons/panel-left.svg";
import pause from "./icons/pause.svg";
import play from "./icons/play.svg";
import repeat from "./icons/repeat.svg";
import rotate from "./icons/rotate.svg";
import search from "./icons/search.svg";
import sparkles from "./icons/sparkles.svg";
import subtitles from "./icons/subtitles.svg";
import sunMoon from "./icons/sun-moon.svg";
import x from "./icons/x.svg";

const ICONS = {
  "arrow-right": arrowRight,
  check,
  "chevron-left": chevronLeft,
  "chevron-right": chevronRight,
  clipboard,
  clock,
  download,
  ear,
  "eye-off": eyeOff,
  eye,
  folder,
  gauge,
  "hard-drive": hardDrive,
  headphones,
  keyboard,
  layers,
  link,
  list,
  loader,
  more,
  "panel-left": panelLeft,
  pause,
  play,
  repeat,
  rotate,
  search,
  sparkles,
  subtitles,
  "sun-moon": sunMoon,
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
    (props.tone ? String(token(props.tone)) : String(token("paper")));

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
