<template>
  <Layout><router-view /></Layout>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import Layout from './ui/Layout.vue';
import { initializeTransport } from './playback/transport';
import { initializePerformance } from './features/piano/performance';
import { flushProject } from './features/chord-lab/editor';
let cleanupTransport: (() => void) | undefined, cleanupPerformance: (() => void) | undefined;
onMounted(() => {
  cleanupTransport = initializeTransport();
  cleanupPerformance = initializePerformance();
  window.addEventListener('pagehide', flushProject);
});
onUnmounted(() => {
  cleanupTransport?.();
  cleanupPerformance?.();
  flushProject();
  window.removeEventListener('pagehide', flushProject);
});
</script>
