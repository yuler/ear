import { expect, test } from "nsh/test";
import { DISCOVER_ITEMS } from "./data";
import type { DurationTier, EnglishLevel, JapaneseLevel } from "./types";

test("DISCOVER_ITEMS has curated English and Japanese videos", () => {
  expect(DISCOVER_ITEMS.length).toBeGreaterThan(15);
  const enCount = DISCOVER_ITEMS.filter((i) => i.language === "en").length;
  const jaCount = DISCOVER_ITEMS.filter((i) => i.language === "ja").length;
  expect(enCount).toBeGreaterThan(0);
  expect(jaCount).toBeGreaterThan(0);
});

test("Rule 1: format is English-English or Japanese-Japanese with tags", () => {
  for (const item of DISCOVER_ITEMS) {
    expect(item.tags.length).toBeGreaterThanOrEqual(2);
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.url.startsWith("https://www.youtube.com/watch?v=")).toBe(true);
    expect(item.thumbnailUrl.startsWith("https://")).toBe(true);

    if (item.language === "en") {
      expect(item.format).toBe("en-en");
      expect(item.formatLabel).toContain("英英结合");
    } else {
      expect(item.format).toBe("ja-ja");
      expect(item.formatLabel).toContain("日日结合");
    }
  }
});

test("Rule 2: levels cover A1-C1 for English and N5-N1 for Japanese", () => {
  const enLevels: EnglishLevel[] = ["A1", "A2", "B1", "B2", "C1"];
  for (const lvl of enLevels) {
    const items = DISCOVER_ITEMS.filter(
      (i) => i.language === "en" && i.level === lvl,
    );
    expect(items.length).toBeGreaterThan(0);
  }

  const jaLevels: JapaneseLevel[] = ["N5", "N4", "N3", "N2", "N1"];
  for (const lvl of jaLevels) {
    const items = DISCOVER_ITEMS.filter(
      (i) => i.language === "ja" && i.level === lvl,
    );
    expect(items.length).toBeGreaterThan(0);
  }
});

test("Rule 3: duration tiers cover 5m, 10m, 20m, and 30m short videos", () => {
  const tiers: DurationTier[] = [5, 10, 20, 30];
  for (const tier of tiers) {
    const items = DISCOVER_ITEMS.filter((i) => i.durationTier === tier);
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      const minutes = item.durationMs / (60 * 1000);
      if (tier === 5) {
        expect(minutes).toBeLessThanOrEqual(7);
      } else if (tier === 10) {
        expect(minutes).toBeLessThanOrEqual(12);
      } else if (tier === 20) {
        expect(minutes).toBeLessThanOrEqual(21);
      } else if (tier === 30) {
        expect(minutes).toBeLessThanOrEqual(31);
      }
    }
  }
});

test("Discover filtering logic filters by language, level, tier, and tag accurately", () => {
  // Filter by English A1
  const enA1 = DISCOVER_ITEMS.filter(
    (i) => i.language === "en" && i.level === "A1",
  );
  expect(enA1.length).toBe(4);

  // Filter by Japanese N5 5-minute video
  const jaN5Short = DISCOVER_ITEMS.filter(
    (i) => i.language === "ja" && i.level === "N5" && i.durationTier === 5,
  );
  expect(jaN5Short.length).toBe(1);
  expect(jaN5Short[0]?.durationTier).toBe(5);

  // Filter by tag
  const podcasts = DISCOVER_ITEMS.filter((i) =>
    i.tags.includes("#Podcast"),
  );
  expect(podcasts.length).toBeGreaterThan(0);
});
