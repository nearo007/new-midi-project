export type ScaleMode = 'major' | 'minor' | 'blues' | 'chromatic';

export const SCALE_PATTERNS: Record<ScaleMode, number[]> = {
  major:     [2, 2, 1, 2, 2, 2, 1],
  minor:     [2, 1, 2, 2, 1, 2, 2],
  blues:     [3, 2, 1, 1, 3, 2],
  chromatic: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
};

export const SCALE_MODES: ScaleMode[] = ['major', 'minor', 'blues', 'chromatic'];

export function getScaleNotes(
  mode: ScaleMode,
  key: number,
  octave: number,
  register?: [number, number],
  includeOctave = false,
): number[] {
  let steps = [...SCALE_PATTERNS[mode]];
  if (!includeOctave) {
    steps = steps.slice(0, -1);
  }

  if (register) {
    const scale: number[] = [];
    for (let oct = register[0]; oct <= register[1]; oct++) {
      let current = 23 + key;
      for (const step of steps) {
        current += step;
        scale.push(current + (oct - 1) * 12);
      }
    }
    if (includeOctave) {
      return [...new Set(scale)];
    }
    return scale;
  }

  let current = 23 + key;
  const scale: number[] = [];
  for (const step of steps) {
    current += step;
    scale.push(current + (octave - 1) * 12);
  }
  return scale;
}
