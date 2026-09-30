export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
export type ScaleMode = 'major' | 'minor' | 'blues' | 'chromatic';
export type MelodyScale = 'chord' | ScaleMode;
export type Tonality = 'major' | 'minor';
export type SeventhType = 'none' | 'maj7' | 'min7';
export const SCALE_OFFSETS: Record<ScaleMode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: Array.from({ length: 12 }, (_, i) => i),
};
export interface ChordSpec {
  id: string;
  rootPitchClass: number;
  octave: number;
  quality: Tonality;
  seventh: SeventhType;
  inversion: number;
  durationBeats: number;
  muted: boolean;
}
export interface MelodySettings {
  enabled: boolean;
  scale: MelodyScale;
  key: number;
  notesPerChord: number;
  octaveMin: number;
  octaveMax: number;
  seed: number;
}
export function noteToMidi(octave: number, pitchClass: number): number {
  return 12 * (octave + 1) + pitchClass;
}
export function noteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}
export function chordName(chord: ChordSpec): string {
  return `${NOTE_NAMES[chord.rootPitchClass]}${chord.quality === 'minor' ? 'm' : ''}${chord.seventh === 'none' ? '' : chord.seventh === 'min7' ? '7' : 'maj7'}`;
}
export function chordNotes(chord: ChordSpec): number[] {
  const root = noteToMidi(chord.octave, chord.rootPitchClass);
  const offsets = chord.quality === 'major' ? [0, 4, 7] : [0, 3, 7];
  if (chord.seventh !== 'none') offsets.push(chord.seventh === 'maj7' ? 11 : 10);
  return offsets
    .map((offset, i) => root + offset + (i < chord.inversion ? 12 : 0))
    .sort((a, b) => a - b);
}
export function scaleNotes(
  mode: ScaleMode,
  key: number,
  octave: number,
  includeOctave = false,
): number[] {
  const root = noteToMidi(octave, key - 1);
  return [...SCALE_OFFSETS[mode], ...(includeOctave ? [12] : [])].map((offset) => root + offset);
}
export function generateMelody(chords: readonly ChordSpec[], settings: MelodySettings): number[][] {
  if (!settings.enabled || settings.notesPerChord === 0) return chords.map(() => []);
  let state = settings.seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const minimum = noteToMidi(settings.octaveMin, 0);
  const maximum = Math.min(127, noteToMidi(settings.octaveMax, 11));
  let previous = -1;
  return chords.map((chord) => {
    const candidates = new Set<number>();
    if (settings.scale === 'chord') {
      for (const original of chordNotes(chord)) {
        let note = original;
        while (note > maximum) note -= 12;
        while (note + 12 <= maximum) note += 12;
        if (note >= minimum) candidates.add(note);
      }
    } else {
      for (let note = minimum; note <= maximum; note++) {
        if (SCALE_OFFSETS[settings.scale].includes((note - settings.key + 1 + 120) % 12))
          candidates.add(note);
      }
    }
    const sorted = [...candidates].sort((a, b) => a - b);
    const notes: number[] = [];
    for (let i = 0; i < settings.notesPerChord; i++) {
      const available = sorted.length > 1 ? sorted.filter((note) => note !== previous) : sorted;
      const note = available[Math.floor(random() * available.length)];
      if (note === undefined) break;
      notes.push(note);
      previous = note;
    }
    return notes;
  });
}
