import { keymap } from "nsh";

export type ShortcutCategoryKey = "global" | "list" | "player";

export interface ShortcutItem {
  id: string;
  keystroke: string;
  label: string;
  description: string;
  keys: string[];
}

export interface ShortcutCategory {
  key: ShortcutCategoryKey;
  title: string;
  description: string;
  shortcuts: ShortcutItem[];
}

/**
 * Format a keystroke expression into human-readable platform labels.
 * E.g. "mod+1" -> "Ctrl+1" on Windows/Linux or "⌘1" on macOS.
 */
export function formatKeystroke(keystroke: string): string {
  try {
    return keymap.label(keystroke);
  } catch {
    return keystroke;
  }
}

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    key: "global",
    title: "全局导航",
    description: "随时随地快速切换视图与常用操作",
    shortcuts: [
      {
        id: "nav-library",
        keystroke: "mod+1",
        label: "媒体库",
        description: "返回媒体库首页",
        keys: ["mod+1"],
      },
      {
        id: "nav-discover",
        keystroke: "mod+2",
        label: "发现素材",
        description: "打开 Discover 精选素材页",
        keys: ["mod+2"],
      },
      {
        id: "focus-omnibar",
        keystroke: "mod+l",
        label: "搜索 / 粘贴链接",
        description: "快速聚焦顶部搜索栏（支持搜索本地或粘贴链接）",
        keys: ["mod+l", "mod+k"],
      },
      {
        id: "nav-settings",
        keystroke: "mod+,",
        label: "偏好设置",
        description: "打开或关闭应用设置面板",
        keys: ["mod+,"],
      },
      {
        id: "open-shortcuts",
        keystroke: "shift+/",
        label: "快捷键面板",
        description: "查看全局快捷键总览（亦可按 F1）",
        keys: ["?", "F1"],
      },
      {
        id: "global-escape",
        keystroke: "escape",
        label: "返回 / 关闭",
        description: "退出播放、关闭弹窗或收起下拉框",
        keys: ["Esc"],
      },
    ],
  },
  {
    key: "list",
    title: "列表与卡片漫游",
    description: "无需鼠标，纯键盘快速选片与管理",
    shortcuts: [
      {
        id: "list-arrows",
        keystroke: "arrows",
        label: "光标移动",
        description: "在媒体库与发现页卡片间移动高亮焦点",
        keys: ["↑", "↓", "←", "→"],
      },
      {
        id: "list-enter",
        keystroke: "enter",
        label: "打开播放",
        description: "进入当前选中视频/音频的沉浸学习页",
        keys: ["Enter"],
      },
      {
        id: "list-open-folder",
        keystroke: "o",
        label: "所在目录",
        description: "在系统文件管理器中定位该条目媒体文件",
        keys: ["O"],
      },
      {
        id: "list-delete",
        keystroke: "delete",
        label: "删除条目",
        description: "确认后从媒体库移除该条目及本地文件",
        keys: ["Delete", "Backspace"],
      },
    ],
  },
  {
    key: "player",
    title: "视频播放与精听",
    description: "原汁原味可理解输入，高效逐句精刷",
    shortcuts: [
      {
        id: "play-toggle",
        keystroke: "space",
        label: "播放 / 暂停",
        description: "切换当前媒体播放与暂停状态",
        keys: ["Space"],
      },
      {
        id: "sentence-prev-next",
        keystroke: "left / right",
        label: "上 / 下一句",
        description: "精准跳转至上一个或下一个字幕句",
        keys: ["←", "→"],
      },
      {
        id: "sentence-replay",
        keystroke: "r",
        label: "单句重播",
        description: "立即重新播放当前句音频与画面",
        keys: ["R"],
      },
      {
        id: "rate-adjust",
        keystroke: "[ / ]",
        label: "倍速调节",
        description: "以 0.25x 为步长减慢或加快播放速度",
        keys: ["[", "]"],
      },
      {
        id: "rate-reset",
        keystroke: "0",
        label: "重置 1.0x",
        description: "瞬间将播放速度重置为正常原速",
        keys: ["0"],
      },
      {
        id: "volume-adjust",
        keystroke: "up / down",
        label: "音量调节",
        description: "向上或向下增减 10% 播放音量",
        keys: ["↑", "↓"],
      },
      {
        id: "mask-toggle",
        keystroke: "m",
        label: "字幕打码",
        description: "开启/关闭字幕模糊遮罩，专注声音本身",
        keys: ["M"],
      },
      {
        id: "blocker-toggle",
        keystroke: "b",
        label: "实体遮挡条",
        description: "自由拖动高斯模糊黑条遮挡画面原生字幕",
        keys: ["B"],
      },
      {
        id: "length-switch",
        keystroke: "alt+1 / 2 / 3",
        label: "分句切分",
        description: "切换字幕短句、中句或长句分词模式",
        keys: ["Alt+1", "Alt+2", "Alt+3"],
      },
    ],
  },
];
