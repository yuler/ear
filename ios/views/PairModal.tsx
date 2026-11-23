import { Clipboard, effect, Scroll, signal, Text, View } from "nsh";
import { Button, Dialog, Input, OtpInput } from "nsh/base";
import { Haptics } from "nsh/mobile";
import { copyFor } from "../i18n";
import { MirrorApiError } from "../mirror/client";
import type { MirrorEngine } from "../mirror/engine";
import { parseHostAndPort, parsePairUrl } from "../mirror/transport";
import { IosGroupedSection, IosSegmented } from "../ui/IosPrimitives";

type PairMode = "link" | "manual";
type PairPhase = "idle" | "connecting" | "done" | "error";

/** iOS page-sheet modal for pairing via ear://pair QR link or manual LAN host + 4-digit code. */
export function PairModal(props: {
  open: () => boolean;
  engine: MirrorEngine;
  initialUrl?: () => string | null;
  onClose: () => void;
  onPaired?: (macName: string) => void;
}) {
  const mode = signal<PairMode>("link");
  const phase = signal<PairPhase>("idle");
  const pairUrlInput = signal("");
  const hostInput = signal("");
  const codeInput = signal("");
  const errorText = signal<string | null>(null);
  const pairedName = signal("");
  const pairedAgain = signal(false);

  const locale = () => props.engine.settings().language;
  const c = () => copyFor(locale());

  const resetForm = () => {
    phase.set("idle");
    errorText.set(null);
    codeInput.set("");
    pairedName.set("");
    pairedAgain.set(false);
  };

  const describeError = (err: unknown, hostLabel: string): string => {
    if (err instanceof MirrorApiError) {
      if (err.code === "invalid_code") return c().errWrongCode;
      if (err.code === "code_expired") return c().errExpiredCode;
      return c().errUnreachable(hostLabel);
    }
    return c().errUnreachable(hostLabel);
  };

  const finishPair = (macName: string, already: boolean) => {
    pairedName.set(macName);
    pairedAgain.set(already);
    phase.set("done");
    Haptics.notification("success");
    props.onPaired?.(macName);
    setTimeout(() => {
      if (props.open()) {
        resetForm();
        props.onClose();
      }
    }, 1000);
  };

  const submitPairUrl = async (raw: string) => {
    const payload = parsePairUrl(raw);
    if (!payload) {
      errorText.set(c().errInvalidUrl);
      phase.set("error");
      Haptics.notification("error");
      return;
    }
    phase.set("connecting");
    errorText.set(null);
    try {
      const res = await props.engine.pairFromPayload(payload);
      finishPair(res.mac.name, res.alreadyPaired);
    } catch (err) {
      errorText.set(describeError(err, `${payload.host}:${payload.port}`));
      phase.set("error");
      Haptics.notification("error");
    }
  };

  const submitManual = async (codeOverride?: string) => {
    const parsedHost = parseHostAndPort(hostInput());
    if (!parsedHost) {
      errorText.set(c().errInvalidHost);
      phase.set("error");
      Haptics.notification("error");
      return;
    }
    const cleanCode = (codeOverride ?? codeInput()).replace(/\D/g, "");
    if (cleanCode.length !== 4) {
      errorText.set(c().errWrongCode);
      phase.set("error");
      Haptics.notification("error");
      return;
    }
    phase.set("connecting");
    errorText.set(null);
    try {
      const res = await props.engine.pairManual(hostInput(), cleanCode);
      finishPair(res.mac.name, res.alreadyPaired);
    } catch (err) {
      errorText.set(describeError(err, `${parsedHost.host}:${parsedHost.port}`));
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
        return;
      }
      pairUrlInput.set(text.trim());
      errorText.set(null);
      await submitPairUrl(text);
    } catch {
      errorText.set(c().errClipboardEmpty);
    }
  };

  // If opened from an ear://pair?... deep link, auto-submit immediately.
  effect(() => {
    const incoming = props.initialUrl?.();
    if (props.open() && incoming && phase() === "idle") {
      mode.set("link");
      pairUrlInput.set(incoming);
      void submitPairUrl(incoming);
    }
  });

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
        ) : (
          <Scroll class="flex-1">
            <View class="flex-col gap-5 p-4 pb-10">
              <IosSegmented
                options={modeOptions()}
                value={() => mode()}
                onChange={(next) => {
                  mode.set(next);
                  errorText.set(null);
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
                      <Input
                        value={pairUrlInput()}
                        onChange={(e) => {
                          pairUrlInput.set(e.value);
                          errorText.set(null);
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
                <View class="flex-col gap-2 rounded-2xl bg-danger-soft px-4 py-3">
                  <Text class="text-[13px] font-medium leading-relaxed text-destructive">
                    {errorText()}
                  </Text>
                </View>
              ) : null}
            </View>
          </Scroll>
        )}
      </View>
    </Dialog>
  );
}
