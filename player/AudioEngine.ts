/** Placeholder — module 2/3 will drive playback, rate, and A-B loops. */
export type PlaybackRate = 0.75 | 1 | 1.25 | 1.5;

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
