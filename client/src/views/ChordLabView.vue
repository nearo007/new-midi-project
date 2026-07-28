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
        <span class="transport-status" :class="{ active: running }"><i /> {{ running ? playModeLabel : 'Ready' }}</span>
        <button class="ctrl-btn start" @click="handleStart" :disabled="running || !hasPlayableSource">
          Play selected <span>↗</span>
        </button>
        <button class="ctrl-btn stop" @click="handleStop" :disabled="!running">
          Stop
        </button>
      </div>
    </div>

    <div class="lab-grid">
    <section class="chords-panel" :class="{ enabled: chordsEnabled }">
      <div class="panel-heading">
        <div>
          <p class="control-caption">CHORD FOUNDATION</p>
          <h2>Build the <em>shape.</em></h2>
        </div>
        <label class="source-toggle">
          <input v-model="chordsEnabled" type="checkbox" />
          <span class="toggle-track"><i /></span>
          <span>Play chords</span>
        </label>
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
    </section>

    <section class="melody-panel" :class="{ enabled: melodyEnabled }">
      <div class="melody-heading">
        <div>
          <p class="control-caption">MELODY LAB</p>
          <h2>Let it <em>wander.</em></h2>
          <p class="melody-description">A tiny seeded melody that follows each chord and changes at the next loop step.</p>
        </div>
        <div class="melody-heading-actions">
          <label class="source-toggle melody-source-toggle">
            <input v-model="melodyEnabled" type="checkbox" />
            <span class="toggle-track"><i /></span>
            <span>Play melody</span>
          </label>
          <div class="melody-indicator">
            <span class="melody-light" />
            <strong>{{ melodyEnabled ? 'Melody active' : 'Melody off' }}</strong>
            <small>{{ melodyEnabled ? `${melodyNotesPerChord} note${melodyNotesPerChord === 1 ? '' : 's'} / chord` : 'Chords only' }}</small>
          </div>
        </div>
      </div>
      <div class="melody-controls">
        <label class="melody-field">
          <span class="control-caption">SCALE</span>
          <select v-model="melodyScale" class="melody-select">
            <option value="chord">Chord tones</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
            <option value="blues">Blues</option>
            <option value="chromatic">Chromatic</option>
          </select>
        </label>
        <label class="melody-field">
          <span class="control-caption">KEY</span>
          <select v-model.number="melodyKey" class="melody-select">
            <option v-for="key in KEY_OPTIONS" :key="key.value" :value="key.value">{{ key.label }}</option>
          </select>
        </label>
        <label class="melody-field notes-field">
          <span class="control-caption">NOTES / CHORD <strong>{{ melodyNotesPerChord }}</strong></span>
          <input v-model.number="melodyNotesPerChord" type="range" min="0" max="4" step="1" class="melody-slider" />
        </label>
        <div class="melody-field register-field">
          <span class="control-caption">REGISTER</span>
          <div class="register-options">
            <label v-for="register in REGISTER_OPTIONS" :key="register.value" class="register-option">
              <input v-model="melodyRegister" type="radio" :value="register.value" />
              <span>{{ register.label }}</span>
              <small>{{ register.octaves }}</small>
            </label>
          </div>
        </div>
        <button class="generate-btn" @click="generateNewMelody">
          Generate <span>✦</span>
        </button>
      </div>
    </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue';
import ChordBlock from '../components/ChordBlock.vue';
import type { ChordData } from '../components/ChordBlock.vue';
import {
  startProgression,
  updateProgression,
  stopProgression,
  getProgressionStatus,
  type PlaybackSettings,
} from '../api/client';
import { useSound } from '../api/sound-toggle';
import { playChordWithMelody } from '../api/audio';
import { chordTupleToNotes } from '../api/chord-builder';
import { generateMelody, type MelodyRegister, type MelodyScale, type MelodySettings } from '../api/melody';

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
const chordsEnabled = ref(true);

const KEY_OPTIONS = [
  { value: 1, label: 'C' }, { value: 2, label: 'C#' }, { value: 3, label: 'D' },
  { value: 4, label: 'D#' }, { value: 5, label: 'E' }, { value: 6, label: 'F' },
  { value: 7, label: 'F#' }, { value: 8, label: 'G' }, { value: 9, label: 'G#' },
  { value: 10, label: 'A' }, { value: 11, label: 'A#' }, { value: 12, label: 'B' },
];

const REGISTER_OPTIONS: { value: MelodyRegister; label: string; octaves: string }[] = [
  { value: 'low', label: 'Low', octaves: '3–4' },
  { value: 'mid', label: 'Mid', octaves: '4–5' },
  { value: 'high', label: 'High', octaves: '5–6' },
];

const melodyEnabled = ref(false);
const melodyScale = ref<MelodyScale>('chord');
const melodyKey = ref(1);
const melodyNotesPerChord = ref(2);
const melodyRegister = ref<MelodyRegister>('mid');
const melodySeed = ref(createSeed());

const melodySettings = computed<MelodySettings>(() => {
  const register = REGISTER_OPTIONS.find((option) => option.value === melodyRegister.value) ?? REGISTER_OPTIONS[1];
  return {
    enabled: melodyEnabled.value,
    scale: melodyScale.value,
    key: melodyKey.value,
    notesPerChord: melodyNotesPerChord.value,
    octaveMin: Number(register.octaves.split('–')[0]),
    octaveMax: Number(register.octaves.split('–')[1]),
    seed: melodySeed.value,
  };
});

const playback = computed<PlaybackSettings>(() => ({
  chords: chordsEnabled.value,
  melody: melodyEnabled.value,
}));
const hasPlayableSource = computed(() => chordsEnabled.value || melodyEnabled.value);
const playModeLabel = computed(() => {
  if (chordsEnabled.value && melodyEnabled.value) return 'Chords + melody';
  return chordsEnabled.value ? 'Chords only' : 'Melody only';
});

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
  }, 30);
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

function queueProgressionUpdate() {
  if (!running.value) return;
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    updateTimer = null;
    try {
      await updateProgression(chords.value, melodySettings.value, playback.value, bpm.value);
    } catch {
      // The loop may have stopped between the edit and the update request.
    }
  }, 80);
}

watch(chords, queueProgressionUpdate, { deep: true });

watch(chordsEnabled, queueProgressionUpdate);
watch(bpm, queueProgressionUpdate);

watch([melodyEnabled, melodyScale, melodyKey, melodyNotesPerChord, melodyRegister], () => {
  // A restriction change is an explicit new idea; chord edits keep using this
  // seed so their melody remains predictable while the loop is running.
  melodySeed.value = createSeed();
  queueProgressionUpdate();
});

watch(currentChord, (idx) => {
  if (idx === -1 || idx === lastPlayedChord) return;
  lastPlayedChord = idx;
  if (soundOn.value && idx >= 0 && idx < chords.value.length) {
    const tuple = chords.value[idx];
    const notes = !chordsEnabled.value || tuple[4] ? [] : chordTupleToNotes(tuple);
    const melody = melodySettings.value.enabled
      ? generateMelody(chords.value, melodySettings.value)[idx] ?? []
      : [];
    const interval = 60 / bpm.value / 0.5;
    playChordWithMelody(notes, melody, interval);
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
    await startProgression(chords.value, bpm.value, melodySettings.value, playback.value);
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

function createSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? Date.now();
  }
  return Date.now();
}

function generateNewMelody() {
  melodySeed.value = createSeed();
  queueProgressionUpdate();
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

.lab-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(23rem, 0.85fr);
  align-items: stretch;
  gap: 1rem;
}

.chords-panel {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  min-width: 0;
  padding: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line-strong);
}

.chords-panel.enabled {
  border-left-color: var(--coral);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.panel-heading h2 {
  margin-top: 0.35rem;
  font-size: 1.6rem;
  letter-spacing: -0.06em;
}

.panel-heading h2 em {
  color: var(--coral);
  font-style: normal;
}

.source-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--text);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.source-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.source-toggle input:checked + .toggle-track i {
  transform: translateX(0.85rem);
  background: var(--coral);
}

.melody-panel {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  padding: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line-strong);
  transition: border-color 0.2s, background 0.2s;
}

.chords-panel .chords-row {
  flex: 1;
}

.melody-panel.enabled {
  border-left-color: var(--acid);
  background: linear-gradient(110deg, #1b211e, var(--surface));
}

.melody-heading,
.melody-controls {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.melody-heading {
  justify-content: space-between;
}

.melody-heading-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.7rem;
  min-width: max-content;
}

.melody-heading h2 {
  margin-top: 0.35rem;
  font-size: 1.6rem;
  letter-spacing: -0.06em;
}

.melody-heading h2 em {
  color: var(--acid);
  font-style: normal;
}

.melody-description {
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.78rem;
}

.melody-indicator {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  column-gap: 0.45rem;
  min-width: max-content;
  color: var(--muted);
  font-size: 0.72rem;
}

.melody-indicator strong {
  color: var(--text);
}

.melody-indicator small {
  grid-column: 2;
  color: var(--muted);
  font-size: 0.62rem;
}

.melody-light {
  grid-row: span 2;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--line-strong);
}

.enabled .melody-light {
  background: var(--acid);
  box-shadow: 0 0 0 4px rgba(216, 255, 85, 0.1);
}

.melody-source-toggle input:checked + .toggle-track i {
  background: var(--acid);
}

.melody-controls {
  align-items: flex-end;
  flex-wrap: wrap;
}

.melody-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  align-self: center;
  color: var(--text);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.melody-toggle input,
.register-option input {
  accent-color: var(--acid);
}

.toggle-track {
  display: inline-flex;
  align-items: center;
  width: 2rem;
  height: 1.1rem;
  padding: 0.15rem;
  border-radius: 999px;
  background: var(--surface-soft);
  border: 1px solid var(--line-strong);
}

.toggle-track i {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--muted);
  transition: transform 0.2s, background 0.2s;
}

.melody-toggle input:checked + .toggle-track i {
  transform: translateX(0.85rem);
  background: var(--acid);
}

.melody-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.melody-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 7.5rem;
}

.melody-select {
  min-width: 7.5rem;
  padding: 0.42rem 0.5rem;
  background: var(--surface-raised);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 2px;
  font-size: 0.72rem;
}

.notes-field {
  min-width: 9rem;
}

.notes-field .control-caption strong {
  color: var(--acid);
  float: right;
}

.melody-slider {
  accent-color: var(--acid);
  width: 9rem;
}

.register-field {
  min-width: 14rem;
}

.register-options {
  display: flex;
  gap: 0.45rem;
}

.register-option {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.3rem;
  color: var(--text);
  font-size: 0.7rem;
  cursor: pointer;
}

.register-option small {
  grid-column: 2;
  color: var(--muted);
  font-size: 0.58rem;
}

.generate-btn {
  align-self: stretch;
  margin-left: auto;
  padding: 0.55rem 0.8rem;
  background: transparent;
  color: var(--acid);
  border: 1px solid #65772b;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 800;
  white-space: nowrap;
  transition: background 0.2s, transform 0.2s;
}

.generate-btn:hover {
  background: #242b1a;
  transform: translateY(-1px);
}

.generate-btn span {
  margin-left: 0.35rem;
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
  .controls,
  .melody-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .melody-indicator {
    align-self: flex-start;
  }

  .melody-heading-actions {
    align-items: flex-start;
  }

  .lab-grid {
    grid-template-columns: 1fr;
  }

  .panel-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .generate-btn {
    margin-left: 0;
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
