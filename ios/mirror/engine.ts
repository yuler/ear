// Projection helpers live in ./selectors.ts; chunked Range transfer lives in ./transfer.ts.
import { setColorScheme, signal, type Signal } from "nsh";
import {
  createHttpMirrorClient,
  MirrorApiError,
  type MirrorApiClient,
} from "./client";
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
  const applyScheme =
    deps.applyColorScheme ??
    ((scheme) => {
      try {
        setColorScheme(scheme);
      } catch {
        // ignore outside native host
      }
    });

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

  function updateLocalRecord(videoId: string, record: LocalItemRecord | null): void {
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
      activeTransfers.delete(videoId);
      syncActiveIdsSignal();
      return;
    }

    try {
      const done = await transferVideoToLocal({
        client: deps.client,
        files: deps.files,
        chunkSize,
        remote,
        mac,
        existing: localItems()[videoId],
        signal: controller.signal,
        onProgress: (rec) => updateLocalRecord(videoId, rec),
        onStorageError: (msg) => {
          storagePaused.set(msg);
          lastNotice.set({ kind: "storageError", message: msg });
          stopAllTransfers();
        },
      });
      if (done) {
        priorityQueue.set(priorityQueue().filter((id) => id !== videoId));
        void reportMacProgress(mac);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof MirrorApiError && err.code === "unpaired") {
        void unpairMac(mac.id, true);
        return;
      }
      if (err instanceof MirrorApiError && err.code === "unreachable") {
        onlineMacIds.set(onlineMacIds().filter((id) => id !== mac.id));
      }
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
      .filter((item) => item.status === "queued")
      .sort((a, b) => {
        const ai = prioIndex.get(a.videoId);
        const bi = prioIndex.get(b.videoId);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return b.updatedAt - a.updatedAt;
      });

    for (const item of candidates) {
      if (activeTransfers.has(item.videoId)) continue;
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

      const nextOnline: string[] = [];
      const nextCatalogs = { ...catalogs() };
      const revokedIds: string[] = [];

      results.forEach((res, idx) => {
        const mac = currentMacs[idx]!;
        if (res.status === "fulfilled") {
          nextOnline.push(mac.id);
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
  }

  function updateSettings(patch: Partial<MirrorSettings>): void {
    const next = { ...settings(), ...patch };
    settings.set(next);
    if (patch.appearance) applyScheme(patch.appearance);
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

    const nextLocals = { ...localItems() };
    for (const [vid, rec] of Object.entries(nextLocals)) {
      if (rec.state === "partial" && !hasSource(vid)) {
        delete nextLocals[vid];
        void deps.files.removeVideoFiles(vid);
      }
    }
    localItems.set(nextLocals);
    priorityQueue.set(priorityQueue().filter(hasSource));

    if (byServer) lastNotice.set({ kind: "removedByPc", macName: target.name });
    persistNow();
    scheduleTransfers();
  }

  function deleteLocal(videoId: string): LocalItemRecord | null {
    const before = localItems()[videoId] ? { ...localItems()[videoId]! } : null;
    abortTransfer(videoId);
    priorityQueue.set(priorityQueue().filter((id) => id !== videoId));
    const remote = catalogMetaForVideo(videoId, macs(), catalogs());
    updateLocalRecord(videoId, {
      videoId,
      state: "removed",
      title: remote?.title ?? before?.title ?? videoId,
      thumbnailUrl: remote?.thumbnailUrl ?? before?.thumbnailUrl ?? "",
      durationMs: remote?.durationMs ?? before?.durationMs ?? null,
      sizeBytes: remote?.sizeBytes ?? before?.sizeBytes ?? 0,
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
      if (localItems()[videoId]?.state === "removed") {
        await deps.files.removeVideoFiles(videoId);
      }
    },
    restoreLocal: (videoId, before) => {
      updateLocalRecord(videoId, before);
      scheduleTransfers();
    },
    mirrorAgain: (videoId) => {
      updateLocalRecord(videoId, null);
      scheduleTransfers();
    },
    prioritize: (videoId) => {
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
