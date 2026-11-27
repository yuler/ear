import type {
  LocalItemRecord,
  MirrorItemStatus,
  MirrorItemView,
  MirrorSourceRef,
  PairedMac,
  RemoteCatalogItem,
  SyncStats,
} from "./types";
import { hasOwn } from "./validation";

export interface LibraryProjectionInput {
  macs: PairedMac[];
  onlineMacIds: string[];
  pausedInBackground: boolean;
  catalogs: Record<string, RemoteCatalogItem[]>;
  localItems: Record<string, LocalItemRecord>;
  activeVideoIds: string[];
  priorityQueue: string[];
}

export function isChunkedLocalPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path.includes("/chunks/") || path.endsWith(".part");
}

export interface OfflineStorageSummary {
  readyCount: number;
  totalBytes: number;
  chunkedCount: number;
}

export function computeOfflineStorageSummary(
  localItems: Record<string, LocalItemRecord>,
): OfflineStorageSummary {
  let readyCount = 0;
  let totalBytes = 0;
  let chunkedCount = 0;
  for (const rec of Object.values(localItems)) {
    if (rec.state !== "ready") continue;
    readyCount += 1;
    totalBytes += Math.max(0, rec.sizeBytes || rec.downloadedBytes || 0);
    if (isChunkedLocalPath(rec.localPath)) chunkedCount += 1;
  }
  return { readyCount, totalBytes, chunkedCount };
}

export function sourcesForVideo(
  videoId: string,
  macs: PairedMac[],
  onlineMacIds: string[],
  pausedInBackground: boolean,
  catalogs: Record<string, RemoteCatalogItem[]>,
): MirrorSourceRef[] {
  const onlineSet = new Set(onlineMacIds);
  const out: MirrorSourceRef[] = [];
  for (const m of macs) {
    const list = catalogs[m.id] ?? [];
    if (list.some((item) => item.videoId === videoId)) {
      out.push({
        id: m.id,
        name: m.name,
        shortName: m.shortName,
        online: onlineSet.has(m.id) && !pausedInBackground,
      });
    }
  }
  return out;
}

export function catalogMetaForVideo(
  videoId: string,
  macs: PairedMac[],
  catalogs: Record<string, RemoteCatalogItem[]>,
): RemoteCatalogItem | null {
  for (const m of macs) {
    const found = (catalogs[m.id] ?? []).find((x) => x.videoId === videoId);
    if (found) return found;
  }
  return null;
}

/** Merge catalogs from all paired computers + local offline copies into one deduplicated library. */
export function buildLibraryView(input: LibraryProjectionInput): MirrorItemView[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const m of input.macs) {
    for (const item of input.catalogs[m.id] ?? []) {
      if (!seen.has(item.videoId)) {
        seen.add(item.videoId);
        ids.push(item.videoId);
      }
    }
  }
  for (const [vid, rec] of Object.entries(input.localItems)) {
    if (rec.state === "ready" && !seen.has(vid)) {
      seen.add(vid);
      ids.push(vid);
    }
  }

  const activeSet = new Set(input.activeVideoIds);
  const prioSet = new Set(input.priorityQueue);
  const views: MirrorItemView[] = [];

  for (const videoId of ids) {
    const rec = hasOwn(input.localItems, videoId) ? input.localItems[videoId] : undefined;
    const remote = catalogMetaForVideo(videoId, input.macs, input.catalogs);
    const sources = sourcesForVideo(
      videoId,
      input.macs,
      input.onlineMacIds,
      input.pausedInBackground,
      input.catalogs,
    );
    const anyOnline = sources.some((s) => s.online);

    let status: MirrorItemStatus;
    if (rec?.state === "removed") {
      status = "removed";
    } else if (rec?.state === "ready") {
      status = "ready";
    } else if (activeSet.has(videoId)) {
      status = "syncing";
    } else {
      status = anyOnline ? "queued" : "away";
    }

    const sizeBytes = remote?.sizeBytes ?? rec?.sizeBytes ?? 0;
    const downloadedBytes =
      status === "ready" ? sizeBytes : Math.min(sizeBytes, rec?.downloadedBytes ?? 0);
    const progress =
      status === "ready"
        ? 1
        : sizeBytes > 0
          ? Math.min(0.99, downloadedBytes / sizeBytes)
          : 0;

    views.push({
      videoId,
      title: remote?.title ?? rec?.title ?? videoId,
      thumbnailUrl: remote?.thumbnailUrl ?? rec?.thumbnailUrl ?? "",
      durationMs: remote?.durationMs ?? rec?.durationMs ?? null,
      sizeBytes,
      contentSha256: rec?.contentSha256 ?? remote?.contentSha256,
      downloadedBytes,
      progress,
      status,
      priority: prioSet.has(videoId),
      hasCaptions: remote?.hasCaptions ?? rec?.hasCaptions ?? false,
      mediaExt: remote?.mediaExt ?? rec?.mediaExt ?? "mp4",
      mimeType: rec?.mimeType ?? remote?.mimeType ?? "video/mp4",
      localPath: rec?.localPath ?? null,
      captionsPath: rec?.captionsPath ?? null,
      completedChunks: rec?.completedChunks ?? 0,
      totalChunks: rec?.totalChunks ?? 0,
      isChunkedUnmerged: status === "ready" && isChunkedLocalPath(rec?.localPath),
      sources,
      fallbackSourceShortName: rec?.sourceShortName ?? sources[0]?.shortName ?? null,
      updatedAt: remote?.updatedAt ?? rec?.updatedAt ?? 0,
    });
  }

  return views.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function computeSyncStats(lib: MirrorItemView[]): SyncStats {
  let ready = 0;
  let syncing = 0;
  let queued = 0;
  let away = 0;
  let removed = 0;

  for (const item of lib) {
    if (item.status === "ready") ready++;
    else if (item.status === "syncing") syncing++;
    else if (item.status === "queued") queued++;
    else if (item.status === "away") away++;
    else if (item.status === "removed") removed++;
  }

  const reachableItems = lib.filter(
    (x) => x.status !== "removed" && x.status !== "away",
  );
  const overallProgress =
    reachableItems.length === 0
      ? 1
      : reachableItems.reduce(
          (sum, x) => sum + (x.status === "ready" ? 1 : x.progress),
          0,
        ) / reachableItems.length;

  return {
    ready,
    syncing,
    queued,
    away,
    removed,
    reachableWanted: reachableItems.length,
    overallProgress,
    complete: syncing === 0 && queued === 0,
  };
}

export function computeMacSyncCounts(
  macId: string,
  catalogs: Record<string, RemoteCatalogItem[]>,
  localItems: Record<string, LocalItemRecord>,
): { done: number; total: number } {
  const list = hasOwn(catalogs, macId) ? (catalogs[macId] ?? []) : [];
  const wanted = list.filter(
    (x) => !(hasOwn(localItems, x.videoId) && localItems[x.videoId]?.state === "removed"),
  );
  const done = wanted.filter(
    (x) => hasOwn(localItems, x.videoId) && localItems[x.videoId]?.state === "ready",
  ).length;
  return { done, total: wanted.length };
}
