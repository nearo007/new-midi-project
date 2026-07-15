<template>
  <div class="port-selector">
    <select v-model="selected" class="port-select">
      <option value="" disabled>Select MIDI port...</option>
      <option v-for="port in ports" :key="port" :value="port">{{ port }}</option>
    </select>
    <button class="port-btn" @click="handleSet" :disabled="!selected || selected === current">
      Set
    </button>
    <span v-if="current" class="port-current">{{ current }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getPorts, setPort } from '../api/client';

const ports = ref<string[]>([]);
const selected = ref('');
const current = ref('');

async function loadPorts() {
  try {
    const data = await getPorts();
    ports.value = data.ports;
    current.value = data.current;
    selected.value = data.current;
  } catch (err) {
    console.error('Failed to load ports:', err);
  }
}

async function handleSet() {
  if (!selected.value) return;
  try {
    await setPort(selected.value);
    current.value = selected.value;
  } catch (err) {
    console.error('Failed to set port:', err);
  }
}

onMounted(loadPorts);
</script>

<style scoped>
.port-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.port-select {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
}

.port-select option {
  background: #1a0030;
  color: #fff;
}

.port-btn {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.port-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
}

.port-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.port-current {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8rem;
}
</style>
