export interface Config {
  bpm: number;
  timeSignature: number;
  staccato: number;
  loopStaccato: number;
  loopBpm: number;
}

export const DEFAULT_CONFIG: Config = {
  bpm: 80,
  timeSignature: 0.5,
  staccato: 0.5,
  loopStaccato: 1.0,
  loopBpm: 80,
};
