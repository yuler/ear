/**
 * Audio feedback effects for Ear.
 * Synthesizes crisp, pleasant UI sound effects via Web Audio API.
 * Gracefully no-ops in headless test environments or when audio context is restricted.
 */

// Loose typings for Web Audio API in environments without DOM lib in tsconfig
interface MinimalAudioParam {
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
}

interface MinimalGainNode {
  gain: MinimalAudioParam;
  connect(destination: unknown): void;
}

interface MinimalOscillatorNode {
  type: string;
  frequency: MinimalAudioParam;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

interface MinimalAudioContext {
  state: string;
  currentTime: number;
  destination: unknown;
  createGain(): MinimalGainNode;
  createOscillator(): MinimalOscillatorNode;
  resume(): Promise<void>;
}

let sharedAudioCtx: MinimalAudioContext | null = null;

function getAudioContext(): MinimalAudioContext | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => MinimalAudioContext;
    webkitAudioContext?: new () => MinimalAudioContext;
  };

  const AudioCtx = g.AudioContext || g.webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

/**
 * Play a gentle, crisp "ding" chime sound effect on successful download.
 */
export function playDingSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    // Master volume envelope: smooth clickless attack + gentle exponential decay
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.28, now + 0.008);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    masterGain.connect(ctx.destination);

    // Primary crystal chime tone (C6: 1046.5 Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1046.5, now);
    osc1.frequency.exponentialRampToValueAtTime(1052, now + 0.08);

    // Harmonic sparkle overtone (Octave C7: 2093 Hz)
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(2093, now);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.35, now);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(masterGain);
    osc2.connect(gain2);
    gain2.connect(masterGain);

    osc1.start(now);
    osc2.start(now);

    osc1.stop(now + 0.65);
    osc2.stop(now + 0.65);
  } catch {
    // Graceful fallback for test runners or environments without audio output
  }
}
