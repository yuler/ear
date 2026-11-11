/** Language category for discover recommendations. */
export type DiscoverLanguage = "en" | "ja";

/** CEFR Levels for English. */
export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1";

/** JLPT Levels for Japanese. */
export type JapaneseLevel = "N5" | "N4" | "N3" | "N2" | "N1";

/** Combined level type. */
export type DiscoverLevel = EnglishLevel | JapaneseLevel;

/** Duration tiers in minutes: 5m, 10m, 20m, 30m. */
export type DurationTier = 5 | 10 | 20 | 30;

/** Content format combining audio and subtitles. */
export type ContentFormat = "en-en" | "ja-ja" | "bilingual";

/** Discover recommendation item. */
export type DiscoverItem = {
  id: string;
  videoId: string;
  url: string;
  title: string;
  author: string;
  language: DiscoverLanguage;
  level: DiscoverLevel;
  levelLabel: string;
  durationTier: DurationTier;
  durationMs: number;
  format: ContentFormat;
  formatLabel: string;
  thumbnailUrl: string;
  description: string;
  tags: readonly string[];
  quality?: string;
  hasSubtitles?: boolean;
};

/** Active filter states for discover. */
export type DiscoverFilterState = {
  language: "all" | DiscoverLanguage;
  level: "all" | DiscoverLevel;
  durationTier: "all" | DurationTier;
  tag: string | null;
  searchQuery: string;
};
