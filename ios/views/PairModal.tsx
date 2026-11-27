// Camera-denied recovery card and error banner live in ./PairModalViews.tsx.
import { Clipboard, effect, Scroll, signal, Text, View } from "nsh";
import { Button, Dialog, Input, OtpInput } from "nsh/base";
import { Haptics } from "nsh/mobile";
import { copyFor } from "../i18n";
import { MirrorApiError } from "../mirror/client";
import type { MirrorEngine } from "../mirror/engine";
import { parseHostAndPort, parsePairUrl } from "../mirror/transport";
import { IosGroupedSection, IosSegmented } from "../ui/IosPrimitives";
import { CameraDeniedCard, PairErrorBanner } from "./PairModalViews";

export type PairModalIntent =
  | { kind: "link" }
  | { kind: "manual" }
  | { kind: "cameraDenied" }
  | { kind: "deepLink"; url: string }
  | { kind: "scanned"; raw: string };

type PairMode = "link" | "manual";
type PairPhase = "idle" | "connecting" | "done" | "error";

/** iOS page-sheet modal for QR scan results, camera permission recovery, deep links, or manual code. */
export function PairModal(props: {
  open: () => boolean;
  intent: () => PairModalIntent;
  engine: MirrorEngine;
  scannerAvailable: () => boolean;
  canOpenSettings: () => boolean;
  onRequestScan: () => void;
  onOpenSystemSettings: () => void;
  onClose: () => void;
  onPaired?: (macName: string) => void;
}) {
  const mode = signal<PairMode>("link");
  const showCameraDenied = signal(false);
  const phase = signal<PairPhase>("idle");
  const pairUrlInput = signal("");
  const hostInput = signal("");
  const codeInput = signal("");
  const errorText = signal<string | null>(null);
  const errorIsUnreachable = signal(false);
  const pairedName = signal("");
  const pairedAgain = signal(false);

  let handledIntent: PairModalIntent | null = null;

  const locale = () => props.engine.settings().language;
  const c = () => copyFor(locale());

  const resetForm = () => {
    phase.set("idle");
    errorText.set(null);
    errorIsUnreachable.set(false);
    codeInput.set("");
    pairedName.set("");
    pairedAgain.set(false);
    showCameraDenied.set(false);
    handledIntent = null;
  };

  const describeError = (err: unknown, hostLabel: string): { text: string; unreachable: boolean } => {
    if (err instanceof MirrorApiError) {
      if (err.code === "invalid_code") return { text: c().errWrongCode, unreachable: false };
      if (err.code === "code_expired") return { text: c().errExpiredCode, unreachable: false };
      if (err.code === "pair_locked") return { text: c().errPairLocked, unreachable: false };
      return { text: c().errUnreachable(hostLabel), unreachable: true };
    }
    return { text: c().errUnreachable(hostLabel), unreachable: true };
  };

  const finishPair = (macName: string, already: boolean) => {
    pairedName.set(macName);
    pairedAgain.set(already);
    phase.set("done");
    errorText.set(null);
    errorIsUnreachable.set(false);
    Haptics.notification("success");
    props.onPaired?.(macName);
    setTimeout(() => {
      if (props.open()) {
        resetForm();
        props.onClose();
      }
    }, 1000);
  };

  const submitPairUrl = async (raw: string, invalidMsg?: string) => {
    const payload = parsePairUrl(raw);
    if (!payload) {
      errorText.set(invalidMsg ?? c().errInvalidUrl);
      errorIsUnreachable.set(false);
      phase.set("error");
      Haptics.notification("error");
      return;
    }
    phase.set("connecting");
    errorText.set(null);
    errorIsUnreachable.set(false);
    try {
      const res = await props.engine.pairFromPayload(payload);
      finishPair(res.mac.name, res.alreadyPaired);
    } catch (err) {
      const info = describeError(err, `${payload.host}:${payload.port}`);
      errorText.set(info.text);
      errorIsUnreachable.set(info.unreachable);
      phase.set("error");
      Haptics.notification("error");
    }
  };

  const submitManual = async (codeOverride?: string) => {
    const parsedHost = parseHostAndPort(hostInput());
    if (!parsedHost) {
      errorText.set(c().errInvalidHost);
      errorIsUnreachable.set(false);
      phase.set("error");
      Haptics.notification("error");
      return;
    }
    const cleanCode = (codeOverride ?? codeInput()).replace(/\D/g, "");
    if (cleanCode.length !== 4) {
      errorText.set(c().errWrongCode);
      errorIsUnreachable.set(false);
      phase.set("error");
      Haptics.notification("error");
      return;
    }
    phase.set("connecting");
    errorText.set(null);
    errorIsUnreachable.set(false);
    try {
      const res = await props.engine.pairManual(hostInput(), cleanCode);
      finishPair(res.mac.name, res.alreadyPaired);
    } catch (err) {
      const info = describeError(err, `${parsedHost.host}:${parsedHost.port}`);
      errorText.set(info.text);
      errorIsUnreachable.set(info.unreachable);
      phase.set("error");
      codeInput.set("");
      Haptics.notification("error");
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await Clipboard.readText();
      if (!text || !parsePairUrl(text)) {
        errorText.set(c().errClipboardEmpty);
        errorIsUnreachable.set(false);
        return;
      }
      pairUrlInput.set(text.trim());
      errorText.set(null);
      errorIsUnreachable.set(false);
    } catch {
      errorText.set(c().errClipboardEmpty);
      errorIsUnreachable.set(false);
    }
  };

  // Apply modal intent whenever opened:
  // - `scanned`: auto-pair immediately (user explicitly pointed camera at desktop QR)
  // - `deepLink`: pre-fill and stop at confirm step (untrusted external ear:// URL)
  // - `cameraDenied`: show dedicated camera permission recovery view
  // - `manual` / `link`: open the requested tab cleanly
  effect(() => {
    if (!props.open()) {
      handledIntent = null;
      return;
    }
    const intent = props.intent();
    if (intent === handledIntent) return;
    handledIntent = intent;

    phase.set("idle");
    errorText.set(null);
    errorIsUnreachable.set(false);
    showCameraDenied.set(false);

    if (intent.kind === "cameraDenied") {
      showCameraDenied.set(true);
      mode.set("link");
    } else if (intent.kind === "manual") {
      mode.set("manual");
    } else if (intent.kind === "deepLink") {
      mode.set("link");
      pairUrlInput.set(intent.url);
    } else if (intent.kind === "scanned") {
      mode.set("link");
      pairUrlInput.set(intent.raw);
      void submitPairUrl(intent.raw, c().errInvalidQr);
    } else {
      mode.set("link");
    }
  });

  const parsedPreview = () => parsePairUrl(pairUrlInput());

  const modeOptions = (): { value: PairMode; label: string }[] => [
    { value: "link", label: c().pairModeLink },
    { value: "manual", label: c().pairModeManual },
  ];

  return (
    <Dialog
      open={props.open()}
      presentation="pageSheet"
      closeOnSwipe
      closeOnBackdropPress
      onOpenChange={(e) => {
        if (!e.open) {
          resetForm();
          props.onClose();
        }
      }}
      accessibilityLabel={c().pairTitle}
    >
      <View class="flex-1 flex-col bg-background">
        {/* Grabber + iOS Navigation Bar */}
        <View class="items-center pt-2.5 pb-1">
          <View class="h-1 w-9 rounded-full bg-dim/50" />
        </View>
        <View class="flex-row items-center justify-between px-4 py-3 border-b border-line/60">
          <Button
            onPress={() => {
              resetForm();
              props.onClose();
            }}
            class="min-w-[56px] py-1 active:opacity-60"
          >
            <Text class="text-[16px] text-tint">{c().cancel}</Text>
          </Button>
          <Text class="text-[17px] font-semibold text-foreground">
            {c().pairTitle}
          </Text>
          <View class="w-[56px]" />
        </View>

        {phase() === "done" ? (
          <View class="flex-1 items-center justify-center gap-3 px-8">
            <View class="h-16 w-16 items-center justify-center rounded-full bg-ready-soft">
              <Text class="text-3xl font-bold text-ready">✓</Text>
            </View>
            <Text class="text-center text-lg font-bold text-foreground">
              {pairedAgain()
                ? c().pairAlreadyPairedTitle(pairedName())
                : c().pairSuccessTitle(pairedName())}
            </Text>
            <Text class="text-center text-sm text-muted-foreground">
              {c().pairSuccessSub}
            </Text>
          </View>
        ) : showCameraDenied() ? (
          <Scroll class="flex-1">
            <View class="flex-col gap-5 p-4 pb-10">
              <CameraDeniedCard
                copy={c}
                canOpenSettings={props.canOpenSettings}
                scannerAvailable={props.scannerAvailable}
                onOpenSystemSettings={props.onOpenSystemSettings}
                onRescan={() => {
                  resetForm();
                  props.onClose();
                  props.onRequestScan();
                }}
                onSwitchManual={() => {
                  showCameraDenied.set(false);
                  mode.set("manual");
                }}
              />
            </View>
          </Scroll>
        ) : (
          <Scroll class="flex-1">
            <View class="flex-col gap-5 p-4 pb-10">
              <IosSegmented
                options={modeOptions()}
                value={() => mode()}
                onChange={(next) => {
                  mode.set(next);
                  errorText.set(null);
                  errorIsUnreachable.set(false);
                  if (phase() === "error") phase.set("idle");
                }}
              />

              {mode() === "link" ? (
                <View class="flex-col gap-4">
                  <IosGroupedSection>
                    <View class="flex-col gap-2.5 p-4">
                      <Text class="text-[16px] font-semibold text-foreground">
                        {c().pairScanGuideTitle}
                      </Text>
                      <Text class="text-[13px] leading-relaxed text-muted-foreground">
                        {c().pairScanGuideDesc}
                      </Text>
                      {props.scannerAvailable() ? (
                        <Button
                          disabled={phase() === "connecting"}
                          onPress={() => {
                            Haptics.impact("light");
                            resetForm();
                            props.onClose();
                            props.onRequestScan();
                          }}
                          class="mt-1 min-h-[48px] items-center justify-center rounded-xl bg-primary px-4 py-3 active:opacity-80 disabled:opacity-40"
                        >
                          <Text class="text-[16px] font-semibold text-primary-foreground">
                            {c().openScannerBtn}
                          </Text>
                        </Button>
                      ) : null}
                      <Button
                        disabled={phase() === "connecting"}
                        onPress={() => void handlePasteClipboard()}
                        class="mt-1 min-h-[44px] items-center justify-center rounded-xl bg-tint-soft px-4 py-2.5 active:opacity-70"
                      >
                        <Text class="text-[15px] font-semibold text-tint">
                          {c().pasteFromClipboard}
                        </Text>
                      </Button>
                    </View>
                  </IosGroupedSection>

                  <IosGroupedSection>
                    <View class="flex-col gap-3 p-4">
                      {parsedPreview() ? (
                        <View class="flex-col gap-1 rounded-xl border border-tint/30 bg-tint-soft/50 px-3 py-2.5">
                          <Text class="text-[13px] font-semibold text-foreground">
                            {c().pairConfirmTitle}
                          </Text>
                          <Text class="text-[12px] leading-relaxed text-muted-foreground">
                            {c().pairConfirmDesc(
                              parsedPreview()!.name
                                ? `${parsedPreview()!.name} (${parsedPreview()!.host}:${parsedPreview()!.port})`
                                : `${parsedPreview()!.host}:${parsedPreview()!.port}`,
                            )}
                          </Text>
                        </View>
                      ) : null}
                      <Input
                        value={pairUrlInput()}
                        onChange={(e) => {
                          pairUrlInput.set(e.value);
                          errorText.set(null);
                          errorIsUnreachable.set(false);
                        }}
                        placeholder={c().pairUrlPlaceholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                        class="min-h-[44px] rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-dim"
                      />
                      <Button
                        disabled={phase() === "connecting" || !pairUrlInput().trim()}
                        onPress={() => void submitPairUrl(pairUrlInput())}
                        class="min-h-[48px] items-center justify-center rounded-xl bg-primary px-4 py-3 active:opacity-80 disabled:opacity-40"
                      >
                        <Text class="text-[16px] font-semibold text-primary-foreground">
                          {phase() === "connecting" ? c().pairingProgress : c().connectNow}
                        </Text>
                      </Button>
                    </View>
                  </IosGroupedSection>
                </View>
              ) : (
                <View class="flex-col gap-4">
                  <IosGroupedSection title={c().hostLabel}>
                    <View class="p-3">
                      <Input
                        value={hostInput()}
                        onChange={(e) => {
                          hostInput.set(e.value);
                          errorText.set(null);
                          errorIsUnreachable.set(false);
                        }}
                        placeholder={c().hostPlaceholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                        class="min-h-[44px] rounded-xl bg-background px-3 py-2 font-mono text-[15px] text-foreground placeholder:text-dim"
                      />
                    </View>
                  </IosGroupedSection>

                  <IosGroupedSection title={c().codeLabel} footer={c().codeHint}>
                    <View class="items-center justify-center gap-4 px-4 py-5">
                      <OtpInput
                        length={4}
                        value={codeInput()}
                        disabled={phase() === "connecting"}
                        onChange={(e) => {
                          const digits = e.value.replace(/\D/g, "").slice(0, 4);
                          codeInput.set(digits);
                          errorText.set(null);
                          errorIsUnreachable.set(false);
                          if (digits.length === 4 && hostInput().trim()) {
                            void submitManual(digits);
                          }
                        }}
                        class="flex-row items-center justify-center gap-3"
                        cellClass="h-14 w-12 items-center justify-center rounded-xl border border-line bg-background text-2xl font-bold font-mono text-foreground focus:border-tint"
                        caretClass="h-6 w-0.5 bg-tint"
                      />
                      <Button
                        disabled={
                          phase() === "connecting" ||
                          !hostInput().trim() ||
                          codeInput().length < 4
                        }
                        onPress={() => void submitManual()}
                        class="min-h-[48px] w-full items-center justify-center rounded-xl bg-primary px-4 py-3 active:opacity-80 disabled:opacity-40"
                      >
                        <Text class="text-[16px] font-semibold text-primary-foreground">
                          {phase() === "connecting" ? c().pairingProgress : c().connectNow}
                        </Text>
                      </Button>
                    </View>
                  </IosGroupedSection>
                </View>
              )}

              {errorText() ? (
                <PairErrorBanner
                  copy={c}
                  errorText={() => errorText()!}
                  isUnreachable={() => errorIsUnreachable()}
                  canOpenSettings={props.canOpenSettings}
                  scannerAvailable={props.scannerAvailable}
                  onOpenSystemSettings={props.onOpenSystemSettings}
                  onRescan={() => {
                    resetForm();
                    props.onClose();
                    props.onRequestScan();
                  }}
                />
              ) : null}
            </View>
          </Scroll>
        )}
      </View>
    </Dialog>
  );
}
