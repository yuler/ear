import { appInfo, Scroll, Text, View } from "nsh";
import { AlertDialog, Button, Dialog, Switch } from "nsh/base";
import { Haptics } from "nsh/mobile";
import { copyFor, type Locale } from "../i18n";
import type { MirrorEngine } from "../mirror/engine";
import type { AccentColor, Appearance, PairedMac } from "../mirror/types";
import { AccentPicker } from "./AccentPicker";
import {
  IosGroupedRow,
  IosGroupedSection,
  IosSegmented,
} from "../ui/IosPrimitives";

function PairedMacRow(props: {
  mac: PairedMac;
  online: boolean;
  counts: { done: number; total: number };
  locale: Locale;
  showDivider: boolean;
  onDisconnect: () => void;
}) {
  const c = copyFor(props.locale);
  const statusLabel = props.online ? c.connectedBadge : c.offlineBadge;
  const subtitle = `${props.mac.host}:${props.mac.port} · ${c.syncedCount(
    props.counts.done,
    props.counts.total,
  )}`;

  return (
    <View class="flex-col">
      <View class="min-h-[56px] flex-row items-center justify-between gap-3 px-4 py-3">
        <View class="min-w-0 flex-1 flex-col gap-1">
          <View class="flex-row items-center gap-2">
            <View
              class={`h-2 w-2 rounded-full ${
                props.online ? "bg-ready" : "bg-dim"
              }`}
            />
            <Text class="text-[15px] font-semibold text-foreground">
              {props.mac.name}
            </Text>
            <Text
              class={`text-xs font-medium ${
                props.online ? "text-ready" : "text-muted-foreground"
              }`}
            >
              {statusLabel}
            </Text>
          </View>
          <Text class="font-mono text-xs text-muted-foreground">{subtitle}</Text>
        </View>

        <Button
          onPress={props.onDisconnect}
          class="rounded-full bg-danger-soft px-3 py-1.5 active:opacity-70"
        >
          <Text class="text-xs font-semibold text-destructive">
            {c.disconnect}
          </Text>
        </Button>
      </View>
      {props.showDivider ? <View class="ml-4 h-[1px] bg-line/60" /> : null}
    </View>
  );
}

/** iOS Settings bottom page-sheet: Appearance, Language, Background Sync, Paired Computers. */
export function SettingsSheet(props: {
  open: () => boolean;
  engine: MirrorEngine;
  onClose: () => void;
  onOpenPair: () => void;
}) {
  const locale = () => props.engine.settings().language;
  const c = () => copyFor(locale());

  const appearanceOptions = (): { value: Appearance; label: string }[] => [
    { value: "system", label: c().appearanceSystem },
    { value: "light", label: c().appearanceLight },
    { value: "dark", label: c().appearanceDark },
  ];

  const languageOptions: readonly { value: Locale; label: string }[] = [
    { value: "zh", label: "中文" },
    { value: "en", label: "English" },
  ];

  const accentLabel = (accent: AccentColor): string => {
    const copy = c();
    if (accent === "green") return copy.accentGreen;
    if (accent === "orange") return copy.accentOrange;
    if (accent === "purple") return copy.accentPurple;
    if (accent === "red") return copy.accentRed;
    return copy.accentBlue;
  };

  const versionText = () => {
    const version = appInfo().version;
    return version ? `v${version}` : "v0.0.0";
  };

  const confirmDisconnect = async (mac: PairedMac) => {
    Haptics.impact("medium");
    try {
      const res = await AlertDialog.show({
        title: c().disconnectConfirmTitle(mac.name),
        description: c().disconnectConfirmMsg,
        actions: [
          { id: "cancel", label: c().cancel, role: "cancel" },
          { id: "disconnect", label: c().disconnect, role: "destructive" },
        ],
      });
      if (res.action === "disconnect") {
        await props.engine.unpairMac(mac.id, false);
        Haptics.notification("success");
      }
    } catch {
      await props.engine.unpairMac(mac.id, false);
    }
  };

  return (
    <Dialog
      open={props.open()}
      presentation="pageSheet"
      closeOnSwipe
      closeOnBackdropPress
      onOpenChange={(e) => {
        if (!e.open) props.onClose();
      }}
      accessibilityLabel={c().settings}
    >
      <View class="flex-1 flex-col bg-background">
        {/* Grabber & iOS Sheet Navigation Bar */}
        <View class="items-center pt-2.5 pb-1">
          <View class="h-1 w-9 rounded-full bg-dim/50" />
        </View>
        <View class="flex-row items-center justify-between px-4 py-3 border-b border-line/60">
          <View class="w-12" />
          <Text class="text-[17px] font-semibold text-foreground">
            {c().settings}
          </Text>
          <Button
            onPress={() => {
              Haptics.selection();
              props.onClose();
            }}
            class="min-w-[48px] items-end py-1 active:opacity-60"
          >
            <Text class="text-[16px] font-semibold text-tint">{c().done}</Text>
          </Button>
        </View>

        <Scroll class="flex-1">
          <View class="flex-col gap-6 p-4 pb-10">
            {/* Appearance & Language */}
            <IosGroupedSection title={c().appearanceSection}>
              <View class="flex-col gap-2.5 px-4 py-3">
                <Text class="text-[15px] font-medium text-foreground">
                  {c().appearanceLabel}
                </Text>
                <IosSegmented
                  options={appearanceOptions()}
                  value={() => props.engine.settings().appearance}
                  onChange={(appearance) =>
                    props.engine.updateSettings({ appearance })
                  }
                />
              </View>
              <View class="ml-4 h-[1px] bg-line/60" />
              <View class="flex-col gap-2.5 px-4 py-3">
                <Text class="text-[15px] font-medium text-foreground">
                  {c().accentLabel}
                </Text>
                <AccentPicker
                  value={() => props.engine.settings().accent}
                  labelFor={accentLabel}
                  onChange={(accent) => props.engine.updateSettings({ accent })}
                />
              </View>
              <View class="ml-4 h-[1px] bg-line/60" />
              <View class="flex-col gap-2.5 px-4 py-3">
                <Text class="text-[15px] font-medium text-foreground">
                  {c().languageLabel}
                </Text>
                <IosSegmented
                  options={languageOptions}
                  value={() => props.engine.settings().language}
                  onChange={(language) =>
                    props.engine.updateSettings({ language })
                  }
                />
              </View>
            </IosGroupedSection>

            {/* Background Sync */}
            <IosGroupedSection
              title={c().syncSection}
              footer={c().backgroundSyncFooter}
            >
              <IosGroupedRow
                title={c().backgroundSyncLabel}
                trailing={
                  <Switch
                    checked={props.engine.settings().backgroundSync}
                    onChange={(e) => {
                      Haptics.selection();
                      props.engine.updateSettings({ backgroundSync: e.checked });
                    }}
                    accessibilityLabel={c().backgroundSyncLabel}
                    trackClass="h-7 w-12 rounded-full bg-well p-0.5 checked:bg-ready"
                    thumbClass="h-6 w-6 rounded-full bg-white shadow-sm transition checked:translate-x-5"
                  />
                }
              />
            </IosGroupedSection>

            {/* Paired Computers */}
            <IosGroupedSection
              title={c().pairedComputersSection}
              footer={c().multiMacFooter}
            >
              {props.engine.macs().length === 0 ? (
                <View class="px-4 py-4">
                  <Text class="text-sm text-muted-foreground">
                    {c().noPairedComputers}
                  </Text>
                </View>
              ) : (
                props.engine.macs().map((mac) => (
                  <PairedMacRow
                    mac={mac}
                    online={props.engine.isMacOnline(mac.id)}
                    counts={props.engine.macSyncCounts(mac.id)}
                    locale={locale()}
                    showDivider
                    onDisconnect={() => void confirmDisconnect(mac)}
                  />
                ))
              )}

              <Button
                onPress={() => {
                  Haptics.selection();
                  props.onClose();
                  props.onOpenPair();
                }}
                class="min-h-[48px] w-full flex-row items-center justify-center px-4 py-3 active:bg-accent"
              >
                <Text class="text-[15px] font-semibold text-tint">
                  {c().pairNewComputer}
                </Text>
              </Button>
            </IosGroupedSection>

            <Text class="pt-2 text-center text-xs text-muted-foreground">
              {`${c().versionLabel} ${versionText()}`}
            </Text>
          </View>
        </Scroll>
      </View>
    </Dialog>
  );
}
