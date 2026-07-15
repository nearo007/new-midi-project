<template>
  <div class="piano-container">
    <div class="piano">
      <PianoKey
        v-for="key in keys"
        :key="key.midi"
        :midi-note="key.midi"
        :is-black="key.black"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PianoKey from './PianoKey.vue';

const NOTE_IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

interface PianoKeyInfo {
  midi: number;
  black: boolean;
}

const keys = computed<PianoKeyInfo[]>(() => {
  const result: PianoKeyInfo[] = [];
  for (let midi = 21; midi <= 108; midi++) {
    const semitone = (midi - 21) % 12;
    result.push({ midi, black: NOTE_IS_BLACK[semitone] });
  }
  return result;
});
</script>

<style scoped>
.piano-container {
  overflow-x: auto;
  padding: 1rem 0;
}

.piano {
  display: flex;
  position: relative;
  margin: 0 auto;
  width: fit-content;
}
</style>
