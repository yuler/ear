import { AppSettings } from "nsh/mobile";
import { QrScanner, type QrScanOptions, type QrScanResult } from "ear-scanner";

export type CameraPermissionState =
  | "notDetermined"
  | "authorized"
  | "denied"
  | "restricted"
  | "unavailable";

export interface MobilePermissionsBridge {
  scannerAvailable(): Promise<boolean>;
  cameraPermission(): Promise<CameraPermissionState>;
  scanQr(options?: QrScanOptions): Promise<QrScanResult>;
  appSettingsAvailable(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
}

function normalizeCameraPermission(raw: string): CameraPermissionState {
  if (
    raw === "notDetermined" ||
    raw === "authorized" ||
    raw === "denied" ||
    raw === "restricted"
  ) {
    return raw;
  }
  return "unavailable";
}

export const defaultPermissionsBridge: MobilePermissionsBridge = {
  scannerAvailable: () => QrScanner.available().catch(() => false),
  cameraPermission: () =>
    QrScanner.permission()
      .then(normalizeCameraPermission)
      .catch(() => "unavailable"),
  scanQr: (options) =>
    QrScanner.scan(options).catch(() => ({ status: "unavailable", value: null })),
  appSettingsAvailable: () => AppSettings.available().catch(() => false),
  openAppSettings: async () => {
    try {
      const res = await AppSettings.open();
      return Boolean(res.opened);
    } catch {
      return false;
    }
  },
};
