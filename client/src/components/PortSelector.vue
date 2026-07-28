<template>
  <div class="port-selector">
    <span class="port-label">MIDI OUT</span>
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

.port-label {
  color: #69717b;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.port-select {
  max-width: 190px;
  background: var(--surface-raised);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 0.45rem 0.55rem;
  font-size: 0.75rem;
}

.port-select option {
  background: var(--surface-raised);
  color: var(--text);
}

.port-btn {
  background: var(--acid);
  color: #151812;
  border: 1px solid var(--acid);
  border-radius: 3px;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 800;
  transition: opacity 0.2s, transform 0.2s;
}

.port-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.port-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.port-current {
  display: none;
}
</style>
