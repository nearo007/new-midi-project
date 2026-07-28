<template>
  <div class="chord-lab-view">
    <section class="page-heading">
      <div>
        <p class="eyebrow">02 / COMPOSITION</p>
        <h1 class="title">Build a <em>sequence.</em></h1>
        <p class="subtitle">Arrange harmonic ideas, set the pulse, and let the loop find its shape.</p>
      </div>
      <div class="sequence-count">
        <strong>{{ chords.length.toString().padStart(2, '0') }}</strong>
        <span>CHORD<br />SLOTS</span>
      </div>
    </section>

    <div class="controls">
      <label class="bpm-label">
        <span class="control-caption">TEMPO</span>
        <strong>{{ bpm }} <small>BPM</small></strong>
        <input type="range" v-model.number="bpm" min="20" max="240" class="bpm-slider" />
      </label>
      <div class="transport">
        <span class="transport-status" :class="{ active: running }"><i /> {{ running ? 'Looping' : 'Ready' }}</span>
        <button class="ctrl-btn start" @click="handleStart" :disabled="running">
          Start loop <span>↗</span>
        </button>
        <button class="ctrl-btn stop" @click="handleStop" :disabled="!running">
          Stop
        </button>
      </div>
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
import { ref, onUnmounted, watch } from 'vue';
import ChordBlock from '../components/ChordBlock.vue';
import type { ChordData } from '../components/ChordBlock.vue';
import { startProgression, updateProgression, stopProgression, getProgressionStatus } from '../api/client';
import { useSound } from '../api/sound-toggle';
import { playChord } from '../api/audio';
import { chordTupleToNotes } from '../api/chord-builder';

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
const soundOn = useSound();

let dragIndex = -1;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let updateTimer: ReturnType<typeof setTimeout> | null = null;
let lastPlayedChord = -1;

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

onUnmounted(() => {
  stopPolling();
  if (updateTimer) clearTimeout(updateTimer);
});

watch(chords, () => {
  if (!running.value) return;
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    updateTimer = null;
    try {
      await updateProgression(chords.value);
    } catch {
      // The loop may have stopped between the edit and the update request.
    }
  }, 80);
}, { deep: true });

watch(currentChord, (idx) => {
  if (idx === -1 || idx === lastPlayedChord) return;
  lastPlayedChord = idx;
  if (soundOn.value && idx >= 0 && idx < chords.value.length) {
    const tuple = chords.value[idx];
    if (!tuple[4]) {
      const notes = chordTupleToNotes(tuple);
      const interval = 60 / bpm.value / 0.5;
      playChord(notes, interval * 0.9);
    }
  }
});

watch(running, (val) => {
  if (!val) lastPlayedChord = -1;
});

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
  gap: clamp(2rem, 5vw, 4rem);
  width: 100%;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
}

.eyebrow {
  color: var(--coral);
  font-size: 0.65rem;
  font-weight: 850;
  letter-spacing: 0.16em;
}

.title {
  color: var(--text);
  font-size: clamp(2.7rem, 7vw, 6.5rem);
  line-height: 0.95;
  letter-spacing: -0.08em;
  margin: 0.65rem 0 1rem;
}

.title em {
  color: var(--coral);
  font-style: normal;
}

.subtitle {
  color: var(--muted);
  font-size: 0.95rem;
  max-width: 29rem;
  line-height: 1.6;
}

.sequence-count {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--muted);
  border-left: 1px solid var(--line-strong);
  padding: 0.75rem 0 0.75rem 1rem;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.sequence-count strong {
  color: var(--text);
  font-size: 2.5rem;
  line-height: 1;
  letter-spacing: -0.08em;
}

.controls {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1rem 1.2rem;
  background: var(--surface);
  border: 1px solid var(--line);
}

.bpm-label {
  display: grid;
  grid-template-columns: auto auto;
  align-items: baseline;
  column-gap: 0.65rem;
  min-width: min(100%, 22rem);
  color: var(--text);
  font-size: 0.9rem;
}

.control-caption {
  color: var(--muted);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.bpm-label strong {
  font-size: 1.1rem;
}

.bpm-label small {
  color: var(--muted);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
}

.bpm-label input {
  grid-column: 1 / -1;
  margin-top: 0.7rem;
}

.transport {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.transport-status {
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.transport-status i {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-right: 0.3rem;
  border-radius: 50%;
  background: var(--line-strong);
}

.transport-status.active {
  color: var(--acid);
}

.transport-status.active i {
  background: var(--acid);
  box-shadow: 0 0 0 3px rgba(216, 255, 85, 0.12);
}

.bpm-slider {
  width: 180px;
  accent-color: var(--coral);
}

.ctrl-btn {
  padding: 0.65rem 1rem;
  border: 1px solid var(--line);
  border-radius: 3px;
  cursor: pointer;
  font-weight: 800;
  font-size: 0.72rem;
  transition: background 0.2s, transform 0.2s, opacity 0.2s;
}

.ctrl-btn.start {
  background: var(--coral);
  color: #21100c;
  border-color: var(--coral);
}

.ctrl-btn.start:hover:not(:disabled) {
  background: #ff8b78;
  transform: translateY(-1px);
}

.ctrl-btn.start span {
  margin-left: 0.4rem;
  font-size: 0.9rem;
}

.ctrl-btn.stop {
  background: transparent;
  color: var(--muted);
}

.ctrl-btn.stop:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-soft);
}

.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chords-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.add-btn {
  width: 116px;
  min-height: 220px;
  border-radius: 3px;
  background: transparent;
  color: var(--muted);
  border: 1px dashed var(--line-strong);
  font-size: 1.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.add-btn:hover {
  background: var(--surface-raised);
  border-color: var(--acid);
  color: var(--acid);
}

@media (max-width: 700px) {
  .page-heading,
  .controls {
    align-items: flex-start;
    flex-direction: column;
  }

  .sequence-count {
    border-left: 0;
    border-top: 1px solid var(--line-strong);
    width: 100%;
    padding: 1rem 0 0;
  }

  .transport {
    justify-content: flex-start;
  }
}
</style>
