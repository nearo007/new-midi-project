<template>
  <div class="piano-container">
    <div class="piano">
      <PianoKey
        v-for="key in keys"
        :key="key.midi"
        :midi-note="key.midi"
        :is-black="key.black"
        :label="key.label"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PianoKey from './PianoKey.vue';

const NOTE_IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface PianoKeyInfo {
  midi: number;
  black: boolean;
  label: string;
}

const keys = computed<PianoKeyInfo[]>(() => {
  const result: PianoKeyInfo[] = [];
  for (let midi = 21; midi <= 108; midi++) {
    const semitone = (midi - 21) % 12;
    const octave = Math.floor(midi / 12) - 1;
    result.push({ midi, black: NOTE_IS_BLACK[semitone], label: `${NOTE_NAMES[midi % 12]}${octave}` });
  }
  return result;
});
</script>

<style scoped>
.piano-container {
  overflow-x: auto;
  padding: 0.75rem 0 0.5rem;
}

.piano {
  display: flex;
  position: relative;
  margin: 0 auto;
  width: fit-content;
  min-width: max-content;
  padding: 0.9rem 0.75rem 0.75rem;
  background: #0b0d10;
  border: 1px solid #303640;
  border-radius: 3px;
}
</style>
