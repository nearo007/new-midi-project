import { ref } from 'vue';
import { readStoredSettings, updateStoredSettings } from './settings';

const soundEnabled = ref(readStoredSettings().soundEnabled ?? false);

export function useSound() {
  return soundEnabled;
}

export function setSoundEnabled(value: boolean) {
  soundEnabled.value = value;
  updateStoredSettings({ soundEnabled: value });
}
