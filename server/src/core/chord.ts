export type Tonality = 'major' | 'minor';
export type SeventhType = 'none' | 'maj7' | 'min7';

const CHORD_INTERVALS: Record<Tonality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
};

const SEVENTH_ADDITIONS: Record<SeventhType, number> = {
  none: 0,
  maj7: 11,
  min7: 10,
};

export function getChord(scale: number[], tonality: Tonality, seventh: SeventhType = 'none'): number[] {
  const intervals = [...CHORD_INTERVALS[tonality]];
  if (seventh !== 'none') {
    intervals.push(SEVENTH_ADDITIONS[seventh]);
  }
  return intervals.map((i) => scale[i]);
}
