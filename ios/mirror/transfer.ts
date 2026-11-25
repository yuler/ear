import { MirrorApiError, type MediaRangeOptions, type MirrorApiClient } from "./client";
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
 * Check whether an existing partial download can safely be resumed against `remote` from `mac`.
 * - If `remote.contentSha256` is present, partial chunks are only reusable when the immutable
 *   digest matches (making cross-Mac resume cryptographically safe).
 * - If no digest is available, resume is restricted to the exact same source Mac and revision.
 */
export function isPartialRecordReusable(
  existing: LocalItemRecord | undefined,
  remote: RemoteCatalogItem,
  mac: PairedMac,
  chunkSize: number,
  totalBytes: number,
): existing is LocalItemRecord {
  if (!existing || existing.state !== "partial") return false;
  if (
    existing.sizeBytes !== totalBytes ||
    existing.chunkSize !== chunkSize ||
    existing.mediaExt !== remote.mediaExt ||
    existing.mimeType !== remote.mimeType
  ) {
    return false;
  }
  if (remote.contentSha256) {
    return existing.contentSha256 === remote.contentSha256;
  }
  return (
    !existing.contentSha256 &&
    existing.sourceMacId === mac.id &&
    existing.updatedAt === remote.updatedAt
  );
}

/**
 * Download media (via HTTP Range chunks, resuming from verified completedChunks) and captions
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
  const reusable = isPartialRecordReusable(existing, remote, mac, chunkSize, totalBytes);

  // If incompatible partial chunks exist on disk (e.g. failover to a Mac with different
  // bytes of the same length, or an in-place file replacement), discard them before starting fresh.
  if (existing?.state === "partial" && !reusable) {
    await ctx.files.removeVideoFiles(videoId);
  }

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
    contentSha256: remote.contentSha256,
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

  if (existing?.state === "partial" && !reusable) {
    ctx.onProgress(makeRecord("partial"));
  }

  const rangeOpts: MediaRangeOptions = {
    expectedTotalBytes: totalBytes,
    expectedContentSha256: remote.contentSha256,
  };

  if (totalBytes <= SINGLE_FILE_MAX_BYTES && totalBytes > 0 && completedChunks === 0) {
    const bytes = await ctx.client.fetchMediaRange(
      mac,
      videoId,
      0,
      totalBytes - 1,
      signal,
      rangeOpts,
    );
    if (signal.aborted) return null;
    if (bytes.byteLength !== totalBytes) {
      throw new MirrorApiError(
        "invalid_range_response",
        `Expected ${totalBytes} bytes for media range 0-${totalBytes - 1}, got ${bytes.byteLength}`,
      );
    }
    try {
      localPath = await ctx.files.writeDirectMedia(videoId, remote.mediaExt, bytes);
    } catch (err) {
      ctx.onStorageError(err instanceof Error ? err.message : "Storage write failed");
      return null;
    }
    completedChunks = totalChunks;
    downloadedBytes = bytes.byteLength;
    ctx.onProgress(makeRecord("partial"));
  } else {
    while (completedChunks < totalChunks) {
      if (signal.aborted) return null;
      const start = completedChunks * chunkSize;
      const end = Math.min(totalBytes - 1, start + chunkSize - 1);
      const expectedLen = end - start + 1;
      const chunk = await ctx.client.fetchMediaRange(
        mac,
        videoId,
        start,
        end,
        signal,
        rangeOpts,
      );
      if (signal.aborted) return null;
      if (chunk.byteLength !== expectedLen) {
        throw new MirrorApiError(
          "invalid_range_response",
          `Expected ${expectedLen} bytes for range ${start}-${end}, got ${chunk.byteLength}`,
        );
      }
      try {
        localPath = await ctx.files.writeChunk(videoId, completedChunks, chunk);
      } catch (err) {
        ctx.onStorageError(err instanceof Error ? err.message : "Storage write failed");
        return null;
      }
      completedChunks += 1;
      downloadedBytes += chunk.byteLength;
      ctx.onProgress(makeRecord("partial"));
    }
  }

  if (completedChunks !== totalChunks || downloadedBytes !== totalBytes) {
    throw new MirrorApiError(
      "invalid_range_response",
      `Incomplete transfer: ${downloadedBytes}/${totalBytes} bytes (${completedChunks}/${totalChunks} chunks)`,
    );
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
  const ready = makeRecord("ready");
  ctx.onProgress(ready);
  return ready;
}
