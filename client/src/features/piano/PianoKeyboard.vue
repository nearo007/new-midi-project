<template>
  <div ref="pianoContainer" class="piano-container">
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
import { computed, onMounted, ref } from 'vue';
import PianoKey from './PianoKey.vue';

const NOTE_IS_BLACK = [
  false,
  true,
  false,
  true,
  false,
  false,
  true,
  false,
  true,
  false,
  true,
  false,
];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pianoContainer = ref<HTMLElement | null>(null);

interface PianoKeyInfo {
  midi: number;
  black: boolean;
  label: string;
}

const keys = computed<PianoKeyInfo[]>(() => {
  const result: PianoKeyInfo[] = [];
  for (let midi = 21; midi <= 108; midi++) {
    const semitone = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    result.push({
      midi,
      black: NOTE_IS_BLACK[semitone],
      label: `${NOTE_NAMES[midi % 12]}${octave}`,
    });
  }
  return result;
});

onMounted(() => {
  const container = pianoContainer.value;
  if (!container) return;
  container.scrollLeft = Math.max(0, (container.scrollWidth - container.clientWidth) / 2);
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
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 3px;
}
</style>
