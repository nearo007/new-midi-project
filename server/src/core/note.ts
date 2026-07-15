export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const NOTE_NAME_TO_KEY: Record<string, number> = {
  C: 1, 'C#': 2, D: 3, 'D#': 4, E: 5, F: 6, 'F#': 7,
  G: 8, 'G#': 9, A: 10, 'A#': 11, B: 12,
};

export const KEY_TO_NOTE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(NOTE_NAME_TO_KEY).map(([k, v]) => [v, k])
);

export function noteToMidi(octave: number, semitoneOffset: number): number {
  return 21 + (octave - 1) * 12 + semitoneOffset;
}

export function midiToOctave(midi: number): number {
  return Math.floor((midi - 21) / 12) + 1;
}

export function midiToSemitone(midi: number): number {
  return (midi - 21) % 12;
}

export function midiToNoteName(midi: number): string {
  return NOTE_NAMES[midiToSemitone(midi)];
}

export function chordDisplayName(noteKey: number, tonality: number, seventh: number): string {
  const name = KEY_TO_NOTE_NAME[noteKey] ?? '?';
  const tone = tonality === 0 ? '' : 'm';
  const ext = seventh === 1 ? 'maj7' : seventh === 2 ? '7' : '';
  return `${name}${tone}${ext}`;
}
