import { computed, ref, shallowRef } from 'vue';
import {
  defaultProject,
  parseProject,
  legacyChord,
  newChord,
  transposeProject,
  compileProject,
  MAX_CHORDS,
  type Project,
  type ChordSpec,
  type MelodyNote,
} from '@midi-toolbox/core';
import { readStoredSettings } from '../../infrastructure/persistence/settings';
const STORAGE_KEY = 'midi-toolbox-projects-v1';
export const editorError = ref('');
export const saveState = ref<'saved' | 'saving' | 'error'>('saved');
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const fresh = () => defaultProject(crypto.randomUUID(), seed());
const clone = (value: Project): Project => JSON.parse(JSON.stringify(value));
function migrate(): Project {
  const project = fresh(),
    old = readStoredSettings().chordLab;
  if (!old) return project;
  const bounded = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(Math.min(max, Math.max(min, value)))
      : fallback;
  if (Array.isArray(old.chords)) {
    const chords: ChordSpec[] = [];
    for (const value of old.chords.slice(0, MAX_CHORDS)) {
      try {
        chords.push(legacyChord(value, crypto.randomUUID()));
      } catch {
        /* Retain the valid part of legacy state. */
      }
    }
    if (chords.length) project.chords = chords;
  }
  project.bpm = bounded(old.bpm, 80, 20, 240);
  project.playback.chords = typeof old.chordsEnabled === 'boolean' ? old.chordsEnabled : true;
  project.melody.enabled = project.playback.melody = old.melodyEnabled === true;
  project.playback.harmonyVelocity = bounded(old.harmonyVelocityLevel, 4, 1, 5) * 24;
  project.playback.melodyVelocity = bounded(old.melodyVelocityLevel, 4, 1, 5) * 24;
  if (['chord', 'major', 'minor', 'blues', 'chromatic'].includes(old.melodyScale ?? ''))
    project.melody.scale = old.melodyScale as Project['melody']['scale'];
  project.melody.key = bounded(old.melodyKey, 1, 1, 12);
  project.melody.notesPerChord = bounded(old.melodyNotesPerChord, 2, 0, 4);
  const min = old.melodyRegister === 'low' ? 3 : old.melodyRegister === 'high' ? 5 : 4;
  project.melody.octaveMin = min;
  project.melody.octaveMax = min + 1;
  return parseProject(project);
}
function restore(): { current: Project; library: Project[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { current: migrate(), library: [] };
    const saved = JSON.parse(raw);
    const library: Project[] = [];
    if (Array.isArray(saved.library))
      for (const item of saved.library) {
        try {
          library.push(parseProject(item));
        } catch {
          editorError.value = 'Some invalid saved projects could not be restored.';
        }
      }
    try {
      return { current: parseProject(saved.current), library };
    } catch {
      editorError.value =
        'The current project could not be restored. Your valid library projects are still available.';
      return { current: fresh(), library };
    }
  } catch {
    editorError.value = 'Saved data could not be restored. You can import a project backup.';
    return { current: fresh(), library: [] };
  }
}
const initial = restore();
export const project = shallowRef(initial.current);
export const library = shallowRef(initial.library);
const past = shallowRef<Project[]>([]),
  future = shallowRef<Project[]>([]);
export const canUndo = computed(() => past.value.length > 0),
  canRedo = computed(() => future.value.length > 0);
export const totalBeats = computed(() =>
  project.value.chords.reduce((sum, c) => sum + c.durationBeats, 0),
);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let previousGroup = '',
  previousEdit = 0;
export function flushProject(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ current: project.value, library: library.value }),
    );
    saveState.value = 'saved';
  } catch {
    saveState.value = 'error';
    editorError.value = 'Storage is full or unavailable. Export your project to keep a copy.';
  }
}
function saveSoon(): void {
  saveState.value = 'saving';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushProject, 250);
}
export function editProject(change: (draft: Project) => void, group = ''): boolean {
  try {
    const draft = clone(project.value);
    change(draft);
    const ids = draft.chords.map((c) => c.id);
    if (
      draft.loop &&
      (!ids.includes(draft.loop.startId) ||
        !ids.includes(draft.loop.endId) ||
        ids.indexOf(draft.loop.startId) > ids.indexOf(draft.loop.endId))
    )
      draft.loop = null;
    const length = draft.chords.reduce((sum, c) => sum + c.durationBeats, 0);
    if (draft.melodyNotes)
      draft.melodyNotes = draft.melodyNotes
        .filter((n) => n.startBeat < length)
        .map((n) => ({ ...n, durationBeats: Math.min(n.durationBeats, length - n.startBeat) }));
    const validated = parseProject(draft);
    if (JSON.stringify(validated) === JSON.stringify(project.value)) return false;
    const now = performance.now();
    if (!group || group !== previousGroup || now - previousEdit > 500)
      past.value = [...past.value.slice(-99), clone(project.value)];
    previousGroup = group;
    previousEdit = now;
    future.value = [];
    project.value = validated;
    editorError.value = '';
    saveSoon();
    return true;
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : String(error);
    return false;
  }
}
export function undo(): void {
  const previous = past.value.at(-1);
  if (!previous) return;
  future.value = [...future.value, clone(project.value)];
  past.value = past.value.slice(0, -1);
  project.value = previous;
  previousGroup = '';
  saveSoon();
}
export function redo(): void {
  const next = future.value.at(-1);
  if (!next) return;
  past.value = [...past.value, clone(project.value)];
  future.value = future.value.slice(0, -1);
  project.value = next;
  previousGroup = '';
  saveSoon();
}
export function updateChord(id: string, value: ChordSpec): void {
  editProject((p) => {
    const i = p.chords.findIndex((c) => c.id === id);
    if (i >= 0) p.chords[i] = value;
  }, `chord:${id}`);
}
export function addChord(): void {
  editProject((p) => {
    if (p.chords.length >= MAX_CHORDS) throw new Error(`Maximum ${MAX_CHORDS} chords`);
    p.chords.push(newChord(crypto.randomUUID()));
  });
}
export function removeChord(id: string): void {
  editProject((p) => {
    if (p.chords.length === 1) return;
    p.chords = p.chords.filter((c) => c.id !== id);
  });
}
export function moveChord(id: string, delta: number): void {
  editProject((p) => {
    const i = p.chords.findIndex((c) => c.id === id),
      target = i + delta;
    if (i < 0 || target < 0 || target >= p.chords.length) return;
    const [chord] = p.chords.splice(i, 1);
    p.chords.splice(target, 0, chord);
  });
}
export function transpose(semitones: number): void {
  editProject((p) => Object.assign(p, transposeProject(p, semitones)));
}
export function regenerate(): void {
  editProject((p) => {
    p.melody.seed = seed();
    p.melodyNotes = null;
  });
}
export function changeMelody(change: (draft: Project['melody']) => void): void {
  editProject((p) => {
    change(p.melody);
    p.playback.melody = p.melody.enabled;
    p.melody.seed = seed();
    p.melodyNotes = null;
  }, 'melody');
}
export function createProject(): void {
  editProject((p) => Object.assign(p, fresh()));
}
export function duplicateProject(): void {
  editProject((p) => {
    p.id = crypto.randomUUID();
    p.name = `${p.name.slice(0, 70)} (copy)`;
  });
  saveNamedProject();
}
export function saveNamedProject(): void {
  library.value = [
    ...library.value.filter((item) => item.id !== project.value.id),
    clone(project.value),
  ];
  flushProject();
}
export function loadProject(id: string): void {
  const saved = library.value.find((p) => p.id === id);
  if (saved) editProject((p) => Object.assign(p, clone(saved)));
}
export function deleteSavedProject(id: string): void {
  library.value = library.value.filter((p) => p.id !== id);
  flushProject();
}
export function importProject(text: string): void {
  if (text.length > 1024 * 1024) throw new Error('Project files must be smaller than 1 MB');
  const parsed = parseProject(JSON.parse(text));
  editProject((p) => Object.assign(p, parsed));
}
export const PRESETS = [
  { id: 'minor', name: 'Minor journey' },
  { id: 'pop', name: 'Pop · I–V–vi–IV' },
  { id: 'jazz', name: 'Jazz · ii–V–I' },
];
export function applyPreset(id: string, append = false): void {
  const chords =
    id === 'pop'
      ? [
          { root: 0, q: 'major' },
          { root: 7, q: 'major' },
          { root: 9, q: 'minor' },
          { root: 5, q: 'major' },
        ]
      : id === 'jazz'
        ? [
            { root: 2, q: 'minor' },
            { root: 7, q: 'major' },
            { root: 0, q: 'major' },
          ]
        : null;
  const values = chords
    ? chords.map((c, i) => ({
        ...newChord(crypto.randomUUID()),
        rootPitchClass: c.root,
        quality: c.q as ChordSpec['quality'],
        seventh:
          id === 'jazz' ? ((i === 2 ? 'maj7' : 'min7') as ChordSpec['seventh']) : ('none' as const),
      }))
    : fresh().chords;
  editProject((p) => {
    p.chords = append ? [...p.chords, ...values] : values;
    if (!append) {
      p.melodyNotes = null;
      p.loop = null;
    }
  });
}
export function materializeMelody(): void {
  if (project.value.melodyNotes !== null) return;
  editProject((p) => {
    const enabled = {
      ...p,
      playback: { ...p.playback, melody: true },
      melody: { ...p.melody, enabled: true },
      tracks: { ...p.tracks, melody: { ...p.tracks.melody, volume: 1 } },
    };
    const sequence = compileProject(enabled, false);
    let beat = 0;
    const notes: MelodyNote[] = [];
    for (const step of sequence.steps) {
      for (const event of step.events.filter((e) => e.track === 'melody'))
        notes.push({
          id: crypto.randomUUID(),
          note: event.note,
          startBeat: beat + event.startBeat,
          durationBeats: event.durationBeats,
          velocity: p.playback.melodyVelocity,
          sourceChannel: event.channel,
        });
      beat += step.durationBeats;
    }
    p.melodyNotes = notes;
    p.playback.melody = p.melody.enabled = true;
  });
}
export function quantizeMelody(grid: number): void {
  editProject((p) => {
    if (!p.melodyNotes) return;
    const end = p.chords.reduce((s, c) => s + c.durationBeats, 0);
    p.melodyNotes = p.melodyNotes.map((n) => {
      const startBeat = Math.min(end - grid, Math.round(n.startBeat / grid) * grid);
      return {
        ...n,
        startBeat: Math.max(0, startBeat),
        durationBeats: Math.min(
          end - Math.max(0, startBeat),
          Math.max(grid, Math.round(n.durationBeats / grid) * grid),
        ),
      };
    });
  });
}
