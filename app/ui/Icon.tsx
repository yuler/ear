import { Image, token, type Tokens } from "nsh";
import check from "./icons/check.svg";
import chevronLeft from "./icons/chevron-left.svg";
import chevronRight from "./icons/chevron-right.svg";
import clipboard from "./icons/clipboard.svg";
import compass from "./icons/compass.svg";
import download from "./icons/download.svg";
import eye from "./icons/eye.svg";
import eyeOff from "./icons/eye-off.svg";
import film from "./icons/film.svg";
import folder from "./icons/folder.svg";
import headphones from "./icons/headphones.svg";
import link from "./icons/link.svg";
import loader from "./icons/loader.svg";
import move from "./icons/move.svg";
import music from "./icons/music.svg";
import pause from "./icons/pause.svg";
import play from "./icons/play.svg";
import repeat from "./icons/repeat.svg";
import search from "./icons/search.svg";
import settingsIcon from "./icons/settings.svg";
import sparkles from "./icons/sparkles.svg";
import subtitles from "./icons/subtitles.svg";
import subtitleBlock from "./icons/subtitle-block.svg";
import volume from "./icons/volume.svg";
import volumeX from "./icons/volume-x.svg";
import x from "./icons/x.svg";

const ICONS = {
  check,
  "chevron-left": chevronLeft,
  "chevron-right": chevronRight,
  clipboard,
  compass,
  download,
  eye,
  "eye-off": eyeOff,
  film,
  folder,
  headphones,
  link,
  loader,
  move,
  music,
  pause,
  play,
  repeat,
  search,
  settings: settingsIcon,
  sparkles,
  subtitles,
  "subtitle-block": subtitleBlock,
  volume,
  "volume-x": volumeX,
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
