import { Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { Icon } from "../../ui/Icon";
import type {
  DurationTier,
  EnglishLevel,
  JapaneseLevel,
  DiscoverFilterState,
  DiscoverLanguage,
  DiscoverLevel,
} from "./types";

const ENGLISH_LEVELS: readonly { key: EnglishLevel; label: string; desc: string }[] = [
  { key: "A1", label: "A1 入门", desc: "慢速日常·基础词汇" },
  { key: "A2", label: "A2 初级", desc: "生活场景·自然语调" },
  { key: "B1", label: "B1 中级", desc: "经典对话·观点表达" },
  { key: "B2", label: "B2 进阶", desc: "科普讨论·新闻资讯" },
  { key: "C1", label: "C1 高级", desc: "深度访谈·母语语速" },
];

const JAPANESE_LEVELS: readonly { key: JapaneseLevel; label: string; desc: string }[] = [
  { key: "N5", label: "N5 入门", desc: "日常寒暄·简单购物" },
  { key: "N4", label: "N4 基础", desc: "出行旅游·短篇故事" },
  { key: "N3", label: "N3 进阶", desc: "自然闲聊·文化生活" },
  { key: "N2", label: "N2 实用", desc: "新闻速报·职场商务" },
  { key: "N1", label: "N1 高级", desc: "学术讲座·深度政经" },
];

const DURATION_TIERS: readonly { key: DurationTier; label: string; note: string }[] = [
  { key: 5, label: "5 分钟", note: "碎片精听" },
  { key: 10, label: "10 分钟", note: "核心段落" },
  { key: 20, label: "20 分钟", note: "深度对话" },
  { key: 30, label: "30 分钟", note: "沉浸磨耳朵" },
];

const POPULAR_TAGS: readonly string[] = [
  "#DailyConversation",
  "#Podcast",
  "#BBC",
  "#TEDEd",
  "#Shadowing",
  "#TravelEnglish",
  "#Philosophy",
  "#日常会話",
  "#ポッドキャスト",
  "#NHK",
  "#敬語",
  "#アニメ",
];

export function DiscoverFilters(props: {
  filters: () => DiscoverFilterState;
  onChange: (patch: Partial<DiscoverFilterState>) => void;
  totalCount: () => number;
  filteredCount: () => number;
}) {
  const currentLang = () => props.filters().language;
  const currentLevel = () => props.filters().level;
  const currentDuration = () => props.filters().durationTier;
  const currentTag = () => props.filters().tag;
  const searchQuery = () => props.filters().searchQuery;

  const showEnglishLevels = () =>
    currentLang() === "all" || currentLang() === "en";
  const showJapaneseLevels = () =>
    currentLang() === "all" || currentLang() === "ja";

  const handleLevelSelect = (lvl: DiscoverLevel) => {
    if (currentLevel() === lvl) {
      props.onChange({ level: "all" });
    } else {
      props.onChange({ level: lvl });
    }
  };

  const handleDurationSelect = (dur: DurationTier) => {
    if (currentDuration() === dur) {
      props.onChange({ durationTier: "all" });
    } else {
      props.onChange({ durationTier: dur });
    }
  };

  const handleTagSelect = (t: string) => {
    if (currentTag() === t) {
      props.onChange({ tag: null });
    } else {
      props.onChange({ tag: t });
    }
  };

  return (
    <View class="gap-3.5 rounded-xl border border-line bg-well/25 p-3.5 sm:p-4">
      {/* 1. Top row: Language tabs + Search bar */}
      <View class="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Language selector */}
        <View class="flex-row items-center gap-1.5 rounded-lg border border-line bg-popover/80 p-0.5">
          <Button
            onPress={() => props.onChange({ language: "all", level: "all" })}
            class={`rounded-md px-3 py-1 text-xs transition ${
              currentLang() === "all"
                ? "bg-[#2f7cf6] shadow-sm"
                : "active:bg-accent"
            }`}
          >
            <Text
              class={`text-xs ${
                currentLang() === "all"
                  ? "font-semibold text-white"
                  : "font-medium text-muted-foreground"
              }`}
            >
              全部语言
            </Text>
          </Button>
          <Button
            onPress={() => props.onChange({ language: "en", level: "all" })}
            class={`rounded-md px-3 py-1 text-xs transition ${
              currentLang() === "en"
                ? "bg-[#2f7cf6] shadow-sm"
                : "active:bg-accent"
            }`}
          >
            <Text
              class={`text-xs ${
                currentLang() === "en"
                  ? "font-semibold text-white"
                  : "font-medium text-muted-foreground"
              }`}
            >
              英语 · English
            </Text>
          </Button>
          <Button
            onPress={() => props.onChange({ language: "ja", level: "all" })}
            class={`rounded-md px-3 py-1 text-xs transition ${
              currentLang() === "ja"
                ? "bg-[#2f7cf6] shadow-sm"
                : "active:bg-accent"
            }`}
          >
            <Text
              class={`text-xs ${
                currentLang() === "ja"
                  ? "font-semibold text-white"
                  : "font-medium text-muted-foreground"
              }`}
            >
              日语 · 日本語
            </Text>
          </Button>
        </View>

        {/* Search bar */}
        <View class="h-8 min-w-[200px] flex-1 flex-row items-center gap-2 rounded-lg border border-line bg-well px-2.5 sm:max-w-[280px]">
          <Icon name="search" size={12} tone="muted-foreground" />
          <Input
            value={searchQuery()}
            onChange={(e) => props.onChange({ searchQuery: e.value })}
            placeholder="搜索推荐标题、频道或标签…"
            class="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-dim"
          />
          <If when={searchQuery().length > 0}>
            <Button
              onPress={() => props.onChange({ searchQuery: "" })}
              class="h-4 w-4 items-center justify-center rounded-full active:bg-accent"
            >
              <Icon name="x" size={10} tone="muted-foreground" />
            </Button>
          </If>
        </View>
      </View>

      {/* 2. Duration filter row: 5m, 10m, 20m, 30m */}
      <View class="flex-col gap-1.5 sm:flex-row sm:items-center">
        <View class="flex-row items-center gap-1.5 sm:w-20 shrink-0">
          <Icon name="subtitles" size={12} tone="muted-foreground" />
          <Text class="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            时长划分
          </Text>
        </View>

        <View class="flex-row flex-wrap items-center gap-1.5">
          <Button
            onPress={() => props.onChange({ durationTier: "all" })}
            class={`rounded-md border px-2.5 py-1 text-xs transition ${
              currentDuration() === "all"
                ? "border-[#2f7cf6] bg-[#2f7cf6]/15 font-semibold text-[#2f7cf6]"
                : "border-line bg-raised font-medium text-muted-foreground active:bg-accent"
            }`}
          >
            <Text
              class={
                currentDuration() === "all"
                  ? "font-semibold text-[#2f7cf6]"
                  : "text-muted-foreground"
              }
            >
              全部时长
            </Text>
          </Button>
          {DURATION_TIERS.map((tier) => {
            const active = () => currentDuration() === tier.key;
            return (
              <Button
                onPress={() => handleDurationSelect(tier.key)}
                class={`flex-row items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition ${
                  active()
                    ? "border-[#2f7cf6] bg-[#2f7cf6]/15 font-semibold text-[#2f7cf6]"
                    : "border-line bg-raised font-medium text-foreground active:bg-accent"
                }`}
              >
                <Text
                  class={
                    active() ? "font-semibold text-[#2f7cf6]" : "text-foreground"
                  }
                >
                  {tier.label}
                </Text>
                <Text class="font-mono text-[10px] text-dim">({tier.note})</Text>
              </Button>
            );
          })}
        </View>
      </View>

      {/* 3. Level filter row: English A1-C1 or Japanese N5-N1 */}
      <View class="flex-col gap-1.5 sm:flex-row sm:items-start">
        <View class="mt-1 flex-row items-center gap-1.5 sm:w-20 shrink-0">
          <Icon name="check" size={12} tone="muted-foreground" />
          <Text class="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            等级划分
          </Text>
        </View>

        <View class="flex-1 flex-col gap-2">
          {/* English CEFR levels */}
          <If when={showEnglishLevels()}>
            <View class="flex-row flex-wrap items-center gap-1.5">
              <View class="mr-1 rounded bg-dim/20 px-1.5 py-0.5">
                <Text class="font-mono text-[10px] font-semibold text-dim">
                  EN
                </Text>
              </View>
              {ENGLISH_LEVELS.map((lvl) => {
                const active = () => currentLevel() === lvl.key;
                return (
                  <Button
                    onPress={() => handleLevelSelect(lvl.key)}
                    class={`rounded-md border px-2.5 py-1 text-xs transition ${
                      active()
                        ? "border-[#2f7cf6] bg-[#2f7cf6]/15 font-semibold text-[#2f7cf6]"
                        : "border-line bg-raised font-medium text-foreground active:bg-accent"
                    }`}
                  >
                    <Text
                      class={
                        active()
                          ? "font-semibold text-[#2f7cf6]"
                          : "text-foreground"
                      }
                    >
                      {lvl.label}
                    </Text>
                  </Button>
                );
              })}
            </View>
          </If>

          {/* Japanese JLPT levels */}
          <If when={showJapaneseLevels()}>
            <View class="flex-row flex-wrap items-center gap-1.5">
              <View class="mr-1 rounded bg-dim/20 px-1.5 py-0.5">
                <Text class="font-mono text-[10px] font-semibold text-dim">
                  JA
                </Text>
              </View>
              {JAPANESE_LEVELS.map((lvl) => {
                const active = () => currentLevel() === lvl.key;
                return (
                  <Button
                    onPress={() => handleLevelSelect(lvl.key)}
                    class={`rounded-md border px-2.5 py-1 text-xs transition ${
                      active()
                        ? "border-[#2f7cf6] bg-[#2f7cf6]/15 font-semibold text-[#2f7cf6]"
                        : "border-line bg-raised font-medium text-foreground active:bg-accent"
                    }`}
                  >
                    <Text
                      class={
                        active()
                          ? "font-semibold text-[#2f7cf6]"
                          : "text-foreground"
                      }
                    >
                      {lvl.label}
                    </Text>
                  </Button>
                );
              })}
            </View>
          </If>
        </View>
      </View>

      {/* 4. Quick Tags Pills */}
      <View class="flex-row flex-wrap items-center gap-1.5 border-t border-line/50 pt-2.5">
        <Text class="font-mono text-[11px] text-dim">热门标签：</Text>
        {POPULAR_TAGS.map((tag) => {
          const active = () => currentTag() === tag;
          return (
            <Button
              onPress={() => handleTagSelect(tag)}
              class={`rounded-full border px-2 py-0.5 transition ${
                active()
                  ? "border-[#2f7cf6] bg-[#2f7cf6]"
                  : "border-line bg-well/40 hover:bg-well active:scale-95"
              }`}
            >
              <Text
                class={`font-mono text-[11px] ${
                  active() ? "font-semibold text-white" : "text-muted-foreground"
                }`}
              >
                {tag}
              </Text>
            </Button>
          );
        })}
        <If
          when={
            currentLevel() !== "all" ||
            currentDuration() !== "all" ||
            currentTag() !== null ||
            searchQuery().length > 0
          }
        >
          <Button
            onPress={() =>
              props.onChange({
                level: "all",
                durationTier: "all",
                tag: null,
                searchQuery: "",
              })
            }
            class="ml-auto flex-row items-center gap-1 rounded px-2 py-0.5 text-xs text-dim hover:text-foreground"
          >
            <Icon name="x" size={10} tone="muted-foreground" />
            <Text class="text-xs text-muted-foreground">重置筛选</Text>
          </Button>
        </If>
      </View>
    </View>
  );
}
