import type { ScaleMode } from './scale.js';

export type MelodyScale = 'chord' | ScaleMode;

export interface MelodySettings {
  enabled: boolean;
  scale: MelodyScale;
  key: number;
  notesPerChord: number;
  octaveMin: number;
  octaveMax: number;
  seed: number;
}

export interface MelodyChord {
  notes: number[];
}

const SCALE_OFFSETS: Record<Exclude<MelodyScale, 'chord'>, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: Array.from({ length: 12 }, (_, index) => index),
};

const MELODY_SCALES: MelodyScale[] = ['chord', 'major', 'minor', 'blues', 'chromatic'];

export function validateMelodySettings(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'melody must be an object';

  const settings = value as Partial<MelodySettings>;
  if (typeof settings.enabled !== 'boolean') return 'melody.enabled must be a boolean';
  if (typeof settings.scale !== 'string' || !MELODY_SCALES.includes(settings.scale as MelodyScale)) {
    return 'melody.scale must be chord, major, minor, blues, or chromatic';
  }
  if (!Number.isInteger(settings.key) || settings.key! < 1 || settings.key! > 12) {
    return 'melody.key must be an integer from 1 to 12';
  }
  if (!Number.isInteger(settings.notesPerChord) || settings.notesPerChord! < 0 || settings.notesPerChord! > 4) {
    return 'melody.notesPerChord must be an integer from 0 to 4';
  }
  if (!Number.isInteger(settings.octaveMin) || settings.octaveMin! < 1 || settings.octaveMin! > 7) {
    return 'melody.octaveMin must be an integer from 1 to 7';
  }
  if (!Number.isInteger(settings.octaveMax) || settings.octaveMax! < 1 || settings.octaveMax! > 7) {
    return 'melody.octaveMax must be an integer from 1 to 7';
  }
  if (settings.octaveMax! < settings.octaveMin!) {
    return 'melody.octaveMax must be greater than or equal to octaveMin';
  }
  if (!Number.isSafeInteger(settings.seed)) return 'melody.seed must be a safe integer';
  return null;
}

function random01(seed: number): () => number {
  // Mulberry32 is small, deterministic, and produces enough variation for a
  // playful melody without pulling randomness into the request or player.
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function registerBounds(octaveMin: number, octaveMax: number): [number, number] {
  return [12 * (octaveMin + 1), 12 * (octaveMax + 1) + 11];
}

function scaleCandidates(settings: MelodySettings): number[] {
  const [minimum, maximum] = registerBounds(settings.octaveMin, settings.octaveMax);
  const offsets = SCALE_OFFSETS[settings.scale as Exclude<MelodyScale, 'chord'>];
  const rootPitchClass = settings.key - 1;
  const candidates: number[] = [];

  for (let octave = settings.octaveMin - 1; octave <= settings.octaveMax; octave += 1) {
    const root = 12 * (octave + 1) + rootPitchClass;
    for (const offset of offsets) {
      const note = root + offset;
      if (note >= minimum && note <= maximum && note <= 127) candidates.push(note);
    }
  }

  return [...new Set(candidates)].sort((a, b) => a - b);
}

function chordCandidates(chord: MelodyChord, settings: MelodySettings): number[] {
  const [minimum, maximum] = registerBounds(settings.octaveMin, settings.octaveMax);
  const candidates = new Set<number>();

  for (const originalNote of chord.notes) {
    if (!Number.isInteger(originalNote)) continue;
    let note = originalNote;
    while (note < minimum) note += 12;
    while (note > maximum) note -= 12;
    // Keep the line above the sustained chord when the selected register
    // contains more than one occurrence of the chord tone. Sending the same
    // MIDI pitch twice can be collapsed by hardware synths into one voice.
    while (note + 12 <= maximum) note += 12;
    if (note >= minimum && note <= maximum && note <= 127) candidates.add(note);
  }

  return [...candidates].sort((a, b) => a - b);
}

function chooseNotes(candidates: number[], count: number, random: () => number, firstPrevious = -1): number[] {
  if (count === 0 || candidates.length === 0) return [];
  const notes: number[] = [];
  let previous = firstPrevious;

  for (let index = 0; index < count; index += 1) {
    const available = candidates.length > 1
      ? candidates.filter((note) => note !== previous)
      : candidates;
    const note = available[Math.floor(random() * available.length)];
    notes.push(note);
    previous = note;
  }

  return notes;
}

/** Generate one deterministic list of melody notes for each chord. */
export function generateMelody(chords: MelodyChord[], settings: MelodySettings): number[][] {
  if (!settings.enabled || settings.notesPerChord === 0) {
    return chords.map(() => []);
  }

  const random = random01(settings.seed);
  const fallback = scaleCandidates({ ...settings, scale: 'chromatic' });
  let previous = -1;

  return chords.map((chord) => {
    const candidates = settings.scale === 'chord'
      ? chordCandidates(chord, settings)
      : scaleCandidates(settings);
    const notes = chooseNotes(candidates.length > 0 ? candidates : fallback, settings.notesPerChord, random, previous);
    if (notes.length > 0) previous = notes[notes.length - 1];
    return notes;
  });
}
