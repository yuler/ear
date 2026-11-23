import type { MirrorApiClient } from "./client";
import { SINGLE_FILE_MAX_BYTES, type MirrorFileStore } from "./storage";
import type { LocalItemRecord, PairedMac, RemoteCatalogItem } from "./types";

export interface TransferContext {
  client: MirrorApiClient;
  files: MirrorFileStore;
  chunkSize: number;
  remote: RemoteCatalogItem;
  mac: PairedMac;
  existing: LocalItemRecord | undefined;
  signal: AbortSignal;
  onProgress: (record: LocalItemRecord) => void;
  onStorageError: (message: string) => void;
}

/**
 * Download media (via HTTP Range chunks, resuming from completedChunks) and captions
 * to sandboxed local storage. Returns the completed `ready` record, or `null` if aborted
 * or paused due to a storage write error.
 */
export async function transferVideoToLocal(
  ctx: TransferContext,
): Promise<LocalItemRecord | null> {
  const { remote, mac, chunkSize, existing, signal } = ctx;
  const videoId = remote.videoId;
  const totalBytes = Math.max(0, remote.sizeBytes);
  const totalChunks = totalBytes === 0 ? 0 : Math.ceil(totalBytes / chunkSize);
  const reusable =
    existing &&
    existing.state === "partial" &&
    existing.sizeBytes === totalBytes &&
    existing.chunkSize === chunkSize;

  let completedChunks = reusable ? existing.completedChunks : 0;
  let downloadedBytes = reusable ? existing.downloadedBytes : 0;
  let localPath = reusable ? existing.localPath : null;
  let captionsPath = reusable ? existing.captionsPath : null;

  const makeRecord = (state: LocalItemRecord["state"]): LocalItemRecord => ({
    videoId,
    state,
    title: remote.title,
    thumbnailUrl: remote.thumbnailUrl,
    durationMs: remote.durationMs,
    sizeBytes: totalBytes,
    downloadedBytes,
    chunkSize,
    completedChunks,
    totalChunks,
    mediaExt: remote.mediaExt,
    mimeType: remote.mimeType,
    hasCaptions: remote.hasCaptions,
    localPath,
    captionsPath,
    sourceMacId: mac.id,
    sourceShortName: mac.shortName,
    updatedAt: remote.updatedAt,
  });

  ctx.onProgress(makeRecord("partial"));

  if (totalBytes <= SINGLE_FILE_MAX_BYTES && totalBytes > 0 && completedChunks === 0) {
    const bytes = await ctx.client.fetchMediaRange(mac, videoId, 0, totalBytes - 1, signal);
    if (signal.aborted) return null;
    try {
      localPath = await ctx.files.writeDirectMedia(videoId, remote.mediaExt, bytes);
    } catch (err) {
      ctx.onStorageError(err instanceof Error ? err.message : "Storage write failed");
      return null;
    }
    completedChunks = totalChunks;
    downloadedBytes = totalBytes;
    ctx.onProgress(makeRecord("partial"));
  } else {
    while (completedChunks < totalChunks) {
      if (signal.aborted) return null;
      const start = completedChunks * chunkSize;
      const end = Math.min(totalBytes - 1, start + chunkSize - 1);
      const chunk = await ctx.client.fetchMediaRange(mac, videoId, start, end, signal);
      if (signal.aborted) return null;
      try {
        localPath = await ctx.files.writeChunk(videoId, completedChunks, chunk);
      } catch (err) {
        ctx.onStorageError(err instanceof Error ? err.message : "Storage write failed");
        return null;
      }
      completedChunks += 1;
      downloadedBytes = Math.min(totalBytes, downloadedBytes + chunk.byteLength);
      ctx.onProgress(makeRecord("partial"));
    }
  }

  if (remote.hasCaptions && !captionsPath) {
    const capJson = await ctx.client.fetchCaptions(mac, videoId, signal);
    if (signal.aborted) return null;
    if (capJson) {
      try {
        captionsPath = await ctx.files.writeCaptions(videoId, capJson);
      } catch (err) {
        ctx.onStorageError(err instanceof Error ? err.message : "Storage write failed");
        return null;
      }
    }
  }

  if (signal.aborted) return null;
  downloadedBytes = totalBytes;
  const ready = makeRecord("ready");
  ctx.onProgress(ready);
  return ready;
}
