<template>
  <section class="melody-panel">
    <h2>Melody generator</h2>
    <p>
      Use chord tones or a scale. Changing restrictions generates a new variation; Undo restores the
      previous idea.
    </p>
    <div class="fields">
      <label
        >Scale<select :value="project.melody.scale" @change="scale">
          <option
            v-for="s in ['chord', 'major', 'minor', 'blues', 'chromatic']"
            :key="s"
            :value="s"
          >
            {{ s === 'chord' ? 'Chord tones' : s }}
          </option>
        </select></label
      >
      <label
        >Key<select
          :value="project.melody.key"
          :disabled="['chord', 'chromatic'].includes(project.melody.scale)"
          @change="key"
        >
          <option v-for="(name, i) in NOTE_NAMES" :key="i" :value="i + 1">{{ name }}</option>
        </select></label
      >
      <label
        >Notes per chord<input
          type="number"
          min="0"
          max="4"
          :value="project.melody.notesPerChord"
          @change="notes"
      /></label>
      <label
        >Register<select :value="project.melody.octaveMin" @change="register">
          <option :value="3">Low · 3–4</option>
          <option :value="4">Mid · 4–5</option>
          <option :value="5">High · 5–6</option>
          <option
            v-if="![3, 4, 5].includes(project.melody.octaveMin)"
            :value="project.melody.octaveMin"
          >
            Custom · {{ project.melody.octaveMin }}–{{ project.melody.octaveMax }}
          </option>
        </select></label
      >
      <button @click="regenerate">Generate</button>
    </div>
    <p class="seed">
      Seed {{ project.melody.seed }} ·
      {{ project.melodyNotes === null ? 'Generated notes' : 'Custom notes override the generator' }}
    </p>
  </section>
</template>
<script setup lang="ts">
import { NOTE_NAMES, type MelodyScale } from '@midi-toolbox/core';
import { project, changeMelody, regenerate } from './editor';
const value = (e: Event) => (e.target as HTMLSelectElement).value;
function scale(e: Event) {
  changeMelody((m) => {
    m.scale = value(e) as MelodyScale;
  });
}
function key(e: Event) {
  changeMelody((m) => {
    m.key = Number(value(e));
  });
}
function notes(e: Event) {
  changeMelody((m) => {
    m.notesPerChord = Number(value(e));
  });
}
function register(e: Event) {
  changeMelody((m) => {
    m.octaveMin = Number(value(e));
    m.octaveMax = m.octaveMin + 1;
  });
}
</script>
<style scoped>
.melody-panel {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--acid);
}
h2 {
  font-size: 1.4rem;
}
p {
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--muted);
}
.fields {
  display: flex;
  gap: 0.8rem;
  align-items: flex-end;
  flex-wrap: wrap;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--muted);
}
input {
  width: 6rem;
}
select,
input,
button {
  padding: 0.55rem;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 0.8rem;
}
button {
  cursor: pointer;
  color: var(--acid);
}
.seed {
  font-size: 0.7rem;
}
select:disabled {
  opacity: 0.5;
}
</style>
