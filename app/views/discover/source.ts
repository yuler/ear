import { signal } from "nsh";
import { earBinaryCandidates, spawnEar } from "../../youtube/earClient";
import type {
  ContentFormat,
  DiscoverFilterState,
  DiscoverItem,
  DiscoverLanguage,
  DiscoverLevel,
  DurationTier,
} from "./types";

export type RawDiscoverCliItem = {
  videoId: string;
  title: string;
  author?: string | null;
  durationMs: number;
  language: DiscoverLanguage;
  level: DiscoverLevel;
  tags?: string[];
  description?: string | null;
  durationTier: DurationTier;
  thumbnailUrl: string;
};

export type DiscoverCliResult = {
  type: "result";
  schemaVersion: number;
  updatedAt: string;
  fromCache: boolean;
  items: RawDiscoverCliItem[];
};

export function toDiscoverItem(raw: RawDiscoverCliItem): DiscoverItem {
  const format: ContentFormat = raw.language === "ja" ? "ja-ja" : "en-en";
  const formatLabel = raw.language === "ja" ? "日日结合" : "英英结合";
  const levelLabel = `${raw.level} · ${raw.language === "ja" ? "JLPT" : "CEFR"}`;

  return {
    id: raw.videoId,
    videoId: raw.videoId,
    url: `https://www.youtube.com/watch?v=${raw.videoId}`,
    title: raw.title,
    author: raw.author ?? "",
    language: raw.language,
    level: raw.level,
    levelLabel,
    durationTier: raw.durationTier,
    durationMs: raw.durationMs,
    format,
    formatLabel,
    thumbnailUrl:
      raw.thumbnailUrl ||
      `https://i.ytimg.com/vi/${raw.videoId}/hqdefault.jpg`,
    description: raw.description ?? "",
    tags: raw.tags ?? [],
  };
}

export function filterDiscoverItems(
  items: DiscoverItem[],
  f: DiscoverFilterState,
): DiscoverItem[] {
  const query = f.searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    // 1. Language filter
    if (f.language !== "all" && item.language !== f.language) {
      return false;
    }

    // 2. Level filter
    if (f.level !== "all" && item.level !== f.level) {
      return false;
    }

    // 3. Duration tier filter
    if (f.durationTier !== "all" && item.durationTier !== f.durationTier) {
      return false;
    }

    // 4. Tag filter
    if (f.tag !== null && !item.tags.includes(f.tag)) {
      return false;
    }

    // 5. Search query
    if (query) {
      const titleMatch = item.title.toLowerCase().includes(query);
      const authorMatch = (item.author ?? "").toLowerCase().includes(query);
      const tagMatch = item.tags.some((t) => t.toLowerCase().includes(query));
      const descMatch = (item.description ?? "").toLowerCase().includes(query);
      if (!titleMatch && !authorMatch && !tagMatch && !descMatch) {
        return false;
      }
    }

    return true;
  });
}

export async function fetchDiscoverItems(options?: {
  refresh?: boolean;
}): Promise<{
  items: DiscoverItem[];
  updatedAt: string;
  fromCache: boolean;
}> {
  const bins = earBinaryCandidates();
  let lastErr = "ear binary not available";

  const args = ["discover"];
  if (options?.refresh) {
    args.push("--refresh");
  }

  for (const bin of bins) {
    try {
      return await new Promise((resolve, reject) => {
        let result: DiscoverCliResult | null = null;
        let errMsg: string | null = null;

        const child = spawnEar(bin, args);
        if (!child) {
          reject(
            new Error("process.spawn not supported in current environment"),
          );
          return;
        }

        child.on("stdout", (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const msg = JSON.parse(trimmed) as {
              type?: string;
              message?: string;
              schemaVersion?: number;
              updatedAt?: string;
              fromCache?: boolean;
              items?: RawDiscoverCliItem[];
            };
            if (msg.type === "result" && Array.isArray(msg.items)) {
              result = msg as DiscoverCliResult;
            } else if (msg.type === "error") {
              errMsg = msg.message ?? "Unknown error from ear discover";
            }
          } catch {
            // Ignore non-json lines
          }
        });

        child.on("stderr", (line: string) => {
          const trimmed = line.trim();
          if (trimmed && !errMsg) {
            errMsg = trimmed;
          }
        });

        child.on("error", (err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });

        child.on("close", (code: number) => {
          if (result) {
            const items = (result as DiscoverCliResult).items.map(toDiscoverItem);
            resolve({
              items,
              updatedAt: (result as DiscoverCliResult).updatedAt,
              fromCache: (result as DiscoverCliResult).fromCache,
            });
            return;
          }
          reject(
            new Error(
              errMsg ?? `ear discover failed with exit code ${code}`,
            ),
          );
        });
      });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  // Fallback: If CLI spawn is unsupported or unavailable (e.g. web target / dev host),
  // fetch directly from GitHub Raw API
  try {
    return await fetchDiscoverFromHttp();
  } catch (httpErr) {
    const httpMsg = httpErr instanceof Error ? httpErr.message : String(httpErr);
    throw new Error(`${lastErr}; HTTP fallback failed: ${httpMsg}`);
  }
}

const DEFAULT_DISCOVER_URL =
  "https://raw.githubusercontent.com/yuler/ear/main/api/discover/";

async function fetchDiscoverFromHttp(): Promise<{
  items: DiscoverItem[];
  updatedAt: string;
  fromCache: boolean;
}> {
  const baseUrl = DEFAULT_DISCOVER_URL;
  const indexRes = await fetch(`${baseUrl}index.json`);
  if (!indexRes.ok) {
    throw new Error(`Failed to fetch discover index: HTTP ${indexRes.status}`);
  }
  const index = (await indexRes.json()) as {
    schemaVersion: number;
    updatedAt: string;
    files: string[];
  };

  const allItems: DiscoverItem[] = [];

  for (const file of index.files) {
    try {
      const fileRes = await fetch(`${baseUrl}${file}`);
      if (!fileRes.ok) continue;
      const fileData = (await fileRes.json()) as {
        items: RawDiscoverCliItem[];
      };
      for (const raw of fileData.items) {
        if (!raw.durationTier) {
          const minutes = raw.durationMs / (60 * 1000);
          raw.durationTier =
            minutes < 7 ? 5 : minutes < 15 ? 10 : minutes < 25 ? 20 : 30;
        }
        allItems.push(toDiscoverItem(raw));
      }
    } catch {
      // Continue with remaining files
    }
  }

  return {
    items: allItems,
    updatedAt: index.updatedAt,
    fromCache: false,
  };
}

export const discoverItems = signal<DiscoverItem[]>([]);
export const isDiscoverLoading = signal<boolean>(false);
export const discoverError = signal<string | null>(null);
export const discoverUpdatedAt = signal<string | null>(null);
export const discoverFromCache = signal<boolean>(false);

export async function loadDiscover(options?: {
  refresh?: boolean;
}): Promise<DiscoverItem[]> {
  isDiscoverLoading.set(true);
  discoverError.set(null);

  try {
    const res = await fetchDiscoverItems(options);
    discoverItems.set(res.items);
    discoverUpdatedAt.set(res.updatedAt);
    discoverFromCache.set(res.fromCache);
    return res.items;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    discoverError.set(message);
    return [];
  } finally {
    isDiscoverLoading.set(false);
  }
}
