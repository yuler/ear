import type { Signal } from "nsh";
import type { MirrorApiClient } from "./client";
import type { MirrorFileStore } from "./storage";
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
  ensurePlayablePath(videoId: string): Promise<string | null>;
  stopAllTransfers(): void;
}
