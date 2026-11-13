import { compareSemVer } from "./updater";

export interface GitHubReleaseItem {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

const GITHUB_RELEASES_API = "https://api.github.com/repos/yuler/ear/releases?per_page=30";

/** Strip leading release version prefix like `v0.0.25 — ` or `0.0.25 - `. */
export function stripVersionPrefix(text: string): string {
  return text.trim().replace(/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\s*[—–\-:]\s*/, "").trim();
}

/** Check whether a line is template noise, footer metadata, or a broken printf placeholder. */
function isIgnoredReleaseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s*what'?s\s+changed$/i.test(trimmed)) return true;
  if (/^-{3,}$/.test(trimmed)) return true;
  if (/^[-*]\s*\*\*(commit|author)\*\*\s*:/i.test(trimmed)) return true;
  const unformatted = trimmed.replace(/[*_`]/g, "").trim();
  if (unformatted === "%s" || unformatted === "") return true;
  return false;
}

function normalizeForDedup(line: string): string {
  return line
    .trim()
    .replace(/^[-*•]\s+/, "")
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Clean a single release's title and body into deduplicated change items without version headers. */
export function extractReleaseHighlights(release: GitHubReleaseItem): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (raw: string) => {
    const cleaned = raw
      .trim()
      .replace(/^[-*•]\s+/, "")
      .replace(/^\*\*(.+)\*\*$/, "$1")
      .trim();
    if (!cleaned || isIgnoredReleaseLine(cleaned)) return;
    const key = normalizeForDedup(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(cleaned);
  };

  if (release.name) {
    const title = stripVersionPrefix(release.name);
    if (title) pushUnique(title);
  }

  if (release.body) {
    for (const line of release.body.split(/\r?\n/)) {
      if (isIgnoredReleaseLine(line)) continue;
      pushUnique(line);
    }
  }

  return items;
}

/** Clean fallback single-release notes (e.g. from latest.json) into readable lines. */
export function cleanSingleChangelog(notes: string): string[] {
  if (!notes.trim()) return [];
  const items: string[] = [];
  const seen = new Set<string>();
  for (const line of notes.split(/\r?\n/)) {
    if (isIgnoredReleaseLine(line)) continue;
    const cleaned = stripVersionPrefix(
      line
        .trim()
        .replace(/^[-*•]\s+/, "")
        .replace(/^\*\*(.+)\*\*$/, "$1")
        .trim(),
    );
    const key = normalizeForDedup(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    items.push(cleaned);
  }
  return items;
}

/**
 * Merge release highlights across all versions in `(currentVersion, latestVersion]`
 * into a flat deduplicated list without per-version headings.
 */
export function mergeReleaseNotesBetween(
  releases: GitHubReleaseItem[],
  currentVersion: string,
  latestVersion: string,
  fallbackNotes = "",
): string[] {
  const inRange = releases
    .filter((r) => !r.draft && !r.prerelease && Boolean(r.tag_name))
    .filter((r) => {
      const tag = r.tag_name.trim();
      return compareSemVer(tag, currentVersion) > 0 && compareSemVer(tag, latestVersion) <= 0;
    })
    .sort((a, b) => compareSemVer(b.tag_name, a.tag_name));

  const merged: string[] = [];
  const seen = new Set<string>();

  for (const rel of inRange) {
    for (const item of extractReleaseHighlights(rel)) {
      const key = normalizeForDedup(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  if (merged.length > 0) return merged;
  return cleanSingleChangelog(fallbackNotes);
}

/** Fetch recent GitHub releases with a short timeout and merge notes between versions. */
export async function fetchMergedReleaseNotes(
  currentVersion: string,
  latestVersion: string,
  fallbackNotes = "",
  options?: {
    fetchReleasesFn?: () => Promise<GitHubReleaseItem[]>;
    timeoutMs?: number;
  },
): Promise<string[]> {
  try {
    if (options?.fetchReleasesFn) {
      const list = await options.fetchReleasesFn();
      return mergeReleaseNotesBetween(list, currentVersion, latestVersion, fallbackNotes);
    }

    const timeoutMs = options?.timeoutMs ?? 5000;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const res = await fetch(GITHUB_RELEASES_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller?.signal,
      });
      if (!res.ok) {
        return cleanSingleChangelog(fallbackNotes);
      }
      const data = (await res.json()) as GitHubReleaseItem[];
      if (!Array.isArray(data)) {
        return cleanSingleChangelog(fallbackNotes);
      }
      return mergeReleaseNotesBetween(data, currentVersion, latestVersion, fallbackNotes);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return cleanSingleChangelog(fallbackNotes);
  }
}
