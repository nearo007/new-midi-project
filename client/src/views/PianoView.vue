<template>
  <div class="piano-view">
    <h1 class="title">Piano</h1>
    <PianoKeyboard />
  </div>
</template>

<script setup lang="ts">
import PianoKeyboard from '../components/PianoKeyboard.vue';
</script>

<style scoped>
.piano-view {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.title {
  color: #fff;
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
</style>
