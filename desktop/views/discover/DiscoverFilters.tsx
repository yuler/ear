import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { shellT } from "../../ui/shellI18n";
import type {
  DiscoverFilterState,
  DiscoverLanguage,
  DiscoverLevel,
  EnglishLevel,
  JapaneseLevel,
} from "./types";

export const CEFR_LEVELS: readonly EnglishLevel[] = ["A1", "A2", "B1", "B2", "C1"];
export const JLPT_LEVELS: readonly JapaneseLevel[] = ["N5", "N4", "N3", "N2", "N1"];

/** The level scale of a language: CEFR for English, JLPT for Japanese. */
export function levelsFor(language: DiscoverLanguage): readonly DiscoverLevel[] {
  return language === "ja" ? JLPT_LEVELS : CEFR_LEVELS;
}

function Chip(props: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      onPress={props.onPress}
      class={`rounded-md px-2.5 py-1 transition ${
        props.active ? "bg-brand" : "hover:bg-well active:bg-accent"
      }`}
      accessibilityLabel={props.label}
    >
      <Text
        class={`text-xs font-medium ${
          props.active ? "text-brand-foreground" : "text-muted-foreground"
        }`}
      >
        {props.label}
      </Text>
    </Button>
  );
}

/** Discover filters: a language and one level group for that language. */
export function DiscoverFilters(props: {
  filters: () => DiscoverFilterState;
  onChange: (patch: Partial<DiscoverFilterState>) => void;
}) {
  const lang = () => props.filters().language;
  const level = () => props.filters().level;
  const languages = (): { key: DiscoverLanguage; label: string }[] => [
    { key: "en", label: shellT().english },
    { key: "ja", label: shellT().japanese },
  ];

  return (
    <View class="flex-row flex-wrap items-center gap-3">
      <View class="flex-row items-center gap-0.5 rounded-lg border border-line p-0.5">
        {languages().map((l) => (
          <Chip
            label={l.label}
            active={lang() === l.key}
            onPress={() => props.onChange({ language: l.key, level: "all" })}
          />
        ))}
      </View>

      <View class="flex-row flex-wrap items-center gap-0.5">
        <Chip
          label={shellT().allLevels}
          active={level() === "all"}
          onPress={() => props.onChange({ level: "all" })}
        />
        {levelsFor(lang()).map((lvl) => (
          <Chip
            label={lvl}
            active={level() === lvl}
            onPress={() =>
              props.onChange({ level: level() === lvl ? "all" : lvl })
            }
          />
        ))}
      </View>
    </View>
  );
}
