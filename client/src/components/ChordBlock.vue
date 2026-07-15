<template>
  <div
    class="chord-block"
    :class="{ muted: local.muted, dragging: isDragging, active: active }"
    draggable="true"
    @dragstart="onDragStart"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
    @dragend="onDragEnd"
  >
    <div class="drag-handle" title="Drag to reorder">:::</div>
    <div class="chord-name">{{ displayName }}</div>
    <select v-model.number="local.note" class="chord-select" @change="emitValue">
      <option v-for="n in NOTE_OPTIONS" :key="n.value" :value="n.value">{{ n.label }}</option>
    </select>
    <select v-model.number="local.octave" class="chord-select" @change="emitValue">
      <option v-for="o in 7" :key="o" :value="o">{{ o }}</option>
    </select>
    <select v-model.number="local.tonality" class="chord-select" @change="emitValue">
      <option :value="0">Major</option>
      <option :value="1">Minor</option>
    </select>
    <div class="seventh-group">
      <label class="seventh-check">
        <input type="checkbox" :checked="local.seventh === 1" @change="setSeventh(1)" />
        maj7
      </label>
      <label class="seventh-check">
        <input type="checkbox" :checked="local.seventh === 2" @change="setSeventh(2)" />
        min7
      </label>
    </div>
    <div class="block-actions">
      <button class="mute-btn" :class="{ active: local.muted }" @click="toggleMute" title="Mute">
        {{ local.muted ? '🔇' : '🔊' }}
      </button>
      <button class="remove-btn" @click="$emit('remove')">x</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch, ref } from 'vue';

export type ChordData = [number, number, number, number, boolean];

const NOTE_OPTIONS = [
  { value: 1, label: 'C' }, { value: 2, label: 'C#' }, { value: 3, label: 'D' },
  { value: 4, label: 'D#' }, { value: 5, label: 'E' }, { value: 6, label: 'F' },
  { value: 7, label: 'F#' }, { value: 8, label: 'G' }, { value: 9, label: 'G#' },
  { value: 10, label: 'A' }, { value: 11, label: 'A#' }, { value: 12, label: 'B' },
];

const KEY_NAMES: Record<number, string> = {
  1: 'C', 2: 'C#', 3: 'D', 4: 'D#', 5: 'E', 6: 'F',
  7: 'F#', 8: 'G', 9: 'G#', 10: 'A', 11: 'A#', 12: 'B',
};

const props = defineProps<{
  modelValue: ChordData;
  index: number;
  active: boolean;
}>();

const emitEvent = defineEmits<{
  'update:modelValue': [value: ChordData];
  remove: [];
  'drag-start': [index: number];
  'drag-over': [index: number];
  'drag-drop': [index: number];
  'drag-end': [];
}>();

const local = reactive({
  note: props.modelValue[0],
  octave: props.modelValue[1],
  tonality: props.modelValue[2],
  seventh: props.modelValue[3],
  muted: props.modelValue[4],
});

const isDragging = ref(false);

watch(() => props.modelValue, (v) => {
  local.note = v[0];
  local.octave = v[1];
  local.tonality = v[2];
  local.seventh = v[3];
  local.muted = v[4];
});

function emitValue() {
  emitEvent('update:modelValue', [local.note, local.octave, local.tonality, local.seventh, local.muted]);
}

function setSeventh(val: number) {
  local.seventh = local.seventh === val ? 0 : val;
  emitValue();
}

function toggleMute() {
  local.muted = !local.muted;
  emitValue();
}

function onDragStart() {
  isDragging.value = true;
  emitEvent('drag-start', props.index);
}

function onDragOver() {
  emitEvent('drag-over', props.index);
}

function onDrop() {
  emitEvent('drag-drop', props.index);
}

function onDragEnd() {
  isDragging.value = false;
  emitEvent('drag-end');
}

const displayName = computed(() => {
  const name = KEY_NAMES[local.note] ?? '?';
  const tone = local.tonality === 1 ? 'm' : '';
  const ext = local.seventh === 1 ? 'maj7' : local.seventh === 2 ? '7' : '';
  return `${name}${tone}${ext}`;
});
</script>

<style scoped>
.chord-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  min-width: 100px;
  transition: opacity 0.2s, filter 0.2s;
  cursor: default;
}

.chord-block.muted {
  opacity: 0.4;
  filter: saturate(0.2);
}

.chord-block.dragging {
  opacity: 0.5;
  border-color: rgba(168, 85, 247, 0.6);
}

.chord-block.active {
  border-color: rgba(168, 85, 247, 0.8);
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.4), inset 0 0 8px rgba(168, 85, 247, 0.1);
}

.drag-handle {
  cursor: grab;
  color: rgba(255, 255, 255, 0.25);
  font-size: 0.9rem;
  letter-spacing: 2px;
  user-select: none;
  line-height: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.chord-name {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.25rem;
}

.chord-select {
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 0.3rem;
  font-size: 0.85rem;
}

.chord-select option {
  background: #1a0030;
  color: #fff;
}

.seventh-group {
  display: flex;
  gap: 0.5rem;
}

.seventh-check {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.8rem;
  cursor: pointer;
}

.seventh-check input {
  margin-right: 0.2rem;
}

.block-actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.mute-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.15rem 0.4rem;
  line-height: 1;
  transition: background 0.2s;
}

.mute-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}

.mute-btn.active {
  background: rgba(255, 255, 255, 0.15);
}

.remove-btn {
  background: rgba(255, 80, 80, 0.2);
  color: #ff6666;
  border: 1px solid rgba(255, 80, 80, 0.3);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.15rem 0.5rem;
}

.remove-btn:hover {
  background: rgba(255, 80, 80, 0.4);
}
</style>
