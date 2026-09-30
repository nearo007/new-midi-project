<template>
  <div class="chord-lab-view">
    <section class="page-heading">
      <div>
        <p class="eyebrow">02 / CHORD LAB</p>
        <h1 class="title">Chord <em>Lab.</em></h1>
        <p class="subtitle">Compose, record and keep the idea that feels right.</p>
      </div>
      <span class="sequence-count"
        >{{ project.chords.length }} chords · {{ totalBeats }} beats</span
      >
    </section>
    <p v-if="editorError" class="error-notice" role="alert">{{ editorError }}</p>
    <details class="project-details" open>
      <summary>Project · {{ project.name }}</summary>
      <ProjectToolbar />
    </details>
    <TrackMixer />
    <section class="chords-panel">
      <div class="panel-heading">
        <h2>Chord progression</h2>
        <span>Click a chord name to preview</span>
      </div>
      <div class="chords-row">
        <ChordBlock
          v-for="(chord, index) in project.chords"
          :key="chord.id"
          :model-value="chord"
          :index="index"
          :count="project.chords.length"
          :active="currentChordId === chord.id"
          @update:model-value="updateChord(chord.id, $event)"
          @remove="removeChord(chord.id)"
          @move="moveChord(chord.id, $event)"
          @preview="preview(chord)"
          @drag-start="dragId = chord.id"
          @drag-end="dragId = ''"
          @drop="drop($event)"
        />
        <button
          class="add-btn"
          :disabled="project.chords.length >= MAX_CHORDS"
          aria-label="Add chord"
          @click="addChord"
        >
          + Add chord
        </button>
      </div>
    </section>
    <MelodyControls />
    <MelodyEditor />
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { chordNotes, MAX_CHORDS, type ChordSpec } from '@midi-toolbox/core';
import ChordBlock from '../features/chord-lab/ChordBlock.vue';
import ProjectToolbar from '../features/chord-lab/ProjectToolbar.vue';
import MelodyControls from '../features/chord-lab/MelodyControls.vue';
import MelodyEditor from '../features/chord-lab/MelodyEditor.vue';
import TrackMixer from '../features/chord-lab/TrackMixer.vue';
import {
  project,
  totalBeats,
  editorError,
  updateChord,
  addChord,
  removeChord,
  moveChord,
} from '../features/chord-lab/editor';
import { currentChordId } from '../playback/transport';
import { pressNote } from '../features/piano/performance';
const dragId = ref('');
function drop(index: number) {
  const from = project.value.chords.findIndex((c) => c.id === dragId.value);
  if (from >= 0) moveChord(dragId.value, index - from);
  dragId.value = '';
}
function preview(chord: ChordSpec) {
  const releases = chordNotes(chord).map((note) =>
    pressNote(note, project.value.playback.harmonyVelocity),
  );
  setTimeout(() => releases.forEach((release) => release()), 450);
}
</script>
<style scoped>
.chord-lab-view {
  display: grid;
  gap: 1.6rem;
  width: 100%;
  min-width: 0;
}
.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}
.eyebrow {
  color: var(--coral);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.title {
  font-size: clamp(2.7rem, 7vw, 5rem);
  line-height: 1;
  letter-spacing: -0.07em;
  margin: 0.65rem 0 1rem;
}
.title em {
  color: var(--coral);
  font-style: normal;
}
.subtitle,
.sequence-count {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.6;
}
.project-details summary {
  padding: 0.7rem 0;
  cursor: pointer;
  color: var(--text);
  font-size: 0.85rem;
}
.chords-panel {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--coral);
  min-width: 0;
}
.panel-heading {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
}
.panel-heading h2 {
  font-size: 1.5rem;
}
.panel-heading span {
  font-size: 0.75rem;
  color: var(--muted);
}
.chords-row {
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
}
.add-btn {
  width: 150px;
  min-height: 100px;
  border: 1px dashed var(--line-strong);
  color: var(--acid);
  background: none;
  cursor: pointer;
}
.error-notice {
  color: var(--coral);
  padding: 1rem;
  border: 1px solid var(--coral);
  font-size: 0.85rem;
}
@media (max-width: 600px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .chords-panel {
    padding: 0.75rem;
  }
  .chords-row {
    justify-content: center;
  }
}
</style>
