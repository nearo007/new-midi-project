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
        :index="i"
        :active="currentChord === i"
        @update:model-value="(v: ChordData) => chords[i] = v"
        @remove="removeChord(i)"
        @drag-start="onDragStart"
        @drag-over="onDragOver"
        @drag-drop="onDragDrop"
        @drag-end="onDragEnd"
      />
      <button class="add-btn" @click="addChord">+</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import ChordBlock from '../components/ChordBlock.vue';
import type { ChordData } from '../components/ChordBlock.vue';
import { startProgression, stopProgression, getProgressionStatus } from '../api/client';

const defaultChords: ChordData[] = [
  [1, 4, 1, 0, false],   // Cm
  [11, 3, 0, 0, false],  // A#
  [9, 3, 0, 0, false],   // G#
  [8, 3, 1, 2, false],   // Gm7
];

const chords = ref<ChordData[]>(defaultChords.map((c) => [...c] as ChordData));
const bpm = ref(80);
const running = ref(false);
const currentChord = ref(-1);

let dragIndex = -1;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const status = await getProgressionStatus();
      currentChord.value = status.currentChord;
      if (!status.playing && running.value) {
        running.value = false;
        currentChord.value = -1;
        stopPolling();
      }
    } catch {
      // ignore polling errors
    }
  }, 150);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onUnmounted(stopPolling);

function addChord() {
  chords.value.push([1, 4, 0, 0, false]);
}

function removeChord(index: number) {
  if (chords.value.length > 1) {
    chords.value.splice(index, 1);
  }
}

function onDragStart(index: number) {
  dragIndex = index;
}

function onDragOver(_index: number) {}

function onDragDrop(targetIndex: number) {
  if (dragIndex === -1 || dragIndex === targetIndex) return;
  const item = chords.value.splice(dragIndex, 1)[0];
  chords.value.splice(targetIndex, 0, item);
  dragIndex = -1;
}

function onDragEnd() {
  dragIndex = -1;
}

async function handleStart() {
  try {
    await startProgression(chords.value, bpm.value);
    running.value = true;
    startPolling();
  } catch (err) {
    console.error('Failed to start progression:', err);
  }
}

async function handleStop() {
  try {
    await stopProgression();
    running.value = false;
    currentChord.value = -1;
    stopPolling();
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
