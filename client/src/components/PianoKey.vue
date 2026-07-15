<template>
  <button
    class="piano-key"
    :class="{ black: isBlack, pressed }"
    @mousedown="pressKey"
    @mouseup="releaseKey"
    @mouseleave="releaseKey"
    @touchstart.prevent="pressKey"
    @touchend.prevent="releaseKey"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { playNote } from '../api/client';
import { playTone } from '../api/audio';

const props = defineProps<{
  midiNote: number;
  isBlack: boolean;
}>();

const pressed = ref(false);

function pressKey() {
  pressed.value = true;
  playTone(props.midiNote);
  playNote(props.midiNote).catch(() => {});
}

function releaseKey() {
  pressed.value = false;
}
</script>

<style scoped>
.piano-key {
  position: relative;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0 0 4px 4px;
  transition: background 0.1s;
  user-select: none;
  -webkit-user-select: none;
}

.piano-key:not(.black) {
  width: 40px;
  height: 160px;
  background: linear-gradient(to bottom, #f8f8f8, #e8e8e8);
  z-index: 1;
}

.piano-key:not(.black):hover {
  background: linear-gradient(to bottom, #fff, #ddd);
}

.piano-key:not(.black).pressed {
  background: linear-gradient(to bottom, #ccc, #bbb);
}

.piano-key.black {
  width: 26px;
  height: 100px;
  background: linear-gradient(to bottom, #333, #111);
  z-index: 2;
  margin-left: -13px;
  margin-right: -13px;
  border-color: #000;
}

.piano-key.black:hover {
  background: linear-gradient(to bottom, #444, #222);
}

.piano-key.black.pressed {
  background: linear-gradient(to bottom, #555, #333);
}
</style>
