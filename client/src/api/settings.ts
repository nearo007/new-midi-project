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

export function storedSoundMode(settings: StoredSettings = readStoredSettings()): SoundMode {
  if (settings.soundMode === 'piano' || settings.soundMode === '8bit' || settings.soundMode === 'none') {
    return settings.soundMode;
  }

  // Migrate the original boolean preference without changing the behavior of
  // people who already chose a sound setting. New installs use piano.
  if (typeof settings.soundEnabled === 'boolean') return settings.soundEnabled ? '8bit' : 'none';
  return 'piano';
}
