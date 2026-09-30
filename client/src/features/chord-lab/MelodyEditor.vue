<template>
  <section class="melody-editor" aria-label="Melody editor">
    <div class="editor-heading">
      <div>
        <h2>Melody editor</h2>
        <p>
          {{
            project.melodyNotes === null
              ? 'Generated melody · edit a note to make a custom version'
              : 'Custom melody · Generate replaces these edits'
          }}
        </p>
      </div>
      <button v-if="project.melodyNotes === null" @click="materializeMelody">
        Edit generated notes
      </button>
    </div>
    <div class="record-controls">
      <button :disabled="recording" @click="startRecording(false)">Record MIDI · replace</button
      ><button :disabled="recording" @click="startRecording(true)">Record MIDI · append</button
      ><button :disabled="!recording" @click="stopRecording">Stop recording</button>
      <label
        >Quantize<select v-model.number="grid">
          <option :value="1">Quarter notes</option>
          <option :value="0.5">Eighth notes</option>
          <option :value="0.25">Sixteenth notes</option>
        </select></label
      >
      <button :disabled="project.melodyNotes === null || recording" @click="quantizeMelody(grid)">
        Apply quantization
      </button>
    </div>
    <p v-if="recordingMessage" role="status">{{ recordingMessage }}</p>
    <p class="hint">
      Double-click an empty cell to add a note. Select a note to edit it; arrow keys move it and
      Delete removes it. Changes can be undone.
    </p>
    <div class="roll-scroll">
      <div
        class="roll"
        :style="{
          width: `${Math.max(640, totalBeats * 60)}px`,
          height: `${(high - low + 1) * 12 + 24}px`,
          backgroundSize: `${grid * 60}px 12px`,
        }"
        @dblclick="addAt"
      >
        <span
          v-for="beat in Math.ceil(totalBeats)"
          :key="beat"
          class="beat-label"
          :style="{ left: `${(beat - 1) * 60}px` }"
          >{{ beat }}</span
        >
        <button
          v-for="note in visibleNotes"
          :key="note.id"
          class="roll-note"
          :class="{ selected: note.id === selectedId }"
          :style="{
            left: `${note.startBeat * 60}px`,
            top: `${24 + (high - note.note) * 12}px`,
            width: `${Math.max(8, note.durationBeats * 60)}px`,
          }"
          :aria-label="`${noteName(note.note)}, beat ${(note.startBeat + 1).toFixed(2)}, velocity ${note.velocity}`"
          @click.stop="select(note.id)"
          @dblclick.stop
          @keydown="keyNote($event, note)"
        >
          {{ noteName(note.note) }}
        </button>
      </div>
    </div>
    <div class="note-fields" v-if="selected">
      <label
        >MIDI note<input
          type="number"
          min="0"
          max="127"
          :value="selected.note"
          @change="setNote('note', $event)"
      /></label>
      <label
        >Start beat (0-based)<input
          type="number"
          min="0"
          :max="totalBeats - 0.001"
          :step="grid"
          :value="selected.startBeat"
          @change="setNote('startBeat', $event)"
      /></label>
      <label
        >Duration (beats)<input
          type="number"
          min="0.001"
          :max="totalBeats - selected.startBeat"
          :step="grid"
          :value="selected.durationBeats"
          @change="setNote('durationBeats', $event)"
      /></label>
      <label
        >Velocity<input
          type="number"
          min="1"
          max="127"
          :value="selected.velocity"
          @change="setNote('velocity', $event)"
      /></label>
      <span>Recorded channel {{ selected.sourceChannel + 1 }}</span
      ><button @click="removeSelected">Delete note</button>
    </div>
    <button @click="addNote">Add note at start</button>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { compileProject, noteName, type MelodyNote } from '@midi-toolbox/core';
import { project, totalBeats, editProject, materializeMelody, quantizeMelody } from './editor';
import { recording, recordingMessage, startRecording, stopRecording } from './recording';
const selectedId = ref(''),
  grid = ref(0.5);
const notes = computed<MelodyNote[]>(() => {
  if (project.value.melodyNotes !== null) return project.value.melodyNotes;
  const sequence = compileProject(
    {
      ...project.value,
      playback: { ...project.value.playback, melody: true },
      melody: { ...project.value.melody, enabled: true },
      tracks: { ...project.value.tracks, melody: { ...project.value.tracks.melody, volume: 1 } },
    },
    false,
  );
  let beat = 0;
  const result: MelodyNote[] = [];
  for (const step of sequence.steps) {
    step.events
      .filter((e) => e.track === 'melody')
      .forEach((e, i) =>
        result.push({
          id: `${step.chordId}:${i}`,
          note: e.note,
          startBeat: beat + e.startBeat,
          durationBeats: e.durationBeats,
          velocity: e.velocity,
          sourceChannel: e.channel,
        }),
      );
    beat += step.durationBeats;
  }
  return result;
});
const high = computed(() => Math.max(83, ...notes.value.map((n) => n.note)));
const low = computed(() => Math.min(high.value - 23, ...notes.value.map((n) => n.note)));
const visibleNotes = notes;
const selected = computed(() => notes.value.find((n) => n.id === selectedId.value));
function select(id: string) {
  if (project.value.melodyNotes === null) {
    const i = notes.value.findIndex((n) => n.id === id);
    materializeMelody();
    selectedId.value = (project.value.melodyNotes as MelodyNote[] | null)?.[i]?.id ?? '';
  } else selectedId.value = id;
}
function add(startBeat: number, note: number) {
  materializeMelody();
  const id = crypto.randomUUID();
  if (
    editProject((p) =>
      p.melodyNotes!.push({
        id,
        note,
        startBeat,
        durationBeats: Math.min(grid.value, totalBeats.value - startBeat),
        velocity: 96,
        sourceChannel: p.tracks.melody.channel,
      }),
    )
  )
    selectedId.value = id;
}
function addNote() {
  add(0, 72);
}
function addAt(event: MouseEvent) {
  if (event.target !== event.currentTarget) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const beat = Math.floor((event.clientX - rect.left) / 60 / grid.value) * grid.value;
  if (beat >= totalBeats.value) return;
  add(
    Math.max(0, beat),
    Math.max(0, Math.min(127, high.value - Math.floor((event.clientY - rect.top - 24) / 12))),
  );
}
function setNote(field: keyof MelodyNote, event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  editProject((p) => {
    const note = p.melodyNotes?.find((n) => n.id === selectedId.value);
    if (note) Object.assign(note, { [field]: value });
  }, `note:${selectedId.value}`);
}
function removeSelected() {
  editProject((p) => {
    p.melodyNotes = p.melodyNotes?.filter((n) => n.id !== selectedId.value) ?? [];
  });
  selectedId.value = '';
}
function keyNote(event: KeyboardEvent, note: MelodyNote) {
  if (
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)
  )
    return;
  event.preventDefault();
  select(note.id);
  if (event.key === 'Delete' || event.key === 'Backspace') {
    removeSelected();
    return;
  }
  editProject((p) => {
    const n = p.melodyNotes?.find((n) => n.id === selectedId.value);
    if (!n) return;
    if (event.key === 'ArrowUp') n.note++;
    if (event.key === 'ArrowDown') n.note--;
    if (event.key === 'ArrowLeft') n.startBeat = Math.max(0, n.startBeat - grid.value);
    if (event.key === 'ArrowRight')
      n.startBeat = Math.min(totalBeats.value - n.durationBeats, n.startBeat + grid.value);
  });
}
</script>
<style scoped>
.melody-editor {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--line);
  background: var(--surface);
  min-width: 0;
}
.editor-heading {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
h2 {
  font-size: 1.4rem;
}
p,
.hint {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.5;
}
.record-controls,
.note-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: flex-end;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--muted);
}
input {
  width: 8rem;
}
input,
select,
button {
  padding: 0.5rem;
  background: var(--surface-raised);
  color: var(--text);
  border: 1px solid var(--line);
  font-size: 0.75rem;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.roll-scroll {
  overflow: auto;
  max-height: 360px;
  max-width: 100%;
  border: 1px solid var(--line);
}
.roll {
  position: relative;
  background-image:
    linear-gradient(to right, var(--line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--line) 1px, transparent 1px);
}
.beat-label {
  position: absolute;
  top: 3px;
  font-size: 0.6rem;
  color: var(--muted);
  padding-left: 3px;
}
.roll-note {
  position: absolute;
  height: 11px;
  padding: 0 2px;
  overflow: hidden;
  text-align: left;
  white-space: nowrap;
  background: var(--acid);
  color: var(--on-accent);
  font-size: 8px;
  border: 0;
  border-radius: 2px;
}
.roll-note.selected {
  background: var(--coral);
  outline: 2px solid var(--text);
  z-index: 2;
}
</style>
