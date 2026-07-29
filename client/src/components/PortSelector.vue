<template>
  <div class="port-selector">
    <label class="port-field">
      <span class="port-label">MIDI IN</span>
      <select v-model="selectedInput" class="port-select" @change="handleInputChange">
        <option value="">None</option>
        <option v-for="port in browserInputs" :key="port.id" :value="port.id">
          {{ port.name }}
        </option>
      </select>
    </label>

    <label class="port-field">
      <span class="port-label">MIDI OUT</span>
      <select v-model="selectedOutput" class="port-select" @change="handleOutputChange">
        <option value="">None</option>
        <optgroup v-if="browserOutputs.length" label="Browser MIDI">
          <option v-for="port in browserOutputs" :key="`browser:${port.id}`" :value="`browser:${port.id}`">
            {{ port.name }}
          </option>
        </optgroup>
        <optgroup v-if="serverPorts.length" label="Native MIDI">
          <option v-for="port in serverPorts" :key="`server:${port}`" :value="`server:${port}`">
            {{ port }}
          </option>
        </optgroup>
      </select>
    </label>

    <span
      class="sustain-status"
      :class="{ active: midiSustainDown }"
      :title="midiSustainDown ? 'MIDI CC #64 · Sustain pedal down' : 'MIDI CC #64 · Sustain pedal up'"
    >
      SUSTAIN {{ midiSustainDown ? 'ON' : 'OFF' }}
    </span>
    <span
      v-if="midiLastControl && midiLastControl.controller !== 64"
      class="midi-control-status"
      :title="`Incoming MIDI CC #${midiLastControl.controller} · Value ${midiLastControl.value}`"
    >
      CC {{ midiLastControl.controller }} {{ midiLastControl.value }}
    </span>
    <button class="port-refresh" @click="loadPorts" :disabled="loading" title="Refresh MIDI devices">
      {{ loading ? '…' : '↻' }}
    </button>
    <span v-if="error" class="port-error" :title="error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { clearPort, getPorts, setPort, setServerMidiOutputEnabled } from '../api/client';
import {
  clearBrowserMidiInput,
  clearMidiOutput,
  loadBrowserMidiDevices,
  onBrowserMidiStateChange,
  selectBrowserMidiInput,
  selectBrowserMidiOutput,
  selectNativeMidiOutput,
  selectedBrowserMidiInputId,
  selectedMidiOutputId,
  midiLastControl,
  midiSustainDown,
  type BrowserMidiInput,
  type BrowserMidiOutput,
} from '../api/midi';

const serverPorts = ref<string[]>([]);
const browserInputs = ref<BrowserMidiInput[]>([]);
const browserOutputs = ref<BrowserMidiOutput[]>([]);
const selectedInput = ref(selectedBrowserMidiInputId());
const selectedOutput = ref(selectedMidiOutputId());
const loading = ref(false);
const error = ref('');

function availableOutputKeys(): string[] {
  return [
    ...browserOutputs.value.map((port) => `browser:${port.id}`),
    ...serverPorts.value.map((port) => `server:${port}`),
  ];
}

async function loadPorts(): Promise<void> {
  loading.value = true;
  error.value = '';
  const [serverResult, browserResult] = await Promise.allSettled([getPorts(), loadBrowserMidiDevices()]);

  if (serverResult.status === 'fulfilled') serverPorts.value = serverResult.value.ports;
  if (browserResult.status === 'fulfilled') {
    browserInputs.value = browserResult.value.inputs;
    browserOutputs.value = browserResult.value.outputs;
  }

  if (browserResult.status === 'rejected' && serverResult.status === 'rejected') {
    error.value = browserResult.reason instanceof Error
      ? browserResult.reason.message
      : 'Unable to access MIDI devices';
  } else if (serverResult.status === 'rejected' && !browserOutputs.value.length) {
    error.value = 'Native MIDI server unavailable';
  }

  if (selectedInput.value && !browserInputs.value.some((port) => port.id === selectedInput.value)) {
    selectedInput.value = '';
    clearBrowserMidiInput();
  }

  const savedOutput = selectedMidiOutputId();
  if (savedOutput && availableOutputKeys().includes(savedOutput)) {
    selectedOutput.value = savedOutput;
    if (savedOutput.startsWith('server:') && serverResult.status === 'fulfilled') {
      const port = savedOutput.slice('server:'.length);
      try {
        if (serverResult.value.current !== port) await setPort(port);
        await setServerMidiOutputEnabled(true);
      } catch {
        clearMidiOutput();
        selectedOutput.value = '';
      }
    }
  } else if (savedOutput) {
    clearMidiOutput();
    selectedOutput.value = '';
  }

  loading.value = false;
}

function handleInputChange(): void {
  if (!selectedInput.value) clearBrowserMidiInput();
  else if (!selectBrowserMidiInput(selectedInput.value)) {
    selectedInput.value = '';
    error.value = 'The selected MIDI input is no longer available.';
  }
}

async function handleOutputChange(): Promise<void> {
  error.value = '';
  const route = selectedOutput.value;
  try {
    if (!route) {
      clearMidiOutput();
      try {
        await clearPort();
        await setServerMidiOutputEnabled(false);
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Native MIDI server unavailable';
      }
      return;
    }

    if (route.startsWith('browser:')) {
      if (!selectBrowserMidiOutput(route.slice('browser:'.length))) throw new Error('Browser MIDI output is no longer available.');
      try {
        await clearPort();
        await setServerMidiOutputEnabled(false);
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Native MIDI server unavailable';
      }
      return;
    }

    const port = route.slice('server:'.length);
    await setPort(port);
    await setServerMidiOutputEnabled(true);
    selectNativeMidiOutput(port);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to select MIDI output';
    selectedOutput.value = selectedMidiOutputId();
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
  min-width: 0;
}

.port-field {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.port-label {
  color: #69717b;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.port-select {
  max-width: 160px;
  background: var(--surface-raised);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 0.42rem 0.45rem;
  font-size: 0.68rem;
}

.port-select option,
.port-select optgroup {
  background: var(--surface-raised);
  color: var(--text);
}

.sustain-status,
.midi-control-status {
  padding: 0.42rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--muted);
  font-size: 0.52rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.sustain-status {
  display: inline-block;
  width: 5.8rem;
  text-align: center;
}

.sustain-status.active {
  color: var(--acid);
  border-color: var(--accent-line);
}

.midi-control-status {
  color: var(--muted);
  border-color: var(--line);
}

.port-refresh {
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 0.34rem 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.port-refresh:disabled {
  opacity: 0.4;
  cursor: wait;
}

.port-error {
  max-width: 180px;
  overflow: hidden;
  color: var(--coral);
  font-size: 0.6rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .port-selector {
    flex-wrap: wrap;
  }
}
</style>
