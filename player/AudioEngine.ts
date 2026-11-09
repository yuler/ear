/** Playback rates used by Loop Dojo (and optional Blind Flow replay). */
export type PlaybackRate = 0.8 | 1 | 1.2;

export type AudioEngineState = {
  url: string | null;
  playing: boolean;
  positionMs: number;
  rate: PlaybackRate;
  loopAMs: number | null;
  loopBMs: number | null;
};

export function createAudioEngineState(): AudioEngineState {
  return {
    url: null,
    playing: false,
    positionMs: 0,
    rate: 1,
    loopAMs: null,
    loopBMs: null,
  };
}

/** Convert ms → seconds for Video.seek. */
export function msToSeconds(ms: number): number {
  return Math.max(0, ms) / 1000;
}

/**
 * True when progress has reached or passed the clip end (with a small slack).
 * Used to pause after playing one sentence window.
 */
export function clipEnded(
  currentTimeSec: number,
  endMs: number,
  slackMs = 40,
): boolean {
  return currentTimeSec * 1000 >= endMs - slackMs;
}
