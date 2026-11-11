import { expect, test } from "nsh/test";
import { setEarSpawnHook, type SpawnChildLike } from "../../youtube/earClient";
import {
  discoverError,
  discoverFromCache,
  discoverItems,
  discoverUpdatedAt,
  fetchDiscoverItems,
  filterDiscoverItems,
  isDiscoverLoading,
  loadDiscover,
  toDiscoverItem,
  type RawDiscoverCliItem,
} from "./source";
import type { DiscoverFilterState, DiscoverItem } from "./types";

const FIXTURE_RAW_ITEMS: RawDiscoverCliItem[] = [
  {
    videoId: "zmBWacJ6CQk",
    title: "Slow English Conversations (A1+ comprehensible input)",
    author: "Miss Honey 🍯",
    durationMs: 2360000,
    language: "en",
    level: "A1",
    tags: ["#DailyLife", "#Shadowing", "#SlowAudio"],
    description: "Clear, slow-paced daily conversation practice designed for A1 level comprehension.",
    durationTier: 30,
    thumbnailUrl: "https://i.ytimg.com/vi/zmBWacJ6CQk/hqdefault.jpg",
  },
  {
    videoId: "reKgQh0E9kg",
    title: "My Daily Routine | Easy English Listening Practice (A2 Level)",
    author: "English Phrases Hub",
    durationMs: 769000,
    language: "en",
    level: "A2",
    tags: ["#DailyRoutine", "#ListeningPractice", "#A2"],
    description: "Everyday routines explained in accessible A2 English.",
    durationTier: 10,
    thumbnailUrl: "https://i.ytimg.com/vi/reKgQh0E9kg/hqdefault.jpg",
  },
  {
    videoId: "3mxblcBZgqM",
    title: "【5 min Japanese Listening】simple Q&A! Easy but a little fast!",
    author: "Daily Japanese with Naoko",
    durationMs: 365000,
    language: "ja",
    level: "N5",
    tags: ["#JLPT_N5", "#QA", "#Short"],
    description: "Short and natural Japanese Q&A listening drill for beginner learners.",
    durationTier: 5,
    thumbnailUrl: "https://i.ytimg.com/vi/3mxblcBZgqM/hqdefault.jpg",
  },
];

test("toDiscoverItem converts raw CLI item into full DiscoverItem contract", () => {
  const enItem = toDiscoverItem(FIXTURE_RAW_ITEMS[0]);
  expect(enItem.id).toBe("zmBWacJ6CQk");
  expect(enItem.videoId).toBe("zmBWacJ6CQk");
  expect(enItem.url).toBe("https://www.youtube.com/watch?v=zmBWacJ6CQk");
  expect(enItem.format).toBe("en-en");
  expect(enItem.formatLabel).toBe("英英结合");
  expect(enItem.levelLabel).toBe("A1 · CEFR");
  expect(enItem.durationTier).toBe(30);

  const jaItem = toDiscoverItem(FIXTURE_RAW_ITEMS[2]);
  expect(jaItem.id).toBe("3mxblcBZgqM");
  expect(jaItem.format).toBe("ja-ja");
  expect(jaItem.formatLabel).toBe("日日结合");
  expect(jaItem.levelLabel).toBe("N5 · JLPT");
  expect(jaItem.durationTier).toBe(5);
});

test("filterDiscoverItems filters by language, level, tier, tag, and search query", () => {
  const items: DiscoverItem[] = FIXTURE_RAW_ITEMS.map(toDiscoverItem);

  const defaultFilters: DiscoverFilterState = {
    language: "all",
    level: "all",
    durationTier: "all",
    tag: null,
    searchQuery: "",
  };

  // 1. Language filter
  const enOnly = filterDiscoverItems(items, { ...defaultFilters, language: "en" });
  expect(enOnly.length).toBe(2);

  const jaOnly = filterDiscoverItems(items, { ...defaultFilters, language: "ja" });
  expect(jaOnly.length).toBe(1);
  expect(jaOnly[0].videoId).toBe("3mxblcBZgqM");

  // 2. Level filter
  const a2Only = filterDiscoverItems(items, { ...defaultFilters, level: "A2" });
  expect(a2Only.length).toBe(1);
  expect(a2Only[0].videoId).toBe("reKgQh0E9kg");

  // 3. Duration tier filter
  const tier30Only = filterDiscoverItems(items, { ...defaultFilters, durationTier: 30 });
  expect(tier30Only.length).toBe(1);
  expect(tier30Only[0].videoId).toBe("zmBWacJ6CQk");

  // 4. Tag filter
  const tagFilter = filterDiscoverItems(items, { ...defaultFilters, tag: "#DailyRoutine" });
  expect(tagFilter.length).toBe(1);
  expect(tagFilter[0].videoId).toBe("reKgQh0E9kg");

  // 5. Search query
  const searchAuthor = filterDiscoverItems(items, { ...defaultFilters, searchQuery: "Honey" });
  expect(searchAuthor.length).toBe(1);
  expect(searchAuthor[0].videoId).toBe("zmBWacJ6CQk");
});

test("fetchDiscoverItems invokes ear discover with mock spawn and parses result", async () => {
  let capturedArgs: string[] = [];

  setEarSpawnHook((_bin: string, args: string[]): SpawnChildLike => {
    capturedArgs = args;
    const listeners: Record<string, ((arg: any) => void)[]> = {};

    setTimeout(() => {
      const payload = JSON.stringify({
        type: "result",
        schemaVersion: 1,
        updatedAt: "2026-11-11",
        fromCache: false,
        items: FIXTURE_RAW_ITEMS,
      });
      listeners["stdout"]?.forEach((fn) => fn(payload));
      listeners["close"]?.forEach((fn) => fn(0));
    }, 5);

    return {
      on(event: string, handler: (arg: any) => void) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
        return this;
      },
    };
  });

  try {
    const res = await fetchDiscoverItems();
    expect(capturedArgs).toEqual(["discover"]);
    expect(res.items.length).toBe(3);
    expect(res.updatedAt).toBe("2026-11-11");
    expect(res.fromCache).toBe(false);
  } finally {
    setEarSpawnHook(null);
  }
});

test("fetchDiscoverItems passes --refresh when refresh option is true", async () => {
  let capturedArgs: string[] = [];

  setEarSpawnHook((_bin: string, args: string[]): SpawnChildLike => {
    capturedArgs = args;
    const listeners: Record<string, ((arg: any) => void)[]> = {};

    setTimeout(() => {
      const payload = JSON.stringify({
        type: "result",
        schemaVersion: 1,
        updatedAt: "2026-11-11",
        fromCache: false,
        items: FIXTURE_RAW_ITEMS,
      });
      listeners["stdout"]?.forEach((fn) => fn(payload));
      listeners["close"]?.forEach((fn) => fn(0));
    }, 5);

    return {
      on(event: string, handler: (arg: any) => void) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
        return this;
      },
    };
  });

  try {
    const res = await fetchDiscoverItems({ refresh: true });
    expect(capturedArgs).toEqual(["discover", "--refresh"]);
    expect(res.items.length).toBe(3);
  } finally {
    setEarSpawnHook(null);
  }
});

test("fetchDiscoverItems rejects when ear discover emits error", async () => {
  setEarSpawnHook((_bin: string, _args: string[]): SpawnChildLike => {
    const listeners: Record<string, ((arg: any) => void)[]> = {};

    setTimeout(() => {
      const errPayload = JSON.stringify({
        type: "error",
        message: "Network unreachable and no cache available",
      });
      listeners["stdout"]?.forEach((fn) => fn(errPayload));
      listeners["close"]?.forEach((fn) => fn(1));
    }, 5);

    return {
      on(event: string, handler: (arg: any) => void) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
        return this;
      },
    };
  });

  try {
    let errorCaught: Error | null = null;
    try {
      await fetchDiscoverItems();
    } catch (e) {
      errorCaught = e as Error;
    }
    expect(errorCaught).not.toBeNull();
    expect(errorCaught?.message).toContain("Network unreachable");
  } finally {
    setEarSpawnHook(null);
  }
});

test("loadDiscover updates reactive signals on success and manages loading state", async () => {
  setEarSpawnHook((_bin: string, _args: string[]): SpawnChildLike => {
    const listeners: Record<string, ((arg: any) => void)[]> = {};

    setTimeout(() => {
      const payload = JSON.stringify({
        type: "result",
        schemaVersion: 1,
        updatedAt: "2026-11-11",
        fromCache: true,
        items: FIXTURE_RAW_ITEMS,
      });
      listeners["stdout"]?.forEach((fn) => fn(payload));
      listeners["close"]?.forEach((fn) => fn(0));
    }, 5);

    return {
      on(event: string, handler: (arg: any) => void) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
        return this;
      },
    };
  });

  try {
    const p = loadDiscover();
    expect(isDiscoverLoading()).toBe(true);
    const items = await p;
    expect(isDiscoverLoading()).toBe(false);
    expect(items.length).toBe(3);
    expect(discoverItems().length).toBe(3);
    expect(discoverUpdatedAt()).toBe("2026-11-11");
    expect(discoverFromCache()).toBe(true);
    expect(discoverError()).toBeNull();
  } finally {
    setEarSpawnHook(null);
  }
});
