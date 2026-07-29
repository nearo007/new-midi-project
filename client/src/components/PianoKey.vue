<template>
  <button
    class="piano-key"
    :class="{ black: isBlack, pressed: pressed || inputPressed, 'midi-input-flash': inputFlash }"
    :aria-label="`${label}, MIDI ${midiNote}`"
    :title="`${label} · MIDI ${midiNote}`"
    @mousedown="pressKey"
    @mouseup="releaseKey"
    @mouseleave="releaseKey"
    @touchstart.prevent="pressKey"
    @touchend.prevent="releaseKey"
  >
  </button>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { playNote } from '../api/client';
import { startTone, type ToneHandle } from '../api/audio';
import {
  hasSelectedBrowserMidiOutput,
  hasSelectedNativeMidiOutput,
  midiOutputEnabled,
  onBrowserMidiNote,
  sendBrowserNoteOff,
  sendBrowserNoteOn,
} from '../api/midi';

const props = defineProps<{
  midiNote: number;
  isBlack: boolean;
  label: string;
}>();

const pressed = ref(false);
const inputPressed = ref(false);
const inputFlash = ref(false);
let flashTimer: number | null = null;
let removeInputListener: (() => void) | null = null;
let localTone: ToneHandle | null = null;

onMounted(() => {
  removeInputListener = onBrowserMidiNote((note, velocity) => {
    if (note !== props.midiNote) return;
    if (velocity === 0) {
      inputPressed.value = false;
      return;
    }

    inputPressed.value = true;
    inputFlash.value = false;
    window.requestAnimationFrame(() => {
      inputFlash.value = true;
    });
    if (flashTimer) window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      inputFlash.value = false;
      flashTimer = null;
    }, 220);
  });
});

onUnmounted(() => {
  localTone?.stop();
  localTone = null;
  removeInputListener?.();
  if (flashTimer) window.clearTimeout(flashTimer);
});

function velocityFromEvent(event: MouseEvent | TouchEvent): number {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return 100;
  const rect = target.getBoundingClientRect();
  const pointY = 'touches' in event
    ? event.touches[0]?.clientY ?? rect.top + rect.height
    : event.clientY;
  const verticalPosition = Math.max(0, Math.min(1, (pointY - rect.top) / rect.height));
  return Math.round(20 + verticalPosition * 107);
}

function pressKey(event: MouseEvent | TouchEvent) {
  pressed.value = true;
  const velocity = velocityFromEvent(event);
  localTone?.stop();
  localTone = startTone(props.midiNote, velocity);
  if (midiOutputEnabled.value && !sendBrowserNoteOn(props.midiNote, velocity) && hasSelectedNativeMidiOutput()) {
    playNote(props.midiNote, velocity).catch(() => {});
  }
}

function releaseKey() {
  pressed.value = false;
  localTone?.release();
  localTone = null;
  if (midiOutputEnabled.value && hasSelectedBrowserMidiOutput()) sendBrowserNoteOff(props.midiNote);
}
</script>

<style scoped>
.piano-key {
  position: relative;
  appearance: none;
  -webkit-appearance: none;
  display: block;
  flex: none;
  padding: 0;
  cursor: pointer;
  border: 1px solid var(--paper-edge);
  border-radius: 0 0 4px 4px;
  transition: background-color 0.1s, transform 0.1s, box-shadow 0.1s;
  user-select: none;
  -webkit-user-select: none;
}

.piano-key:not(.black) {
  width: 40px;
  height: 160px;
  background-color: var(--paper);
  color: #555b61;
  z-index: 1;
  box-shadow: inset 0 -10px 0 rgba(0, 0, 0, 0.05), 0 3px 0 #918a7d;
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
  box-shadow: inset 0 -8px 0 rgba(0, 0, 0, 0.22), 0 4px 0 #08090b;
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
</style>
