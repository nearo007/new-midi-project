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

export interface StoredSettings {
  theme?: string;
  soundEnabled?: boolean;
  reverbEnabled?: boolean;
  midiInputEnabled?: boolean;
  midiOutputEnabled?: boolean;
  chordLab?: StoredChordLabSettings;
}

const STORAGE_KEY = 'midi-toolbox-settings';

export function readStoredSettings(): StoredSettings {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed as StoredSettings : {};
  } catch {
    return {};
  }
}

export function updateStoredSettings(patch: Partial<StoredSettings>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStoredSettings(), ...patch }));
}
