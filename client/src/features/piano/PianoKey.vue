<template>
  <button
    class="piano-key"
    :class="{ black: isBlack, pressed: heldNotes.has(midiNote) || inputNotes.has(midiNote) }"
    :aria-label="`${label}, MIDI ${midiNote}`"
    :aria-pressed="heldNotes.has(midiNote) || inputNotes.has(midiNote)"
    :title="`${label} · MIDI ${midiNote}`"
    @pointerdown="press"
    @pointerup="releasePointer"
    @pointercancel="releasePointer"
    @lostpointercapture="releasePointer"
    @keydown="keydown"
    @keyup="keyup"
    @blur="releaseAll"
    @contextmenu.prevent
  >
    <span v-if="midiNote % 12 === 0" class="key-label">{{ label }}</span>
  </button>
</template>
<script setup lang="ts">
import { onUnmounted } from 'vue';
import { inputNotes } from '../../midi/devices';
import { heldNotes, pressNote } from './performance';
const props = defineProps<{ midiNote: number; isBlack: boolean; label: string }>();
const pointers = new Map<number, () => void>(),
  keys = new Map<string, () => void>();
function press(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  const target = event.currentTarget as HTMLElement,
    rect = target.getBoundingClientRect();
  if (event.isTrusted) target.setPointerCapture?.(event.pointerId);
  if (!pointers.has(event.pointerId))
    pointers.set(
      event.pointerId,
      pressNote(
        props.midiNote,
        Math.round(20 + 107 * Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))),
      ),
    );
}
function releasePointer(event: PointerEvent) {
  pointers.get(event.pointerId)?.();
  pointers.delete(event.pointerId);
}
function keydown(event: KeyboardEvent) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  if (!event.repeat && !keys.has(event.key)) keys.set(event.key, pressNote(props.midiNote));
}
function keyup(event: KeyboardEvent) {
  keys.get(event.key)?.();
  keys.delete(event.key);
}
function releaseAll() {
  for (const release of [...pointers.values(), ...keys.values()]) release();
  pointers.clear();
  keys.clear();
}
onUnmounted(releaseAll);
</script>
<style scoped>
.piano-key {
  touch-action: none;
  position: relative;
  appearance: none;
  -webkit-appearance: none;
  display: block;
  flex: none;
  padding: 0;
  cursor: pointer;
  border: 1px solid var(--paper-edge);
  border-radius: 0 0 4px 4px;
  transition:
    background-color 0.1s,
    transform 0.1s,
    box-shadow 0.1s;
  user-select: none;
  -webkit-user-select: none;
}

.piano-key:not(.black) {
  width: 40px;
  height: 160px;
  background-color: var(--paper);
  color: #555b61;
  z-index: 1;
  box-shadow:
    inset 0 -10px 0 rgba(0, 0, 0, 0.05),
    0 3px 0 #918a7d;
}

.piano-key:not(.black):hover {
  background-color: #fffdf7;
}

.piano-key:not(.black).pressed {
  background-color: var(--acid);
  border-color: var(--acid);
  color: #171b11;
  transform: translateY(3px);
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.08);
}

.piano-key.black {
  width: 26px;
  height: 100px;
  background-color: #252a31;
  color: var(--text);
  z-index: 2;
  margin-left: -13px;
  margin-right: -13px;
  border-color: #08090b;
  box-shadow:
    inset 0 -8px 0 rgba(0, 0, 0, 0.22),
    0 4px 0 #08090b;
}

.piano-key.black:hover {
  background-color: #343b45;
}

.piano-key.black.pressed {
  background-color: var(--coral);
  border-color: var(--coral);
  transform: translateY(3px);
  box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.16);
}

.piano-key.midi-input-flash {
  animation: midi-input-flash 220ms ease-out;
}

@keyframes midi-input-flash {
  0% {
    filter: brightness(1.8);
  }
  100% {
    filter: brightness(1);
  }
}
.key-label {
  position: absolute;
  bottom: 0.65rem;
  left: 0;
  width: 100%;
  font-size: 0.65rem;
  color: #343a43;
}
</style>
