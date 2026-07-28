import type { ChordData } from '../components/ChordBlock.vue';

export type MelodyScale = 'chord' | 'major' | 'minor' | 'blues' | 'chromatic';
export type MelodyRegister = 'low' | 'mid' | 'high';

export interface MelodySettings {
  enabled: boolean;
  scale: MelodyScale;
  key: number;
  notesPerChord: number;
  octaveMin: number;
  octaveMax: number;
  seed: number;
}

const SCALE_OFFSETS: Record<Exclude<MelodyScale, 'chord'>, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: Array.from({ length: 12 }, (_, index) => index),
};

function random01(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bounds(settings: MelodySettings): [number, number] {
  return [12 * (settings.octaveMin + 1), 12 * (settings.octaveMax + 1) + 11];
}

function scaleCandidates(settings: MelodySettings): number[] {
  const [minimum, maximum] = bounds(settings);
  const offsets = SCALE_OFFSETS[settings.scale as Exclude<MelodyScale, 'chord'>];
  const candidates: number[] = [];

  for (let octave = settings.octaveMin - 1; octave <= settings.octaveMax; octave += 1) {
    const root = 12 * (octave + 1) + settings.key - 1;
    for (const offset of offsets) {
      const note = root + offset;
      if (note >= minimum && note <= maximum && note <= 127) candidates.push(note);
    }
  }
  return [...new Set(candidates)].sort((a, b) => a - b);
}

function chordCandidates(tuple: ChordData, settings: MelodySettings): number[] {
  const [minimum, maximum] = bounds(settings);
  const notes = new Set<number>();
  const chord = chordTupleToNotes(tuple);

  for (const originalNote of chord) {
    let note = originalNote;
    while (note < minimum) note += 12;
    while (note > maximum) note -= 12;
    while (note + 12 <= maximum) note += 12;
    if (note >= minimum && note <= maximum && note <= 127) notes.add(note);
  }
  return [...notes].sort((a, b) => a - b);
}

function choose(candidates: number[], count: number, random: () => number, firstPrevious = -1): number[] {
  const result: number[] = [];
  let previous = firstPrevious;
  for (let index = 0; index < count; index += 1) {
    const available = candidates.length > 1 ? candidates.filter((note) => note !== previous) : candidates;
    const note = available[Math.floor(random() * available.length)];
    result.push(note);
    previous = note;
  }
  return result;
}

export function generateMelody(chords: ChordData[], settings: MelodySettings): number[][] {
  if (!settings.enabled || settings.notesPerChord === 0) return chords.map(() => []);
  const random = random01(settings.seed);
  const fallback = scaleCandidates({ ...settings, scale: 'chromatic' });
  let previous = -1;

  return chords.map((chord) => {
    const candidates = settings.scale === 'chord' ? chordCandidates(chord, settings) : scaleCandidates(settings);
    const notes = choose(candidates.length > 0 ? candidates : fallback, settings.notesPerChord, random, previous);
    if (notes.length > 0) previous = notes[notes.length - 1];
    return notes;
  });
}

function chordTupleToNotes(tuple: ChordData): number[] {
  const steps = Array.from({ length: 11 }, (_, index) => index + 1);
  const scale = steps.map((step) => 23 + tuple[0] + step + (tuple[1] - 1) * 12);
  const intervals = tuple[2] === 0 ? [0, 4, 7] : [0, 3, 7];
  if (tuple[3] === 1) intervals.push(11);
  if (tuple[3] === 2) intervals.push(10);
  return intervals.map((interval) => scale[interval]);
}
