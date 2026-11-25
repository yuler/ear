import { Image, token, type Tokens } from "nsh";
import bookmark from "./icons/bookmark.svg";
import check from "./icons/check.svg";
import checkSquare from "./icons/check-square.svg";
import chevronLeft from "./icons/chevron-left.svg";
import chevronRight from "./icons/chevron-right.svg";
import clipboard from "./icons/clipboard.svg";
import compass from "./icons/compass.svg";
import download from "./icons/download.svg";
import ear from "./icons/ear.svg";
import eye from "./icons/eye.svg";
import eyeOff from "./icons/eye-off.svg";
import film from "./icons/film.svg";
import folder from "./icons/folder.svg";
import headphones from "./icons/headphones.svg";
import helpCircle from "./icons/help-circle.svg";
import layoutSide from "./icons/layout-side.svg";
import layoutStacked from "./icons/layout-stacked.svg";
import link from "./icons/link.svg";
import listChecks from "./icons/list-checks.svg";
import loader from "./icons/loader.svg";
import move from "./icons/move.svg";
import music from "./icons/music.svg";
import pause from "./icons/pause.svg";
import play from "./icons/play.svg";
import repeat from "./icons/repeat.svg";
import search from "./icons/search.svg";
import sentencePause from "./icons/sentence-pause.svg";
import settingsIcon from "./icons/settings.svg";
import sparkles from "./icons/sparkles.svg";
import star from "./icons/star.svg";
import subtitles from "./icons/subtitles.svg";
import subtitleBlock from "./icons/subtitle-block.svg";
import trash from "./icons/trash.svg";
import videoLandscape from "./icons/video-landscape.svg";
import videoPortrait from "./icons/video-portrait.svg";
import volume from "./icons/volume.svg";
import volumeX from "./icons/volume-x.svg";
import x from "./icons/x.svg";

const ICONS = {
  bookmark,
  check,
  "check-square": checkSquare,
  "chevron-left": chevronLeft,
  "chevron-right": chevronRight,
  clipboard,
  compass,
  download,
  ear,
  eye,
  "eye-off": eyeOff,
  film,
  folder,
  headphones,
  "help-circle": helpCircle,
  "layout-side": layoutSide,
  "layout-stacked": layoutStacked,
  link,
  "list-checks": listChecks,
  loader,
  move,
  music,
  pause,
  play,
  repeat,
  search,
  "sentence-pause": sentencePause,
  settings: settingsIcon,
  sparkles,
  star,
  subtitles,
  "subtitle-block": subtitleBlock,
  trash,
  "video-landscape": videoLandscape,
  "video-portrait": videoPortrait,
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
