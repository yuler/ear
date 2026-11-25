export const MAX_CONSECUTIVE_TRANSFER_FAILURES = 5;
export const RETRY_BASE_DELAY_MS = 2_000;
export const RETRY_MAX_DELAY_MS = 60_000;

interface ItemBackoffState {
  attempts: number;
  nextRetryAt: number;
}

export interface BackoffClock {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel: (handle: ReturnType<typeof setTimeout>) => void;
}

/** Bounded per-item exponential backoff tracker for transient/persistent transfer failures. */
export class TransferBackoffTracker {
  private readonly states = new Map<string, ItemBackoffState>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly clock: BackoffClock) {}

  canSchedule(videoId: string): boolean {
    const state = this.states.get(videoId);
    return !state || state.nextRetryAt <= this.clock.now();
  }

  recordFailure(videoId: string, onDue: () => void): void {
    const prev = this.states.get(videoId)?.attempts ?? 0;
    const attempts = prev + 1;
    this.cancelTimer(videoId);

    if (attempts >= MAX_CONSECUTIVE_TRANSFER_FAILURES) {
      this.states.set(videoId, { attempts, nextRetryAt: Number.POSITIVE_INFINITY });
      return;
    }

    const delayMs = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempts - 1));
    this.states.set(videoId, { attempts, nextRetryAt: this.clock.now() + delayMs });
    const handle = this.clock.schedule(() => {
      this.timers.delete(videoId);
      onDue();
    }, delayMs);
    this.timers.set(videoId, handle);
  }

  clear(videoId: string): void {
    this.states.delete(videoId);
    this.cancelTimer(videoId);
  }

  clearAllTimers(): void {
    for (const handle of this.timers.values()) {
      this.clock.cancel(handle);
    }
    this.timers.clear();
  }

  private cancelTimer(videoId: string): void {
    const existing = this.timers.get(videoId);
    if (existing !== undefined) {
      this.clock.cancel(existing);
      this.timers.delete(videoId);
    }
  }
}
