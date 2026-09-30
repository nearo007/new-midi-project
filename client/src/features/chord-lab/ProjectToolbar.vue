<template>
  <section class="project-tools" aria-label="Project tools">
    <div class="project-row">
      <label class="field"
        >Project name<input :value="project.name" maxlength="80" @change="rename"
      /></label>
      <span class="save-status" role="status">{{
        saveState === 'saved' ? 'Autosaved' : saveState === 'saving' ? 'Saving…' : 'Not saved'
      }}</span>
      <button @click="createProject">New</button
      ><button @click="saveNamedProject">Save to library</button
      ><button @click="duplicateProject">Duplicate</button>
      <button :disabled="!canUndo" @click="undo" title="Ctrl/Cmd+Z">Undo</button
      ><button :disabled="!canRedo" @click="redo" title="Ctrl/Cmd+Shift+Z">Redo</button>
    </div>
    <div class="project-row">
      <label class="field"
        >Library<select v-model="savedId">
          <option value="">Select a saved project</option>
          <option v-for="item in library" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select></label
      >
      <button :disabled="!savedId" @click="loadProject(savedId)">Open</button
      ><button
        :disabled="!savedId"
        @click="
          deleteSavedProject(savedId);
          savedId = '';
        "
      >
        Delete saved copy
      </button>
      <button @click="exportJson">Export JSON</button
      ><button @click="fileInput?.click()">Import JSON</button>
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        class="visually-hidden"
        aria-label="Import project file"
        @change="readFile"
      />
      <button @click="exportMidiFile">Export MIDI</button
      ><button :disabled="rendering" @click="exportAudio">
        {{ rendering ? 'Rendering…' : 'Export WAV' }}
      </button>
    </div>
    <div class="project-row">
      <label class="field"
        >Preset<select v-model="preset">
          <option v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select></label
      >
      <button @click="applyPreset(preset)">Replace chords</button
      ><button @click="applyPreset(preset, true)">Append preset</button>
      <button @click="transpose(-1)" aria-label="Transpose down one semitone">Transpose −1</button
      ><button @click="transpose(1)" aria-label="Transpose up one semitone">Transpose +1</button>
      <label class="field"
        >Loop from<select :value="project.loop?.startId ?? ''" @change="loopStart">
          <option value="">All chords</option>
          <option v-for="(c, i) in project.chords" :key="c.id" :value="c.id">
            {{ i + 1 }} · {{ chordName(c) }}
          </option>
        </select></label
      >
      <label v-if="project.loop" class="field"
        >Through<select :value="project.loop.endId" @change="loopEnd">
          <option
            v-for="(c, i) in project.chords"
            :key="c.id"
            :value="c.id"
            :disabled="i < project.chords.findIndex((c) => c.id === project.loop?.startId)"
          >
            {{ i + 1 }} · {{ chordName(c) }}
          </option>
        </select></label
      >
    </div>
    <p v-if="message" role="status" class="notice">{{ message }}</p>
  </section>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { chordName, exportMidi } from '@midi-toolbox/core';
import { renderProjectWav } from '../../audio/engine';
import {
  project,
  library,
  saveState,
  canUndo,
  canRedo,
  editProject,
  undo,
  redo,
  createProject,
  duplicateProject,
  saveNamedProject,
  loadProject,
  deleteSavedProject,
  importProject,
  transpose,
  PRESETS,
  applyPreset,
} from './editor';
const savedId = ref(''),
  preset = ref('pop'),
  message = ref(''),
  rendering = ref(false),
  fileInput = ref<HTMLInputElement | null>(null);
function download(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `${project.value.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'project'}.${extension}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function rename(event: Event) {
  const name = (event.target as HTMLInputElement).value;
  editProject((p) => {
    p.name = name;
  });
}
function exportJson() {
  download(
    new Blob([JSON.stringify(project.value, null, 2)], { type: 'application/json' }),
    'json',
  );
}
function exportMidiFile() {
  try {
    download(new Blob([new Uint8Array(exportMidi(project.value))], { type: 'audio/midi' }), 'mid');
    message.value = 'MIDI exported with harmony, melody and tempo.';
  } catch (error) {
    message.value = String(error);
  }
}
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement;
  try {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) throw new Error('Maximum project file size: 1 MB');
    importProject(await file.text());
    message.value = 'Project imported. Undo restores the previous project.';
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = '';
  }
}
async function exportAudio() {
  rendering.value = true;
  message.value = '';
  try {
    download(await renderProjectWav(project.value), 'wav');
    message.value = 'Audio exported. Live input and metronome are excluded.';
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error);
  } finally {
    rendering.value = false;
  }
}
function loopStart(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  editProject((p) => {
    p.loop = id ? { startId: id, endId: p.chords.at(-1)!.id } : null;
  });
}
function loopEnd(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  editProject((p) => {
    if (p.loop) p.loop.endId = id;
  });
}
function shortcut(event: KeyboardEvent) {
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.key.toLowerCase() !== 'z' ||
    (event.target as HTMLElement)?.matches('input,textarea,select')
  )
    return;
  event.preventDefault();
  if (event.shiftKey) redo();
  else undo();
}
onMounted(() => window.addEventListener('keydown', shortcut));
onUnmounted(() => window.removeEventListener('keydown', shortcut));
</script>
<style scoped>
.project-tools {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--line);
}
.project-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  font-size: 0.7rem;
  color: var(--muted);
}
input,
select,
button {
  padding: 0.55rem;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 0.75rem;
  max-width: 100%;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.save-status,
.notice {
  font-size: 0.75rem;
  color: var(--muted);
}
.save-status {
  align-self: center;
}
</style>
