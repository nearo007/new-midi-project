<template>
  <article
    class="chord-block"
    :class="{ muted: modelValue.muted, active }"
    :aria-label="`Chord ${index + 1}: ${chordName(modelValue)}`"
    @dragover.prevent
    @drop.prevent="$emit('drop', index)"
  >
    <button
      class="drag-handle"
      draggable="true"
      aria-label="Drag chord to reorder"
      @dragstart="$emit('drag-start', index)"
      @dragend="$emit('drag-end')"
    >
      ↔
    </button>
    <button
      class="chord-name preview"
      :aria-label="`Preview ${chordName(modelValue)}`"
      @click="$emit('preview')"
    >
      {{ chordName(modelValue) }}
    </button>
    <label class="chord-field"
      >Root<select
        :value="modelValue.rootPitchClass"
        class="chord-select"
        @change="set('rootPitchClass', value($event))"
      >
        <option v-for="(note, i) in NOTE_NAMES" :key="i" :value="i">{{ note }}</option>
      </select></label
    >
    <label class="chord-field"
      >Octave<select
        :value="modelValue.octave"
        class="chord-select"
        @change="set('octave', value($event))"
      >
        <option v-for="o in 7" :key="o" :value="o">{{ o }}</option>
      </select></label
    >
    <label class="chord-field"
      >Quality<select
        :value="modelValue.quality"
        class="chord-select"
        @change="set('quality', str($event))"
      >
        <option value="major">Major</option>
        <option value="minor">Minor</option>
      </select></label
    >
    <label class="chord-field"
      >Seventh<select
        :value="modelValue.seventh"
        class="chord-select"
        @change="set('seventh', str($event))"
      >
        <option value="none">None</option>
        <option value="maj7">Major 7th</option>
        <option value="min7">Minor 7th</option>
      </select></label
    >
    <label class="chord-field"
      >Inversion<select
        :value="modelValue.inversion"
        class="chord-select"
        @change="set('inversion', value($event))"
      >
        <option v-for="i in modelValue.seventh === 'none' ? 3 : 4" :key="i" :value="i - 1">
          {{ i === 1 ? 'Root position' : `${i - 1}` }}
        </option>
      </select></label
    >
    <label class="chord-field"
      >Beats<input
        :value="modelValue.durationBeats"
        type="number"
        min="0.25"
        max="16"
        step="0.25"
        class="chord-select"
        @change="set('durationBeats', value($event))"
    /></label>
    <p class="chord-notes">{{ chordNotes(modelValue).map(noteName).join(' · ') }}</p>
    <div class="block-actions">
      <button
        class="mute-btn"
        :aria-label="`${modelValue.muted ? 'Unmute' : 'Mute'} chord ${index + 1}`"
        :aria-pressed="modelValue.muted"
        @click="set('muted', !modelValue.muted)"
      >
        {{ modelValue.muted ? 'Muted' : 'Mute' }}
      </button>
      <button
        class="remove-btn"
        :aria-label="`Remove chord ${index + 1}`"
        :disabled="count === 1"
        :title="count === 1 ? 'Keep at least one chord' : 'Remove chord'"
        @click="$emit('remove')"
      >
        ×
      </button>
    </div>
    <div class="block-actions">
      <button
        class="small-button"
        :disabled="index === 0"
        aria-label="Move chord earlier"
        @click="$emit('move', -1)"
      >
        ←</button
      ><button
        class="small-button"
        :disabled="index === count - 1"
        aria-label="Move chord later"
        @click="$emit('move', 1)"
      >
        →
      </button>
    </div>
  </article>
</template>
<script setup lang="ts">
import { NOTE_NAMES, chordName, chordNotes, noteName, type ChordSpec } from '@midi-toolbox/core';
const props = defineProps<{
  modelValue: ChordSpec;
  index: number;
  count: number;
  active: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: ChordSpec];
  remove: [];
  move: [delta: number];
  preview: [];
  'drag-start': [index: number];
  drop: [index: number];
  'drag-end': [];
}>();
const str = (event: Event) => (event.target as HTMLInputElement).value;
const value = (event: Event) => Number(str(event));
function set(field: keyof ChordSpec, value: unknown) {
  const next = { ...props.modelValue, [field]: value };
  if (field === 'seventh' && value === 'none') next.inversion = Math.min(2, next.inversion);
  emit('update:modelValue', next);
}
</script>
<style scoped>
.chord-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.9rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-top: 3px solid var(--line-strong);
  border-radius: 3px;
  min-width: 116px;
  min-height: 220px;
  transition:
    opacity 0.2s,
    filter 0.2s,
    border-color 0.2s,
    transform 0.2s;
  cursor: default;
}

.chord-block.muted {
  opacity: 0.4;
  filter: saturate(0.2);
}

.chord-block.dragging {
  opacity: 0.5;
  border-color: var(--acid);
}

.chord-block.active {
  border-top-color: var(--acid);
  box-shadow: 0 8px 0 color-mix(in srgb, var(--acid) 8%, transparent);
  transform: translateY(-3px);
}

.drag-handle {
  cursor: grab;
  color: var(--muted);
  font-size: 0.9rem;
  letter-spacing: 2px;
  user-select: none;
  line-height: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.chord-name {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.06em;
  margin: 0.2rem 0 0.35rem;
}

.chord-select {
  width: 100%;
  background: var(--surface-raised);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 2px;
  padding: 0.38rem;
  font-size: 0.72rem;
}

.chord-select option {
  background: var(--surface-raised);
  color: var(--text);
}

.block-actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.mute-btn {
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.15rem 0.4rem;
  line-height: 1;
  transition: background 0.2s;
}

.mute-btn:hover {
  background: var(--surface-soft);
}

.remove-btn {
  background: transparent;
  color: var(--coral);
  border: 1px solid var(--coral);
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.15rem 0.5rem;
}

.remove-btn:hover {
  background: color-mix(in srgb, var(--coral) 15%, transparent);
}

.chord-block {
  width: 150px;
  flex-shrink: 0;
}
.chord-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  width: 100%;
  font-size: 0.65rem;
  color: var(--muted);
}
.chord-notes {
  font-size: 0.62rem;
  color: var(--muted);
  text-align: center;
}
.preview,
.drag-handle {
  border: 0;
  background: none;
  cursor: pointer;
}
.preview:hover {
  color: var(--acid);
}
.small-button {
  padding: 0.2rem 0.65rem;
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
