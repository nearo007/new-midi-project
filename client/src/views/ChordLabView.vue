<template>
  <div class="chord-lab-view">
    <h1 class="title">Chord Lab</h1>

    <div class="controls">
      <label class="bpm-label">
        BPM: {{ bpm }}
        <input type="range" v-model.number="bpm" min="20" max="240" class="bpm-slider" />
      </label>
      <button class="ctrl-btn start" @click="handleStart" :disabled="running">
        Start
      </button>
      <button class="ctrl-btn stop" @click="handleStop" :disabled="!running">
        Stop
      </button>
    </div>

    <div class="chords-row">
      <ChordBlock
        v-for="(chord, i) in chords"
        :key="i"
        :model-value="chord"
        @update:model-value="(v: [number, number, number, number]) => chords[i] = v"
        @remove="removeChord(i)"
      />
      <button class="add-btn" @click="addChord">+</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ChordBlock from '../components/ChordBlock.vue';
import { startProgression, stopProgression } from '../api/client';

const defaultChords: [number, number, number, number][] = [
  [1, 4, 0, 0],  // C major
  [6, 4, 0, 0],  // F major
  [8, 4, 0, 0],  // G major
  [10, 4, 1, 0], // A minor
];

const chords = ref<[number, number, number, number][]>(defaultChords.map((c) => [...c] as [number, number, number, number]));
const bpm = ref(80);
const running = ref(false);

function addChord() {
  chords.value.push([1, 4, 0, 0]);
}

function removeChord(index: number) {
  if (chords.value.length > 1) {
    chords.value.splice(index, 1);
  }
}

async function handleStart() {
  try {
    await startProgression(chords.value, bpm.value);
    running.value = true;
  } catch (err) {
    console.error('Failed to start progression:', err);
  }
}

async function handleStop() {
  try {
    await stopProgression();
    running.value = false;
  } catch (err) {
    console.error('Failed to stop progression:', err);
  }
}
</script>

<style scoped>
.chord-lab-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.title {
  color: #fff;
  font-size: 1.5rem;
}

.controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.bpm-label {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bpm-slider {
  width: 120px;
  accent-color: #a855f7;
}

.ctrl-btn {
  padding: 0.5rem 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.ctrl-btn.start {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border-color: rgba(34, 197, 94, 0.3);
}

.ctrl-btn.start:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.35);
}

.ctrl-btn.stop {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}

.ctrl-btn.stop:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.35);
}

.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chords-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.add-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  font-size: 1.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2rem;
  transition: background 0.2s;
}

.add-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
</style>
