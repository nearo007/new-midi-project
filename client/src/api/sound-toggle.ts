import { ref } from 'vue';

const soundEnabled = ref(false);

export function useSound() {
  return soundEnabled;
}

export function setSoundEnabled(value: boolean) {
  soundEnabled.value = value;
}
