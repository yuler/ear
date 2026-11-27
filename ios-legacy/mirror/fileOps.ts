import type { MirrorFileStore } from "./storage";

/**
 * Coordinates per-video serialized file mutations (writes and directory removals)
 * so an aborted transfer or async cleanup can never overlap with a replacement transfer.
 */
export class VideoFileCoordinator {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly files: MirrorFileStore,
    private readonly onIdle: (videoId: string) => void,
  ) {}

  hasPending(videoId: string): boolean {
    return this.pending.has(videoId);
  }

  private enqueue<T>(videoId: string, op: () => Promise<T>): Promise<T> {
    const prev = this.pending.get(videoId) ?? Promise.resolve();
    const result = prev.then(() => op());
    const tracked = result
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        if (this.pending.get(videoId) === tracked) {
          this.pending.delete(videoId);
          this.onIdle(videoId);
        }
      });
    this.pending.set(videoId, tracked);
    return result;
  }

  removeVideoFiles(videoId: string): Promise<void> {
    return this.enqueue(videoId, () => this.files.removeVideoFiles(videoId).catch(() => {}));
  }

  /**
   * Create a `MirrorFileStore` scoped to a single transfer attempt.
   * - Writes are skipped if the transfer is no longer the active owner.
   * - Directory removal is gated on ownership when requested, then serialized
   *   in the same per-video queue so replacement transfers wait until it settles.
   */
  forTransfer(videoId: string, isOwner: () => boolean): MirrorFileStore {
    const write = <T>(fn: () => Promise<T>, abortedValue: T): Promise<T> => {
      if (!isOwner()) return Promise.resolve(abortedValue);
      return this.enqueue(videoId, async () => {
        if (!isOwner()) return abortedValue;
        return fn();
      });
    };
    return {
      writeChunk: (vid, idx, bytes) => write(() => this.files.writeChunk(vid, idx, bytes), ""),
      readChunk: this.files.readChunk
        ? (vid, idx) => this.files.readChunk!(vid, idx)
        : undefined,
      assembleChunks: this.files.assembleChunks
        ? (vid, ext, count) => write(() => this.files.assembleChunks!(vid, ext, count), "")
        : undefined,
      writeDirectMedia: (vid, ext, bytes) =>
        write(() => this.files.writeDirectMedia(vid, ext, bytes), ""),
      writeCaptions: (vid, json) => write(() => this.files.writeCaptions(vid, json), ""),
      removeVideoFiles: (vid) => {
        if (!isOwner()) return Promise.resolve();
        return this.removeVideoFiles(vid);
      },
    };
  }
}
