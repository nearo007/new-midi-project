const SCALE_PATTERNS: Record<string, number[]> = {
  major:     [2, 2, 1, 2, 2, 2, 1],
  minor:     [2, 1, 2, 2, 1, 2, 2],
  blues:     [3, 2, 1, 1, 3, 2],
  chromatic: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
};

const CHORD_INTERVALS: Record<string, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
};

const SEVENTH_ADDITIONS: Record<string, number> = {
  none: 0,
  maj7: 11,
  min7: 10,
};

function getChordNotes(noteKey: number, octave: number, tonality: number, seventh: number): number[] {
  const steps = SCALE_PATTERNS.chromatic.slice(0, -1);
  let current = 23 + noteKey;
  const scale: number[] = [];
  for (const step of steps) {
    current += step;
    scale.push(current + (octave - 1) * 12);
  }

  const tone = tonality === 0 ? 'major' : 'minor';
  const intervals = [...CHORD_INTERVALS[tone]];
  if (seventh === 1) intervals.push(SEVENTH_ADDITIONS.maj7);
  else if (seventh === 2) intervals.push(SEVENTH_ADDITIONS.min7);

  return intervals.map((i) => scale[i]);
}

export function chordTupleToNotes(tuple: [number, number, number, number, boolean]): number[] {
  return getChordNotes(tuple[0], tuple[1], tuple[2], tuple[3]);
}
