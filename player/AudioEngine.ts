/** Placeholder — module 3 Loop Dojo rates: 0.8 / 1.0 / 1.2. */
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
