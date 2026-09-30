import { computed, ref } from 'vue';
import {
  readStoredSettings,
  storedSoundMode,
  updateStoredSettings,
  type SoundMode,
} from '../infrastructure/persistence/settings';

const storedSettings = readStoredSettings();
const initialSoundMode = storedSoundMode(storedSettings);
if (storedSettings.soundMode === undefined && typeof storedSettings.soundEnabled === 'boolean') {
  updateStoredSettings({ soundMode: initialSoundMode });
}
const soundMode = ref<SoundMode>(initialSoundMode);
const soundEnabled = computed(() => soundMode.value !== 'none');

export function useSound() {
  return soundEnabled;
}

export function useSoundMode() {
  return soundMode;
}

export function setSoundMode(value: SoundMode): void {
  soundMode.value = value;
  updateStoredSettings({ soundMode: value, soundEnabled: value !== 'none' });
}

export function setSoundEnabled(value: boolean): void {
  setSoundMode(value ? '8bit' : 'none');
}
