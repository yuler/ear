import { Clipboard, platform, signal } from "nsh";
import { showToast } from "../ui/Toast";
import { t } from "../ui/i18n";
import { settings } from "../ui/settings";
import {
  ffmpegBannerVisible,
  ffmpegInstallPlan,
  isFfmpegMissingError,
  type FfmpegInstallPlan,
  type FfmpegReport,
} from "./plan";
import { brewIsAvailable, launchInstall, probeFfmpeg, wingetIsAvailable } from "./probe";

export const ffmpegReport = signal<FfmpegReport | null>(null);
export const ffmpegDismissed = signal(false);
export const ffmpegMergeBlocked = signal(false);
const brewAvailable = signal(false);
const wingetAvailable = signal(false);

export function noteDownloadError(message: string) {
  if (isFfmpegMissingError(message)) ffmpegMergeBlocked.set(true);
}

export function dismissFfmpegBanner() {
  ffmpegDismissed.set(true);
  ffmpegMergeBlocked.set(false);
}

export function ffmpegBannerOpen(): boolean {
  const report = ffmpegReport();
  return ffmpegBannerVisible({
    missing: report !== null && !report.ok,
    dismissed: ffmpegDismissed(),
    mergeBlocked: ffmpegMergeBlocked(),
  });
}

export function ffmpegSettingsOpen(): boolean {
  const report = ffmpegReport();
  return report !== null && !report.ok;
}

export function currentInstallPlan(): FfmpegInstallPlan {
  const report = ffmpegReport();
  return ffmpegInstallPlan({
    os: platform.os,
    brewAvailable: brewAvailable(),
    wingetAvailable: wingetAvailable(),
    installCommand: report?.installCommand ?? "",
  });
}

export async function recheckFfmpeg(): Promise<void> {
  const [report, brew, winget] = await Promise.all([
    probeFfmpeg(),
    brewIsAvailable(),
    wingetIsAvailable(),
  ]);
  brewAvailable.set(brew);
  wingetAvailable.set(winget);
  if (!report) return;
  ffmpegReport.set(report);
  if (report.ok) {
    ffmpegDismissed.set(false);
    ffmpegMergeBlocked.set(false);
  }
}

export async function runFfmpegInstall(): Promise<void> {
  const plan = currentInstallPlan();
  if (!plan.command) return;
  if (plan.kind === "run") {
    const opened = await launchInstall(platform.os, plan.command);
    if (opened) return;
  }
  try {
    if (typeof Clipboard?.writeText === "function") {
      await Clipboard.writeText(plan.command);
    }
  } catch {
    // still tell the user the command was the thing to copy
  }
  showToast(t(settings().language).copied);
}
