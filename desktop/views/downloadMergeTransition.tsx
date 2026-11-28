import { cleanup, effect, Image, LayoutAnimation, signal, View, type ViewRef } from "nsh";
import {
  captureElementRect,
  type ViewNodeMeasureTarget,
  type ViewTransitionRect,
} from "./viewTransition";

/** Brief confirmation hold at 100% ✓ before launching the merge flight. */
export const MERGE_DONE_HOLD_MS = 260;

/** Minimum gap between simultaneous download completions launching flights. */
export const MERGE_STAGGER_MS = 120;

/** Shared-element flight duration from download row thumbnail to Library card poster. */
export const MERGE_FLIGHT_MS = 380;

/** Cross-fade duration when the flying poster hands off to the settled Library card. */
export const MERGE_SETTLE_FADE_MS = 120;

/** Soft brand highlight duration on the newly landed Library card. */
export const MERGE_GLOW_MS = 450;

/** Synchronized layout animation duration for download section collapse & grid reflow. */
export const MERGE_LAYOUT_MS = 360;

export type MergeFlightPhase = "origin" | "flying" | "settling";

export type CardMergePhase = "flying" | "landing" | null;

export interface DownloadMergeFlight {
  videoId: string;
  thumbnailUrl: string;
  origin: ViewTransitionRect;
  target: ViewTransitionRect;
  phase: MergeFlightPhase;
}

/**
 * Configure the native layout animation immediately before committing the
 * synchronous task-remove + library-entry-insert swap (with no `await` in between).
 */
export function configureMergeLayoutAnimation(): void {
  try {
    if (typeof LayoutAnimation.configureNext === "function") {
      LayoutAnimation.configureNext({
        duration: MERGE_LAYOUT_MS,
        create: { type: "easeOut", property: "opacity" },
        update: { type: "spring", springDamping: 0.88 },
        delete: { type: "easeOut", property: "opacity" },
      });
      return;
    }
    LayoutAnimation.easeInEaseOut();
  } catch {
    // ignore on test host
  }
}

/**
 * Check whether a measured rect overlaps the visible viewport vertically,
 * so off-screen items skip the floating flight and merge silently.
 */
export function isRectVisibleInViewport(
  rect: ViewTransitionRect | null | undefined,
  viewportHeight?: number,
): boolean {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const g =
    typeof globalThis !== "undefined"
      ? (globalThis as { innerHeight?: number })
      : null;
  const vh = viewportHeight ?? g?.innerHeight ?? 800;
  return rect.y + rect.height > 0 && rect.y < vh;
}

/**
 * Stagger scheduler so multiple downloads completing simultaneously launch
 * their merge flights sequentially by `staggerMs` instead of overlapping.
 */
export function createStaggerScheduler(staggerMs = MERGE_STAGGER_MS) {
  let nextAvailableAt = 0;
  return {
    reserveDelayMs(now = Date.now()): number {
      if (now >= nextAvailableAt) {
        nextAvailableAt = now + staggerMs;
        return 0;
      }
      const wait = nextAvailableAt - now;
      nextAvailableAt += staggerMs;
      return wait;
    },
    reset(): void {
      nextAvailableAt = 0;
    },
  };
}

/**
 * Style for the floating shared-element thumbnail overlay during a download-to-Library merge:
 * - `origin`: snapped to the download row thumbnail with no transition.
 * - `flying`: smoothly interpolates bounds & radius to the Library card poster (380ms).
 * - `settling`: holds at target bounds and dissolves opacity 1 -> 0 (120ms) over the real card.
 */
export function getDownloadMergeFlightStyle(flight: DownloadMergeFlight) {
  const atTarget = flight.phase === "flying" || flight.phase === "settling";
  const rect = atTarget ? flight.target : flight.origin;

  let transitionProperty = "none";
  let transitionDuration: `${number}ms` = `${MERGE_FLIGHT_MS}ms`;
  let transitionTimingFunction:
    | "ease-out"
    | "cubic-bezier(0.22, 1, 0.36, 1)" = "cubic-bezier(0.22, 1, 0.36, 1)";

  if (flight.phase === "flying") {
    transitionProperty = "all";
    transitionDuration = `${MERGE_FLIGHT_MS}ms`;
  } else if (flight.phase === "settling") {
    transitionProperty = "opacity";
    transitionDuration = `${MERGE_SETTLE_FADE_MS}ms`;
    transitionTimingFunction = "ease-out";
  }

  return {
    position: "fixed" as const,
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    borderRadius: rect.borderRadius ?? 8,
    opacity: flight.phase === "settling" ? 0 : 1,
    zIndex: 60,
    pointerEvents: "none" as const,
    overflow: "hidden" as const,
    transitionProperty,
    transitionDuration,
    transitionTimingFunction,
    boxShadow:
      flight.phase === "flying"
        ? "0 14px 28px -8px rgba(0, 0, 0, 0.42)"
        : flight.phase === "origin"
          ? "0 4px 12px -2px rgba(0, 0, 0, 0.22)"
          : "none",
  };
}

/**
 * Coordinates shared-element flights from ActiveDownloadRow thumbnails into
 * newly inserted LibraryCard poster slots, with viewport degradation and cleanup.
 */
export function createDownloadMergeCoordinator(opts: {
  entries: () => readonly { videoId: string }[];
  isDisabled?: () => boolean;
  posterRadius?: number;
  registerBeforeMerge?: (
    fn: ((videoId: string, thumbnailUrl: string) => Promise<void>) | null,
  ) => void;
}) {
  const radius = opts.posterRadius ?? 8;
  const downloadThumbRefs = new Map<string, ViewNodeMeasureTarget>();
  const cardPosterRefs = new Map<string, ViewNodeMeasureTarget>();
  const pendingOrigins = new Map<
    string,
    { rect: ViewTransitionRect; thumbnailUrl: string }
  >();
  const flights = signal<DownloadMergeFlight[]>([]);
  const cardMergePhases = signal<Record<string, CardMergePhase>>({});
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let unmounted = false;

  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!unmounted) fn();
    }, ms);
    timers.add(id);
    return id;
  };

  const setCardPhase = (videoId: string, phase: CardMergePhase) => {
    cardMergePhases.update((prev) => {
      const next = { ...prev };
      if (phase === null) delete next[videoId];
      else next[videoId] = phase;
      return next;
    });
  };

  const removeFlight = (videoId: string) => {
    flights.update((list) => list.filter((f) => f.videoId !== videoId));
  };

  const updateFlightPhase = (videoId: string, phase: MergeFlightPhase) => {
    flights.update((list) =>
      list.map((f) => (f.videoId === videoId ? { ...f, phase } : f)),
    );
  };

  const launchFlight = (
    videoId: string,
    origin: ViewTransitionRect,
    thumbnailUrl: string,
  ) => {
    // Wait one frame for the newly mounted LibraryCard to attach its posterRef and settle layout.
    schedule(() => {
      void captureElementRect(
        cardPosterRefs.get(videoId) ?? null,
        radius,
      ).then((target) => {
        if (unmounted) return;
        if (!target || !isRectVisibleInViewport(target)) {
          setCardPhase(videoId, null);
          return;
        }
        flights.update((list) => [
          ...list.filter((f) => f.videoId !== videoId),
          { videoId, thumbnailUrl, origin, target, phase: "origin" },
        ]);
        schedule(() => {
          updateFlightPhase(videoId, "flying");
          schedule(() => {
            updateFlightPhase(videoId, "settling");
            setCardPhase(videoId, "landing");
            schedule(() => removeFlight(videoId), MERGE_SETTLE_FADE_MS);
            schedule(() => setCardPhase(videoId, null), MERGE_GLOW_MS);
          }, MERGE_FLIGHT_MS);
        }, 16);
      });
    }, 16);
  };

  opts.registerBeforeMerge?.(async (videoId, thumbnailUrl) => {
    if (unmounted || opts.isDisabled?.()) return;
    const thumbRef = downloadThumbRefs.get(videoId);
    if (!thumbRef) return;
    const origin = await captureElementRect(thumbRef, radius);
    if (unmounted || !origin || !isRectVisibleInViewport(origin)) return;
    pendingOrigins.set(videoId, { rect: origin, thumbnailUrl });
    setCardPhase(videoId, "flying");
    // Safety cleanup if a search filter or unexpected state prevents the card from appearing.
    schedule(() => {
      if (pendingOrigins.delete(videoId)) {
        setCardPhase(videoId, null);
      }
    }, 240);
  });

  const dispose = () => {
    unmounted = true;
    opts.registerBeforeMerge?.(null);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    pendingOrigins.clear();
    downloadThumbRefs.clear();
    cardPosterRefs.clear();
  };

  cleanup(dispose);

  effect(() => {
    const visible = opts.entries();
    if (pendingOrigins.size === 0) return;
    for (const entry of visible) {
      const pending = pendingOrigins.get(entry.videoId);
      if (!pending) continue;
      pendingOrigins.delete(entry.videoId);
      launchFlight(entry.videoId, pending.rect, pending.thumbnailUrl);
    }
  });

  return {
    flights,
    cardMergePhase: (videoId: string): CardMergePhase =>
      cardMergePhases()[videoId] ?? null,
    setDownloadThumbRef: (videoId: string, node: ViewRef | null) => {
      if (node) downloadThumbRefs.set(videoId, node);
      else downloadThumbRefs.delete(videoId);
    },
    setCardPosterRef: (videoId: string, node: ViewRef | null) => {
      if (node) cardPosterRefs.set(videoId, node);
      else cardPosterRefs.delete(videoId);
    },
    dispose,
  };
}

/** Floating shared-element thumbnail layer rendered above LibraryView during download merges. */
export function DownloadMergeOverlay(props: {
  flights: () => DownloadMergeFlight[];
}) {
  return (
    <If when={props.flights().length > 0}>
      <Each of={props.flights()} key={(flight) => flight.videoId}>
        {(flight) => (
          <View style={getDownloadMergeFlightStyle(flight())}>
            <Image
              src={flight().thumbnailUrl}
              class="h-full w-full object-cover"
            />
          </View>
        )}
      </Each>
    </If>
  );
}
