import type { Locale } from "../i18n";

export type Appearance = "system" | "light" | "dark";
export type AccentColor = "blue" | "green" | "orange" | "purple" | "red";
export type TransportKind = "lan" | "relay";

export interface MirrorSettings {
  appearance: Appearance;
  accent: AccentColor;
  language: Locale;
  backgroundSync: boolean;
}

export interface PairedMac {
  id: string;
  name: string;
  shortName: string;
  transport: TransportKind;
  host: string;
  port: number;
  token: string;
  deviceId: string;
  pairedAt: number;
  lastSyncedAt: number | null;
}

export interface RemoteCatalogItem {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  durationMs: number | null;
  sizeBytes: number;
  contentSha256?: string;
  quality: string | null;
  mediaExt: string;
  mimeType: string;
  hasCaptions: boolean;
  updatedAt: number;
}

export type LocalRecordState = "partial" | "ready" | "removed";

export interface LocalItemRecord {
  videoId: string;
  state: LocalRecordState;
  title: string;
  thumbnailUrl: string;
  durationMs: number | null;
  sizeBytes: number;
  contentSha256?: string;
  downloadedBytes: number;
  chunkSize: number;
  completedChunks: number;
  totalChunks: number;
  mediaExt: string;
  mimeType: string;
  hasCaptions: boolean;
  localPath: string | null;
  captionsPath: string | null;
  sourceMacId: string | null;
  sourceShortName: string | null;
  updatedAt: number;
}

export type MirrorItemStatus = "ready" | "syncing" | "queued" | "away" | "removed";

export interface MirrorSourceRef {
  id: string;
  name: string;
  shortName: string;
  online: boolean;
}

export interface MirrorItemView {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  durationMs: number | null;
  sizeBytes: number;
  contentSha256?: string;
  downloadedBytes: number;
  progress: number;
  status: MirrorItemStatus;
  priority: boolean;
  hasCaptions: boolean;
  mediaExt: string;
  mimeType: string;
  localPath: string | null;
  captionsPath: string | null;
  completedChunks: number;
  totalChunks: number;
  isChunkedUnmerged: boolean;
  sources: MirrorSourceRef[];
  fallbackSourceShortName: string | null;
  updatedAt: number;
}

export interface SyncStats {
  ready: number;
  syncing: number;
  queued: number;
  away: number;
  removed: number;
  reachableWanted: number;
  overallProgress: number;
  complete: boolean;
}

export interface PairPayload {
  transport: TransportKind;
  host: string;
  port: number;
  code: string;
  name?: string;
}

export interface PersistedMobileData {
  settings: MirrorSettings;
  macs: PairedMac[];
  localItems: Record<string, LocalItemRecord>;
  /** Last known catalog per Mac so offline ("away") items stay visible when switching Wi-Fi. */
  catalogs: Record<string, RemoteCatalogItem[]>;
}
