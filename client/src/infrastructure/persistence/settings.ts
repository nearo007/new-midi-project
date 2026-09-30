import { ref } from 'vue';
export const storageError = ref('');
export interface StoredChordLabSettings {
  chords?: unknown;
  bpm?: number;
  chordsEnabled?: boolean;
  melodyEnabled?: boolean;
  harmonyVelocityLevel?: number;
  melodyVelocityLevel?: number;
  melodyScale?: string;
  melodyKey?: number;
  melodyNotesPerChord?: number;
  melodyRegister?: string;
}

export type SoundMode = 'piano' | '8bit' | 'none';

export interface StoredSettings {
  theme?: string;
  soundMode?: SoundMode;
  soundEnabled?: boolean;
  reverbEnabled?: boolean;
  midiInputEnabled?: boolean;
  midiOutputEnabled?: boolean;
  midiInputId?: string;
  midiOutputId?: string;
  chordLab?: StoredChordLabSettings;
}

const STORAGE_KEY = 'midi-toolbox-settings';

export function readStoredSettings(): StoredSettings {
  try {
    if (typeof localStorage === 'undefined') return {};
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const raw = parsed as Record<string, unknown>;
    const result: StoredSettings = {};
    for (const field of ['theme', 'midiInputId', 'midiOutputId'] as const)
      if (typeof raw[field] === 'string') result[field] = raw[field];
    for (const field of [
      'soundEnabled',
      'reverbEnabled',
      'midiInputEnabled',
      'midiOutputEnabled',
    ] as const)
      if (typeof raw[field] === 'boolean') result[field] = raw[field];
    if (raw.soundMode === 'piano' || raw.soundMode === '8bit' || raw.soundMode === 'none')
      result.soundMode = raw.soundMode;
    if (raw.chordLab && typeof raw.chordLab === 'object' && !Array.isArray(raw.chordLab))
      result.chordLab = raw.chordLab as StoredChordLabSettings;
    return result;
  } catch {
    return {};
  }
}

export function updateStoredSettings(patch: Partial<StoredSettings>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStoredSettings(), ...patch }));
    storageError.value = '';
  } catch {
    storageError.value =
      'Changes could not be saved in this browser. Export your project to keep a copy.';
  }
}

export function storedSoundMode(settings: StoredSettings = readStoredSettings()): SoundMode {
  if (
    settings.soundMode === 'piano' ||
    settings.soundMode === '8bit' ||
    settings.soundMode === 'none'
  ) {
    return settings.soundMode;
  }

  // Migrate the original boolean preference without changing the behavior of
  // people who already chose a sound setting. New installs use piano.
  if (typeof settings.soundEnabled === 'boolean') return settings.soundEnabled ? '8bit' : 'none';
  return 'piano';
}
