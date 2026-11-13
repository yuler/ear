import { expect, test } from "nsh/test";
import {
  cleanSingleChangelog,
  extractReleaseHighlights,
  fetchMergedReleaseNotes,
  mergeReleaseNotesBetween,
  stripVersionPrefix,
  type GitHubReleaseItem,
} from "./updaterNotes";

test("stripVersionPrefix removes leading semver tags and separators", () => {
  expect(stripVersionPrefix("v0.0.25 — 🐛 [macos] Fix sidebar")).toBe(
    "🐛 [macos] Fix sidebar",
  );
  expect(stripVersionPrefix("0.1.0 - Add feature")).toBe("Add feature");
  expect(stripVersionPrefix("Plain title")).toBe("Plain title");
});

test("extractReleaseHighlights ignores template headings, commit/author footers, and broken %s placeholders", () => {
  const rel: GitHubReleaseItem = {
    tag_name: "v0.0.25",
    name: "v0.0.25 — 🐛 [macos] Fix sidebar traffic-light overlap and add macOS app icon (#21)",
    body: "### What's Changed\n**%s**\n\n%s\n\n---\n- **Commit**: [`abc`](https://github.com/yuler/ear/commit/abc)\n- **Author**: Yu Le\n",
  };

  expect(extractReleaseHighlights(rel)).toEqual([
    "🐛 [macos] Fix sidebar traffic-light overlap and add macOS app icon (#21)",
  ]);
});

test("mergeReleaseNotesBetween consolidates all intermediate releases without version headers", () => {
  const releases: GitHubReleaseItem[] = [
    {
      tag_name: "v0.0.25",
      name: "v0.0.25 — 🐛 [macos] Fix sidebar traffic-light overlap and add macOS app icon (#21)",
      body: "### What's Changed\n**%s**\n\n%s\n",
    },
    {
      tag_name: "v0.0.24",
      name: "v0.0.24 — 🐛 [release] Fix macOS bundle CLI overwrite and version injection (#20)",
      body: "### What's Changed\n**%s**\n",
    },
    {
      tag_name: "v0.0.23",
      name: "v0.0.23 — ✨ [shortcuts] Universal keyboard navigation and cheat sheet modal (#19)",
      body: "### What's Changed\n**✨ [shortcuts] Universal keyboard navigation and cheat sheet modal (#19)**\n\n* Scope actions to frontmost surface\n\n---\n- **Commit**: [`9ad1225`](https://example.com)\n- **Author**: Yu Le",
    },
    {
      tag_name: "v0.0.22",
      name: "v0.0.22 — 🔧 [release] Align artifact filenames (#18)",
      body: "",
    },
  ];

  const merged = mergeReleaseNotesBetween(releases, "0.0.22", "0.0.25");
  expect(merged).toEqual([
    "🐛 [macos] Fix sidebar traffic-light overlap and add macOS app icon (#21)",
    "🐛 [release] Fix macOS bundle CLI overwrite and version injection (#20)",
    "✨ [shortcuts] Universal keyboard navigation and cheat sheet modal (#19)",
    "Scope actions to frontmost surface",
  ]);
  expect(merged.some((line) => line.includes("v0.0.24"))).toBe(false);
  expect(merged.some((line) => line.includes("v0.0.22"))).toBe(false);
});

test("mergeReleaseNotesBetween falls back to cleaned manifest notes when no releases match", () => {
  const merged = mergeReleaseNotesBetween(
    [],
    "0.0.22",
    "0.0.25",
    "### What's Changed\n**%s**\n\n- Improve player stability\n---\n- **Author**: Maintainer",
  );
  expect(merged).toEqual(["Improve player stability"]);
});

test("cleanSingleChangelog returns empty array when fallback notes only contain broken template", () => {
  expect(
    cleanSingleChangelog(
      "### What's Changed\n**%s**\n\n%s\n\n---\n- **Commit**: [`%s`](https://github.com/yuler/ear/commit/%s)\n- **Author**: %s\n",
    ),
  ).toEqual([]);
});

test("fetchMergedReleaseNotes uses custom fetchReleasesFn", async () => {
  const items = await fetchMergedReleaseNotes("0.0.22", "0.0.25", "", {
    fetchReleasesFn: async () => [
      {
        tag_name: "v0.0.25",
        name: "v0.0.25 — 🐛 [macos] Fix sidebar traffic-light overlap (#21)",
      },
      {
        tag_name: "v0.0.24",
        name: "v0.0.24 — 🐛 [release] Fix macOS bundle CLI overwrite (#20)",
      },
      {
        tag_name: "v0.0.23",
        name: "v0.0.23 — ✨ [shortcuts] Universal keyboard navigation (#19)",
      },
    ],
  });

  expect(items).toEqual([
    "🐛 [macos] Fix sidebar traffic-light overlap (#21)",
    "🐛 [release] Fix macOS bundle CLI overwrite (#20)",
    "✨ [shortcuts] Universal keyboard navigation (#19)",
  ]);
});
