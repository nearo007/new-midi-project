import { chordNotes, type ChordSpec, type MelodySettings } from './music.js';
export const MAX_CHORDS = 128;
export interface PlaybackSettings {
  chords: boolean;
  melody: boolean;
  harmonyVelocity: number;
  melodyVelocity: number;
}
export interface MelodyNote {
  id: string;
  note: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  sourceChannel: number;
}
export interface TrackSettings {
  channel: number;
  volume: number;
}
export interface Project {
  schemaVersion: 1;
  generatorVersion: 1;
  id: string;
  name: string;
  bpm: number;
  chords: ChordSpec[];
  melody: MelodySettings;
  playback: PlaybackSettings;
  loop: { startId: string; endId: string } | null;
  metronome: boolean;
  countIn: boolean;
  melodyNotes: MelodyNote[] | null;
  tracks: { harmony: TrackSettings; melody: TrackSettings };
}
export class ValidationError extends Error {
  readonly status = 400;
  readonly code = 'INVALID_INPUT';
}
export function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ValidationError(`${field} must be an object`);
  return value as Record<string, unknown>;
}
export function number(
  value: unknown,
  field: string,
  min: number,
  max: number,
  integer = true,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new ValidationError(
      `${field} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}`,
    );
  }
  return value;
}
export function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ValidationError(`${field} must be a boolean`);
  return value;
}
export function text(value: unknown, field: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ValidationError(`${field} must contain 1–${max} characters`);
  return value.trim();
}
function choice<T extends string>(value: unknown, field: string, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.includes(value as T))
    throw new ValidationError(`${field} must be ${options.join(', ')}`);
  return value as T;
}
export function parseChord(value: unknown): ChordSpec {
  const c = object(value, 'chord');
  const seventh = choice(c.seventh, 'seventh', ['none', 'maj7', 'min7']);
  const chord: ChordSpec = {
    id: text(c.id, 'chord.id'),
    rootPitchClass: number(c.rootPitchClass, 'rootPitchClass', 0, 11),
    octave: number(c.octave, 'octave', 1, 7),
    quality: choice(c.quality, 'quality', ['major', 'minor']),
    seventh,
    inversion: number(c.inversion, 'inversion', 0, seventh === 'none' ? 2 : 3),
    durationBeats: number(c.durationBeats, 'durationBeats', 0.25, 16, false),
    muted: boolean(c.muted, 'muted'),
  };
  chordNotes(chord).forEach((note) => number(note, 'resulting MIDI note', 0, 127));
  return chord;
}
export function parseMelody(value: unknown): MelodySettings {
  const m = object(value, 'melody');
  const octaveMin = number(m.octaveMin, 'octaveMin', 1, 7);
  return {
    enabled: boolean(m.enabled, 'melody.enabled'),
    scale: choice(m.scale, 'scale', ['chord', 'major', 'minor', 'blues', 'chromatic']),
    key: number(m.key, 'melody.key', 1, 12),
    notesPerChord: number(m.notesPerChord, 'notesPerChord', 0, 4),
    octaveMin,
    octaveMax: number(m.octaveMax, 'octaveMax', octaveMin, 7),
    seed: number(m.seed, 'seed', 0, 0xffffffff),
  };
}
export function parsePlayback(value: unknown): PlaybackSettings {
  const p = object(value, 'playback');
  return {
    chords: boolean(p.chords, 'playback.chords'),
    melody: boolean(p.melody, 'playback.melody'),
    harmonyVelocity: number(p.harmonyVelocity ?? 100, 'harmonyVelocity', 1, 127),
    melodyVelocity: number(p.melodyVelocity ?? 88, 'melodyVelocity', 1, 127),
  };
}
export function parseProject(value: unknown): Project {
  const p = object(value, 'project');
  if (p.schemaVersion !== 1 || p.generatorVersion !== 1)
    throw new ValidationError('Unsupported project or generator version');
  if (!Array.isArray(p.chords) || p.chords.length < 1 || p.chords.length > MAX_CHORDS)
    throw new ValidationError(`A project must contain 1–${MAX_CHORDS} chords`);
  const chords = p.chords.map(parseChord);
  const ids = chords.map((chord) => chord.id);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Chord IDs must be unique');
  let loop: Project['loop'] = null;
  if (p.loop !== null && p.loop !== undefined) {
    const l = object(p.loop, 'loop');
    const startId = text(l.startId, 'loop.startId'),
      endId = text(l.endId, 'loop.endId');
    if (!ids.includes(startId) || !ids.includes(endId) || ids.indexOf(startId) > ids.indexOf(endId))
      throw new ValidationError('Invalid loop range');
    loop = { startId, endId };
  }
  const totalBeats = chords.reduce((sum, chord) => sum + chord.durationBeats, 0);
  let melodyNotes: MelodyNote[] | null = null;
  if (p.melodyNotes !== undefined && p.melodyNotes !== null) {
    if (!Array.isArray(p.melodyNotes) || p.melodyNotes.length > 2048)
      throw new ValidationError('A melody may contain at most 2048 notes');
    melodyNotes = p.melodyNotes.map((value) => {
      const n = object(value, 'melody note');
      const startBeat = number(n.startBeat, 'startBeat', 0, totalBeats - 0.001, false);
      return {
        id: text(n.id, 'note.id'),
        note: number(n.note, 'note', 0, 127),
        startBeat,
        durationBeats: number(
          n.durationBeats,
          'note duration',
          0.001,
          totalBeats - startBeat,
          false,
        ),
        velocity: number(n.velocity, 'note velocity', 1, 127),
        sourceChannel: number(n.sourceChannel ?? 0, 'source channel', 0, 15),
      };
    });
    if (new Set(melodyNotes.map((note) => note.id)).size !== melodyNotes.length)
      throw new ValidationError('Melody note IDs must be unique');
  }
  const rawTracks = p.tracks === undefined ? {} : object(p.tracks, 'tracks');
  const track = (name: string, channel: number): TrackSettings => {
    const t = rawTracks[name] === undefined ? {} : object(rawTracks[name], name);
    return {
      channel: number(t.channel ?? channel, 'channel', 0, 15),
      volume: number(t.volume ?? 1, 'volume', 0, 1, false),
    };
  };
  const tracks = { harmony: track('harmony', 0), melody: track('melody', 1) };
  if (tracks.harmony.channel === tracks.melody.channel)
    throw new ValidationError('Harmony and melody must use different MIDI channels');
  return {
    schemaVersion: 1,
    generatorVersion: 1,
    id: text(p.id, 'project.id'),
    name: text(p.name, 'name', 80),
    bpm: number(p.bpm, 'bpm', 20, 240, false),
    chords,
    melody: parseMelody(p.melody),
    playback: parsePlayback(p.playback),
    loop,
    metronome: boolean(p.metronome ?? false, 'metronome'),
    countIn: boolean(p.countIn ?? false, 'countIn'),
    melodyNotes,
    tracks,
  };
}
export function newChord(id: string): ChordSpec {
  return {
    id,
    rootPitchClass: 0,
    octave: 4,
    quality: 'major',
    seventh: 'none',
    inversion: 0,
    durationBeats: 2,
    muted: false,
  };
}
export function defaultProject(id = 'untitled', seed = 1): Project {
  return {
    schemaVersion: 1,
    generatorVersion: 1,
    id,
    name: 'Untitled project',
    bpm: 80,
    chords: [
      { ...newChord(`${id}-1`), quality: 'minor' },
      { ...newChord(`${id}-2`), rootPitchClass: 10, octave: 3 },
      { ...newChord(`${id}-3`), rootPitchClass: 8, octave: 3 },
      { ...newChord(`${id}-4`), rootPitchClass: 7, octave: 3, quality: 'minor', seventh: 'min7' },
    ],
    melody: {
      enabled: false,
      scale: 'chord',
      key: 1,
      notesPerChord: 2,
      octaveMin: 4,
      octaveMax: 5,
      seed,
    },
    playback: { chords: true, melody: false, harmonyVelocity: 96, melodyVelocity: 96 },
    loop: null,
    metronome: false,
    countIn: false,
    melodyNotes: null,
    tracks: { harmony: { channel: 0, volume: 1 }, melody: { channel: 1, volume: 1 } },
  };
}
export function legacyChord(value: unknown, id: string): ChordSpec {
  if (!Array.isArray(value) || value.length !== 5)
    throw new ValidationError('A legacy chord must have exactly five fields');
  return parseChord({
    ...newChord(id),
    rootPitchClass: number(value[0], 'noteKey', 1, 12) - 1,
    octave: value[1],
    quality: number(value[2], 'tonality', 0, 1) === 0 ? 'major' : 'minor',
    seventh: (['none', 'maj7', 'min7'] as const)[number(value[3], 'seventh', 0, 2)],
    muted: value[4],
  });
}
/** Versioned objects are the new HTTP contract; tuples remain accepted for existing callers. */
export function parseProgression(value: unknown): Project {
  const p = object(value, 'progression');
  if (p.project !== undefined) return parseProject(p.project);
  const base = defaultProject();
  if (!Array.isArray(p.chords) || !p.chords.length || p.chords.length > MAX_CHORDS)
    throw new ValidationError(`chords must contain 1–${MAX_CHORDS} entries`);
  base.chords = p.chords.map((chord, i) => legacyChord(chord, `legacy-${i}`));
  if (p.bpm !== undefined) base.bpm = number(p.bpm, 'bpm', 20, 240, false);
  if (p.melody !== undefined) base.melody = parseMelody(p.melody);
  base.playback =
    p.playback === undefined
      ? { ...base.playback, melody: base.melody.enabled }
      : parsePlayback(p.playback);
  return base;
}
export function transposeProject(project: Project, semitones: number): Project {
  number(semitones, 'semitones', -24, 24);
  return parseProject({
    ...project,
    melodyNotes:
      project.melodyNotes?.map((note) => ({ ...note, note: note.note + semitones })) ?? null,
    chords: project.chords.map((chord) => {
      const midi = 12 * (chord.octave + 1) + chord.rootPitchClass + semitones;
      return {
        ...chord,
        rootPitchClass: ((midi % 12) + 12) % 12,
        octave: Math.floor(midi / 12) - 1,
      };
    }),
    melody: {
      ...project.melody,
      key: ((((project.melody.key - 1 + semitones) % 12) + 12) % 12) + 1,
    },
  });
}
