const SENTINEL = 100;

export function calcInterval(bpm: number, timeSignature: number): number {
  if (bpm === 0) return SENTINEL;
  return 60 / bpm / timeSignature;
}

export function calcNoteDuration(interval: number, staccato: number): number {
  return interval * staccato;
}

export function calcSilenceDuration(interval: number, noteDuration: number): number {
  return interval - noteDuration;
}
