// Projection helpers live in ./selectors.ts; chunked transfer in ./transfer.ts; retry backoff in ./backoff.ts; file-op serialization in ./fileOps.ts.
import { setColorScheme, signal, type Signal } from "nsh";
import { applyAccentTheme } from "./accent";
import {
  MAX_CONSECUTIVE_TRANSFER_FAILURES,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  TransferBackoffTracker,
} from "./backoff";
import {
  createHttpMirrorClient,
  MirrorApiError,
  type MirrorApiClient,
} from "./client";
import { VideoFileCoordinator } from "./fileOps";
import {
  buildLibraryView,
  catalogMetaForVideo,
  computeMacSyncCounts,
  computeSyncStats,
  sourcesForVideo,
} from "./selectors";
import {
  createDiskFileStore,
  DEFAULT_MOBILE_SETTINGS,
  emptyPersistedData,
  loadPersistedData,
  MIRROR_CHUNK_BYTES,
  savePersistedData,
  type MirrorFileStore,
} from "./storage";
import { transferVideoToLocal } from "./transfer";
import { parseHostAndPort } from "./transport";
import { hasOwn, isSafeVideoId } from "./validation";
import type {
  LocalItemRecord,
  MirrorItemView,
  MirrorSettings,
  PairedMac,
  PairPayload,
  PersistedMobileData,
  RemoteCatalogItem,
  SyncStats,
} from "./types";

export const MAX_PARALLEL_TRANSFERS = 3;
export { MAX_CONSECUTIVE_TRANSFER_FAILURES, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS };

export interface EngineNotice {
  kind: "removedByPc" | "storageError" | "paired";
  macName?: string;
  message?: string;
}

export interface MirrorEngineDeps {
  client: MirrorApiClient;
  files: MirrorFileStore;
  loadState: () => Promise<PersistedMobileData>;
  saveState: (data: PersistedMobileData) => Promise<void>;
  chunkBytes?: number;
  deviceName?: string;
  applyColorScheme?: (scheme: MirrorSettings["appearance"]) => void;
  applyAccent?: (accent: MirrorSettings["accent"]) => void;
  now?: () => number;
  scheduleRetry?: (fn: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelRetry?: (handle: ReturnType<typeof setTimeout>) => void;
}

interface ActiveTransfer {
  videoId: string;
  macId: string;
  controller: AbortController;
}

export interface MirrorEngine {
  readonly settings: Signal<MirrorSettings>;
  readonly macs: Signal<PairedMac[]>;
  readonly onlineMacIds: Signal<string[]>;
  readonly localItems: Signal<Record<string, LocalItemRecord>>;
  readonly catalogs: Signal<Record<string, RemoteCatalogItem[]>>;
  readonly activeVideoIds: Signal<string[]>;
  readonly priorityQueue: Signal<string[]>;
  readonly storagePaused: Signal<string | null>;
  readonly lastNotice: Signal<EngineNotice | null>;
  readonly polling: Signal<boolean>;

  hydrate(): Promise<void>;
  updateSettings(patch: Partial<MirrorSettings>): void;
  setAppLifecycle(state: "active" | "inactive" | "background"): void;
  clearNotice(): void;
  resumeAfterStorageError(): void;

  library(): MirrorItemView[];
  stats(): SyncStats;
  macSyncCounts(macId: string): { done: number; total: number };
  isMacOnline(macId: string): boolean;

  pairFromPayload(payload: PairPayload): Promise<{ mac: PairedMac; alreadyPaired: boolean }>;
  pairManual(hostInput: string, code: string): Promise<{ mac: PairedMac; alreadyPaired: boolean }>;
  unpairMac(macId: string, byServer?: boolean): Promise<void>;

  pollAllMacs(): Promise<void>;
  scheduleTransfers(): void;

  deleteLocal(videoId: string): LocalItemRecord | null;
  commitDeleteFiles(videoId: string): Promise<void>;
  restoreLocal(videoId: string, before: LocalItemRecord | null): void;
  mirrorAgain(videoId: string): void;
  prioritize(videoId: string): void;
  stopAllTransfers(): void;
}

export function createMirrorEngine(deps: MirrorEngineDeps): MirrorEngine {
  const chunkSize = deps.chunkBytes ?? MIRROR_CHUNK_BYTES;
  const deviceName = deps.deviceName ?? "iPhone";
  const backoff = new TransferBackoffTracker({
    now: deps.now ?? (() => Date.now()),
    schedule: deps.scheduleRetry ?? ((fn, ms) => setTimeout(fn, ms)),
    cancel: deps.cancelRetry ?? ((h) => clearTimeout(h)),
  });
  const applyScheme =
    deps.applyColorScheme ??
    ((scheme) => {
      try {
        setColorScheme(scheme);
      } catch {
        // ignore outside native host
      }
    });
  const applyAccent = deps.applyAccent ?? applyAccentTheme;

  const settings = signal<MirrorSettings>({ ...DEFAULT_MOBILE_SETTINGS });
  const macs = signal<PairedMac[]>([]);
  const onlineMacIds = signal<string[]>([]);
  const localItems = signal<Record<string, LocalItemRecord>>({});
  const catalogs = signal<Record<string, RemoteCatalogItem[]>>({});
  const activeVideoIds = signal<string[]>([]);
  const priorityQueue = signal<string[]>([]);
  const storagePaused = signal<string | null>(null);
  const lastNotice = signal<EngineNotice | null>(null);
  const polling = signal(false);

  let appState: "active" | "inactive" | "background" = "active";
  const activeTransfers = new Map<string, ActiveTransfer>();
  const fileOps = new VideoFileCoordinator(deps.files, (videoId) => {
    if (!activeTransfers.has(videoId)) scheduleTransfers();
  });

  const persistNow = () => {
    void deps.saveState({
      settings: settings(),
      macs: macs(),
      localItems: localItems(),
      catalogs: catalogs(),
    });
  };

  const pausedInBackground = () => appState === "background" && !settings().backgroundSync;
  const syncActiveIdsSignal = () => activeVideoIds.set([...activeTransfers.keys()]);
  const isMacOnline = (macId: string) => onlineMacIds().includes(macId) && !pausedInBackground();
  const isTransferOwner = (videoId: string, controller: AbortController) =>
    !controller.signal.aborted && activeTransfers.get(videoId)?.controller === controller;
  const removeVideoFilesSerialized = (videoId: string) => fileOps.removeVideoFiles(videoId);

  function dropCatalogItem(macId: string, videoId: string): void {
    const list = catalogs()[macId];
    if (!list || !list.some((x) => x.videoId === videoId)) return;
    catalogs.set({
      ...catalogs(),
      [macId]: list.filter((x) => x.videoId !== videoId),
    });
    persistNow();
  }

  const library = () =>
    buildLibraryView({
      macs: macs(),
      onlineMacIds: onlineMacIds(),
      pausedInBackground: pausedInBackground(),
      catalogs: catalogs(),
      localItems: localItems(),
      activeVideoIds: activeVideoIds(),
      priorityQueue: priorityQueue(),
    });

  const stats = () => computeSyncStats(library());
  const macSyncCounts = (macId: string) => computeMacSyncCounts(macId, catalogs(), localItems());

  function getLocalRecord(videoId: string): LocalItemRecord | undefined {
    const items = localItems();
    return hasOwn(items, videoId) ? items[videoId] : undefined;
  }

  function updateLocalRecord(videoId: string, record: LocalItemRecord | null): void {
    if (!isSafeVideoId(videoId)) return;
    const next = { ...localItems() };
    if (record === null) delete next[videoId];
    else next[videoId] = record;
    localItems.set(next);
    persistNow();
  }

  function abortTransfer(videoId: string): void {
    const active = activeTransfers.get(videoId);
    if (!active) return;
    activeTransfers.delete(videoId);
    syncActiveIdsSignal();
    active.controller.abort();
  }

  function stopAllTransfers(): void {
    backoff.clearAllTimers();
    for (const active of activeTransfers.values()) active.controller.abort();
    activeTransfers.clear();
    syncActiveIdsSignal();
  }

  async function reportMacProgress(mac: PairedMac): Promise<void> {
    const { done, total } = macSyncCounts(mac.id);
    await deps.client.reportStatus(mac, done, total, appState === "background");
  }

  async function runTransfer(videoId: string, mac: PairedMac, controller: AbortController): Promise<void> {
    const remote = (catalogs()[mac.id] ?? []).find((x) => x.videoId === videoId);
    if (!remote) {
      if (activeTransfers.get(videoId)?.controller === controller) {
        activeTransfers.delete(videoId);
        syncActiveIdsSignal();
      }
      return;
    }

    const owns = () => isTransferOwner(videoId, controller);
    try {
      const done = await transferVideoToLocal({
        client: deps.client,
        files: fileOps.forTransfer(videoId, owns),
        chunkSize,
        remote,
        mac,
        existing: getLocalRecord(videoId),
        signal: controller.signal,
        onProgress: (rec) => {
          if (!owns()) return;
          updateLocalRecord(videoId, rec);
        },
        onStorageError: (msg) => {
          if (!owns()) return;
          storagePaused.set(msg);
          lastNotice.set({ kind: "storageError", message: msg });
          stopAllTransfers();
        },
      });
      if (done && owns()) {
        backoff.clear(videoId);
        priorityQueue.set(priorityQueue().filter((id) => id !== videoId));
        void reportMacProgress(mac);
      }
    } catch (err) {
      if (!owns()) return;
      if (err instanceof MirrorApiError && err.code === "unpaired") {
        void unpairMac(mac.id, true);
        return;
      }
      if (err instanceof MirrorApiError && err.code === "unreachable") {
        onlineMacIds.set(onlineMacIds().filter((id) => id !== mac.id));
        return;
      }
      if (err instanceof MirrorApiError && err.status === 404) {
        // Evict stale catalog entry and clear/remove stale partial files BEFORE releasing the slot.
        dropCatalogItem(mac.id, videoId);
        const cur = getLocalRecord(videoId);
        if (cur?.state === "partial" && cur.sourceMacId === mac.id) {
          updateLocalRecord(videoId, null);
          await removeVideoFilesSerialized(videoId);
        }
        return;
      }
      if (err instanceof MirrorApiError && err.code === "representation_changed") {
        // Clear and remove stale partial files BEFORE releasing the slot and applying backoff.
        if (getLocalRecord(videoId)?.state === "partial") {
          updateLocalRecord(videoId, null);
          await removeVideoFilesSerialized(videoId);
        }
        if (owns()) backoff.recordFailure(videoId, scheduleTransfers);
        return;
      }
      backoff.recordFailure(videoId, scheduleTransfers);
    } finally {
      if (activeTransfers.get(videoId)?.controller === controller) {
        activeTransfers.delete(videoId);
        syncActiveIdsSignal();
        scheduleTransfers();
      }
    }
  }

  function scheduleTransfers(): void {
    if (pausedInBackground() || storagePaused()) return;

    for (const [vid, active] of [...activeTransfers.entries()]) {
      if (!isMacOnline(active.macId)) abortTransfer(vid);
    }

    const prioIndex = new Map(priorityQueue().map((id, i) => [id, i]));
    const candidates = library()
      .filter(
        (item) =>
          item.status === "queued" &&
          !fileOps.hasPending(item.videoId) &&
          backoff.canSchedule(item.videoId),
      )
      .sort((a, b) => {
        const ai = prioIndex.get(a.videoId);
        const bi = prioIndex.get(b.videoId);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return b.updatedAt - a.updatedAt;
      });

    for (const item of candidates) {
      if (activeTransfers.has(item.videoId) || fileOps.hasPending(item.videoId)) continue;
      if (activeTransfers.size >= MAX_PARALLEL_TRANSFERS) {
        if (!item.priority) break;
        const victim = [...activeTransfers.values()].find((a) => !prioIndex.has(a.videoId));
        if (!victim) break;
        abortTransfer(victim.videoId);
      }

      const sourceRef = item.sources.find((s) => s.online);
      const mac = sourceRef ? macs().find((m) => m.id === sourceRef.id) : undefined;
      if (!mac) continue;

      const controller = new AbortController();
      activeTransfers.set(item.videoId, { videoId: item.videoId, macId: mac.id, controller });
      syncActiveIdsSignal();
      void runTransfer(item.videoId, mac, controller);
    }
  }

  async function pollAllMacs(): Promise<void> {
    if (pausedInBackground()) return;
    const currentMacs = macs();
    if (currentMacs.length === 0) {
      onlineMacIds.set([]);
      return;
    }

    polling.set(true);
    try {
      const results = await Promise.allSettled(
        currentMacs.map(async (mac) => ({ mac, cat: await deps.client.fetchLibrary(mac) })),
      );

      const liveMacIds = new Set(macs().map((m) => m.id));
      const prevCatalogs = catalogs();
      const nextOnline: string[] = [];
      const nextCatalogs: Record<string, RemoteCatalogItem[]> = {};
      for (const [id, list] of Object.entries(prevCatalogs)) {
        if (liveMacIds.has(id)) nextCatalogs[id] = list;
      }
      const revokedIds: string[] = [];

      results.forEach((res, idx) => {
        const mac = currentMacs[idx]!;
        if (!liveMacIds.has(mac.id)) return;
        if (res.status === "fulfilled") {
          nextOnline.push(mac.id);
          const prevById = new Map((prevCatalogs[mac.id] ?? []).map((it) => [it.videoId, it]));
          for (const item of res.value.cat.items) {
            const old = prevById.get(item.videoId);
            if (
              old &&
              (old.sizeBytes !== item.sizeBytes ||
                old.updatedAt !== item.updatedAt ||
                old.contentSha256 !== item.contentSha256)
            ) {
              backoff.clear(item.videoId);
            }
          }
          nextCatalogs[mac.id] = res.value.cat.items;
          void reportMacProgress(mac);
        } else if (res.reason instanceof MirrorApiError && res.reason.code === "unpaired") {
          revokedIds.push(mac.id);
        }
      });

      catalogs.set(nextCatalogs);
      onlineMacIds.set(nextOnline);
      persistNow();

      for (const id of revokedIds) await unpairMac(id, true);
      scheduleTransfers();
    } finally {
      polling.set(false);
    }
  }

  async function hydrate(): Promise<void> {
    const data = await deps.loadState();
    settings.set(data.settings);
    macs.set(data.macs);
    localItems.set(data.localItems);
    catalogs.set(data.catalogs);
    applyScheme(data.settings.appearance);
    applyAccent(data.settings.accent);
  }

  function updateSettings(patch: Partial<MirrorSettings>): void {
    const next = { ...settings(), ...patch };
    settings.set(next);
    if (patch.appearance) applyScheme(patch.appearance);
    if (patch.accent) applyAccent(patch.accent);
    persistNow();
    if (pausedInBackground()) stopAllTransfers();
    else scheduleTransfers();
  }

  function setAppLifecycle(state: "active" | "inactive" | "background"): void {
    appState = state;
    if (pausedInBackground()) stopAllTransfers();
    else if (state === "active") void pollAllMacs();
  }

  async function pairFromPayload(
    payload: PairPayload,
  ): Promise<{ mac: PairedMac; alreadyPaired: boolean }> {
    const resp = await deps.client.pair(payload.host, payload.port, payload.code, deviceName);
    const existing = macs().find((m) => m.id === resp.serverId);
    const mac: PairedMac = {
      id: resp.serverId,
      name: resp.serverName || payload.name || payload.host,
      shortName: resp.shortName || resp.serverName || payload.host,
      transport: resp.transport || payload.transport,
      host: payload.host,
      port: payload.port,
      token: resp.token,
      deviceId: resp.deviceId,
      pairedAt: Date.now(),
      lastSyncedAt: null,
    };

    macs.set(existing ? macs().map((m) => (m.id === mac.id ? mac : m)) : [...macs(), mac]);
    lastNotice.set({ kind: "paired", macName: mac.name });
    persistNow();
    void pollAllMacs();
    return { mac, alreadyPaired: Boolean(existing) };
  }

  async function pairManual(
    hostInput: string,
    code: string,
  ): Promise<{ mac: PairedMac; alreadyPaired: boolean }> {
    const parsed = parseHostAndPort(hostInput);
    if (!parsed) throw new MirrorApiError("unreachable", "Invalid host");
    return pairFromPayload({
      transport: "lan",
      host: parsed.host,
      port: parsed.port,
      code: code.trim(),
    });
  }

  async function unpairMac(macId: string, byServer = false): Promise<void> {
    const target = macs().find((m) => m.id === macId);
    if (!target) return;
    if (!byServer) void deps.client.unpair(target);

    for (const [vid, active] of [...activeTransfers.entries()]) {
      if (active.macId === macId) abortTransfer(vid);
    }

    const nextMacs = macs().filter((m) => m.id !== macId);
    const nextOnline = onlineMacIds().filter((id) => id !== macId);
    const nextCats = { ...catalogs() };
    delete nextCats[macId];
    macs.set(nextMacs);
    onlineMacIds.set(nextOnline);
    catalogs.set(nextCats);

    const hasSource = (vid: string) =>
      sourcesForVideo(vid, nextMacs, nextOnline, pausedInBackground(), nextCats).length > 0;

    const orphaned: string[] = [];
    const nextLocals = { ...localItems() };
    for (const [vid, rec] of Object.entries(nextLocals)) {
      if (rec.state === "partial" && !hasSource(vid)) {
        delete nextLocals[vid];
        backoff.clear(vid);
        orphaned.push(vid);
      }
    }
    localItems.set(nextLocals);
    priorityQueue.set(priorityQueue().filter(hasSource));

    if (byServer) lastNotice.set({ kind: "removedByPc", macName: target.name });
    persistNow();
    if (orphaned.length > 0) {
      await Promise.all(orphaned.map((vid) => removeVideoFilesSerialized(vid)));
    }
    scheduleTransfers();
  }

  function deleteLocal(videoId: string): LocalItemRecord | null {
    const existingRec = getLocalRecord(videoId);
    const before = existingRec ? { ...existingRec } : null;
    abortTransfer(videoId);
    backoff.clear(videoId);
    priorityQueue.set(priorityQueue().filter((id) => id !== videoId));
    const remote = catalogMetaForVideo(videoId, macs(), catalogs());
    updateLocalRecord(videoId, {
      videoId,
      state: "removed",
      title: remote?.title ?? before?.title ?? videoId,
      thumbnailUrl: remote?.thumbnailUrl ?? before?.thumbnailUrl ?? "",
      durationMs: remote?.durationMs ?? before?.durationMs ?? null,
      sizeBytes: remote?.sizeBytes ?? before?.sizeBytes ?? 0,
      contentSha256: remote?.contentSha256 ?? before?.contentSha256,
      downloadedBytes: 0,
      chunkSize,
      completedChunks: 0,
      totalChunks: 0,
      mediaExt: remote?.mediaExt ?? before?.mediaExt ?? "mp4",
      mimeType: remote?.mimeType ?? before?.mimeType ?? "video/mp4",
      hasCaptions: remote?.hasCaptions ?? before?.hasCaptions ?? false,
      localPath: null,
      captionsPath: null,
      sourceMacId: before?.sourceMacId ?? null,
      sourceShortName: before?.sourceShortName ?? null,
      updatedAt: remote?.updatedAt ?? before?.updatedAt ?? Date.now(),
    });
    return before;
  }

  return {
    settings,
    macs,
    onlineMacIds,
    localItems,
    catalogs,
    activeVideoIds,
    priorityQueue,
    storagePaused,
    lastNotice,
    polling,
    hydrate,
    updateSettings,
    setAppLifecycle,
    clearNotice: () => lastNotice.set(null),
    resumeAfterStorageError: () => {
      storagePaused.set(null);
      scheduleTransfers();
    },
    library,
    stats,
    macSyncCounts,
    isMacOnline,
    pairFromPayload,
    pairManual,
    unpairMac,
    pollAllMacs,
    scheduleTransfers,
    deleteLocal,
    commitDeleteFiles: async (videoId) => {
      if (getLocalRecord(videoId)?.state === "removed") {
        await removeVideoFilesSerialized(videoId);
      }
    },
    restoreLocal: (videoId, before) => {
      backoff.clear(videoId);
      updateLocalRecord(videoId, before);
      scheduleTransfers();
    },
    mirrorAgain: (videoId) => {
      backoff.clear(videoId);
      updateLocalRecord(videoId, null);
      scheduleTransfers();
    },
    prioritize: (videoId) => {
      backoff.clear(videoId);
      priorityQueue.set([videoId, ...priorityQueue().filter((id) => id !== videoId)]);
      scheduleTransfers();
    },
    stopAllTransfers,
  };
}

export const mirrorEngine = createMirrorEngine({
  client: createHttpMirrorClient(),
  files: createDiskFileStore(),
  loadState: loadPersistedData,
  saveState: savePersistedData,
});

export { emptyPersistedData };
