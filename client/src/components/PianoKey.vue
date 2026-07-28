<template>
  <button
    class="piano-key"
    :class="{ black: isBlack, pressed }"
    @mousedown="pressKey"
    @mouseup="releaseKey"
    @mouseleave="releaseKey"
    @touchstart.prevent="pressKey"
    @touchend.prevent="releaseKey"
  >
    <span v-if="!isBlack" class="key-label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { playNote } from '../api/client';
import { playTone } from '../api/audio';
import { useSound } from '../api/sound-toggle';

const props = defineProps<{
  midiNote: number;
  isBlack: boolean;
  label: string;
}>();

const pressed = ref(false);
const soundOn = useSound();

function pressKey() {
  pressed.value = true;
  if (soundOn.value) {
    playTone(props.midiNote);
  }
  playNote(props.midiNote).catch(() => {});
}

function releaseKey() {
  pressed.value = false;
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
  border-color: #b3d43a;
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
  border-color: #d55e4b;
  transform: translateY(3px);
  box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.16);
}

.key-label {
  position: absolute;
  bottom: 0.65rem;
  left: 0;
  width: 100%;
  color: inherit;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  opacity: 0.65;
}
</style>
