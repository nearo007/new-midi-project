<template>
  <div class="port-selector">
    <span class="port-label">MIDI OUT</span>
    <select v-model="selected" class="port-select">
      <option value="" disabled>Select MIDI output...</option>
      <optgroup v-if="browserPorts.length" label="Browser MIDI">
        <option v-for="port in browserPorts" :key="`browser:${port.id}`" :value="`browser:${port.id}`">
          {{ port.name }}
        </option>
      </optgroup>
      <optgroup v-if="serverPorts.length" label="Server MIDI">
        <option v-for="port in serverPorts" :key="`server:${port}`" :value="`server:${port}`">
          {{ port }}
        </option>
      </optgroup>
    </select>
    <button class="port-btn" @click="handleSet" :disabled="!selected || selected === currentKey || loading">
      Set
    </button>
    <button class="port-refresh" @click="loadPorts" :disabled="loading" title="Refresh MIDI outputs">
      {{ loading ? '…' : '↻' }}
    </button>
    <span v-if="error" class="port-error" :title="error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { clearPort, getPorts, setPort } from '../api/client';
import {
  loadBrowserMidiOutputs,
  onBrowserMidiStateChange,
  clearBrowserMidiOutput,
  selectBrowserMidiOutput,
  type BrowserMidiOutput,
} from '../api/midi';

const serverPorts = ref<string[]>([]);
const browserPorts = ref<BrowserMidiOutput[]>([]);
const selected = ref('');
const currentKey = ref('');
const current = ref('');
const loading = ref(false);
const error = ref('');

function portLabel(key: string): string {
  if (key.startsWith('browser:')) {
    return browserPorts.value.find((port) => `browser:${port.id}` === key)?.name ?? key;
  }
  return key.replace(/^server:/, '');
}

async function loadPorts() {
  loading.value = true;
  error.value = '';
  try {
    const [serverResult, browserResult] = await Promise.allSettled([
      getPorts(),
      loadBrowserMidiOutputs(),
    ]);

    if (serverResult.status === 'fulfilled') {
      serverPorts.value = serverResult.value.ports;
      if (serverResult.value.error && !browserPorts.value.length) error.value = serverResult.value.error;
    } else if (!browserPorts.value.length) {
      error.value = 'MIDI server unavailable';
    }

    if (browserResult.status === 'fulfilled') {
      browserPorts.value = browserResult.value;
      if (browserPorts.value.length) error.value = '';
    } else if (!serverPorts.value.length) {
      error.value = browserResult.reason instanceof Error
        ? browserResult.reason.message
        : 'Unable to access browser MIDI';
    }

    const browserKey = browserPorts.value.length ? `browser:${browserPorts.value[0].id}` : '';
    const serverKey = serverResult.status === 'fulfilled' && serverResult.value.current
      ? `server:${serverResult.value.current}`
      : '';
    if (!selected.value || !availableKeys().includes(selected.value)) {
      selected.value = serverKey || browserKey || (serverPorts.value[0] ? `server:${serverPorts.value[0]}` : '');
    }
    if (!currentKey.value || !availableKeys().includes(currentKey.value)) {
      currentKey.value = selected.value;
      current.value = portLabel(selected.value);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load MIDI outputs';
  } finally {
    loading.value = false;
  }
}

function availableKeys(): string[] {
  return [
    ...browserPorts.value.map((port) => `browser:${port.id}`),
    ...serverPorts.value.map((port) => `server:${port}`),
  ];
}

async function handleSet() {
  if (!selected.value) return;
  error.value = '';
  try {
    if (selected.value.startsWith('browser:')) {
      const id = selected.value.slice('browser:'.length);
      await clearPort();
      if (!selectBrowserMidiOutput(id)) throw new Error('The browser MIDI output is no longer available. Refresh the list.');
    } else {
      await setPort(selected.value.slice('server:'.length));
      clearBrowserMidiOutput();
    }
    currentKey.value = selected.value;
    current.value = portLabel(selected.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to select MIDI output';
  }
}

onMounted(loadPorts);
const removeStateListener = onBrowserMidiStateChange(loadPorts);
onUnmounted(removeStateListener);
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
  color: var(--on-accent);
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

.port-refresh {
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 0.36rem 0.55rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.port-refresh:disabled {
  opacity: 0.4;
  cursor: wait;
}

.port-error {
  max-width: 260px;
  overflow: hidden;
  color: var(--coral);
  font-size: 0.65rem;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
