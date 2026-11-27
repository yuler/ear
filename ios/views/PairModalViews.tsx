import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Haptics } from "nsh/mobile";
import type { MobileCopy } from "../i18n";

/** Full-card recovery view shown when iOS camera permission was denied or restricted. */
export function CameraDeniedCard(props: {
  copy: () => MobileCopy;
  canOpenSettings: () => boolean;
  scannerAvailable: () => boolean;
  onOpenSystemSettings: () => void;
  onRescan: () => void;
  onSwitchManual: () => void;
}) {
  const c = props.copy;
  return (
    <View class="mt-4 flex-col items-center gap-4 rounded-3xl border border-line/60 bg-card px-6 py-8">
      <View class="h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft">
        <Text class="text-2xl font-bold text-destructive">!</Text>
      </View>
      <View class="items-center gap-1.5">
        <Text class="text-center text-[18px] font-bold text-foreground">
          {c().cameraDeniedTitle}
        </Text>
        <Text class="text-center text-[13px] leading-relaxed text-muted-foreground">
          {c().cameraDeniedDesc}
        </Text>
      </View>

      {props.canOpenSettings() ? (
        <Button
          onPress={() => {
            Haptics.impact("light");
            props.onOpenSystemSettings();
          }}
          class="mt-1 min-h-[48px] w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 active:opacity-80"
        >
          <Text class="text-[16px] font-semibold text-primary-foreground">
            {c().openSystemSettings}
          </Text>
        </Button>
      ) : null}

      {props.scannerAvailable() ? (
        <Button
          onPress={() => {
            Haptics.selection();
            props.onRescan();
          }}
          class="min-h-[44px] w-full items-center justify-center rounded-xl bg-tint-soft px-4 py-2.5 active:opacity-70"
        >
          <Text class="text-[15px] font-semibold text-tint">
            {c().rescanBtn}
          </Text>
        </Button>
      ) : null}

      <Button
        onPress={() => {
          Haptics.selection();
          props.onSwitchManual();
        }}
        class="min-h-[44px] w-full items-center justify-center rounded-xl bg-well px-4 py-2.5 active:opacity-70"
      >
        <Text class="text-[15px] font-semibold text-foreground">
          {c().scannerManualBtn}
        </Text>
      </Button>
    </View>
  );
}

/** Inline error banner with optional Local Network Settings & Re-scan actions. */
export function PairErrorBanner(props: {
  copy: () => MobileCopy;
  errorText: () => string;
  isUnreachable: () => boolean;
  canOpenSettings: () => boolean;
  scannerAvailable: () => boolean;
  onOpenSystemSettings: () => void;
  onRescan: () => void;
}) {
  const c = props.copy;
  return (
    <View class="flex-col gap-2.5 rounded-2xl bg-danger-soft px-4 py-3">
      <Text class="text-[13px] font-medium leading-relaxed text-destructive">
        {props.errorText()}
      </Text>
      {props.isUnreachable() ? (
        <Text class="text-xs leading-relaxed text-destructive/80">
          {c().localNetworkHelpHint}
        </Text>
      ) : null}
      <View class="flex-row flex-wrap gap-2">
        {props.isUnreachable() && props.canOpenSettings() ? (
          <Button
            onPress={() => {
              Haptics.selection();
              props.onOpenSystemSettings();
            }}
            class="rounded-full bg-destructive px-3.5 py-1.5 active:opacity-80"
          >
            <Text class="text-xs font-semibold text-white">
              {c().openSystemSettings}
            </Text>
          </Button>
        ) : null}
        {props.scannerAvailable() ? (
          <Button
            onPress={() => {
              Haptics.selection();
              props.onRescan();
            }}
            class="rounded-full bg-card px-3.5 py-1.5 active:opacity-70"
          >
            <Text class="text-xs font-semibold text-tint">
              {c().rescanBtn}
            </Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
