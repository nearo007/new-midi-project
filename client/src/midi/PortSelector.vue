<template>
  <div class="port-selector">
    <label
      >MIDI IN<select
        v-model="selectedInput"
        aria-label="MIDI IN"
        :disabled="loading || changing"
        @change="changeInput"
      >
        <option value="">None</option>
        <option v-for="port in inputs" :key="port.id" :value="port.id">{{ port.name }}</option>
      </select></label
    >
    <label
      >MIDI OUT<select
        v-model="selectedOutput"
        aria-label="MIDI OUT"
        :disabled="loading || changing"
        @change="changeOutput"
      >
        <option value="">None</option>
        <optgroup v-if="outputs.length" label="Browser MIDI">
          <option v-for="port in outputs" :key="port.id" :value="`browser:${port.id}`">
            {{ port.name }}
          </option>
        </optgroup>
        <optgroup v-if="ports.length" label="Native MIDI">
          <option v-for="port in ports" :key="port" :value="`server:${port}`">{{ port }}</option>
        </optgroup>
      </select></label
    >
    <button @click="load" :disabled="loading || changing" aria-label="Refresh MIDI devices">
      {{ loading ? 'Loading…' : 'Refresh' }}
    </button>
    <details>
      <summary>MIDI details{{ midiSustainDown ? ' · Sustain on' : '' }}</summary>
      <div class="device-details">
        <p v-if="browserError" role="status">Browser: {{ browserError }}</p>
        <p v-else>Browser: {{ inputs.length }} inputs · {{ outputs.length }} outputs</p>
        <p v-if="serverError" role="status">Native: {{ serverError }}</p>
        <p v-else>Native: {{ ports.length }} outputs</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <label
          >Input channel<select
            :value="inputChannel"
            @change="setInputChannel(Number(($event.target as HTMLSelectElement).value))"
          >
            <option :value="-1">All channels</option>
            <option v-for="n in 16" :key="n" :value="n - 1">{{ n }}</option>
          </select></label
        >
        <label class="thru"
          ><input
            type="checkbox"
            v-model="midiThru"
            :disabled="!selectedInput || !selectedOutput.startsWith('browser:')"
          />
          MIDI Thru to browser output</label
        >
        <p>
          Thru is off by default. Use different input and output devices to avoid a MIDI feedback
          loop.
        </p>
        <p>
          Sustain {{ midiSustainDown ? 'on' : 'off'
          }}<span v-if="midiLastControl">
            · CC {{ midiLastControl.controller }}: {{ midiLastControl.value }}</span
          >
        </p>
      </div>
    </details>
    <span v-if="changing" role="status">Connecting…</span
    ><span v-if="error" role="alert" class="selection-error">{{ error }}</span>
  </div>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { getPorts, setPort, clearPort } from '../infrastructure/http/client';
import {
  loadBrowserMidiDevices,
  onBrowserMidiStateChange,
  selectedBrowserMidiInputId,
  selectedMidiOutputId,
  selectBrowserMidiInput,
  clearBrowserMidiInput,
  selectBrowserMidiOutput,
  selectNativeMidiOutput,
  clearMidiOutput,
  inputChannel,
  setInputChannel,
  midiThru,
  midiSustainDown,
  midiLastControl,
  type BrowserMidiInput,
  type BrowserMidiOutput,
} from './devices';
import { stopTransport } from '../playback/transport';
import { releaseHeldNotes } from '../features/piano/performance';
const inputs = ref<BrowserMidiInput[]>([]),
  outputs = ref<BrowserMidiOutput[]>([]),
  ports = ref<string[]>([]);
const selectedInput = ref(selectedBrowserMidiInputId()),
  selectedOutput = ref(selectedMidiOutputId());
const loading = ref(false),
  changing = ref(false),
  error = ref(''),
  browserError = ref(''),
  serverError = ref('');
let restored = false,
  disposed = false;
async function load() {
  if (loading.value || changing.value) return;
  loading.value = true;
  const [server, browser] = await Promise.allSettled([getPorts(), loadBrowserMidiDevices()]);
  if (disposed) return;
  if (server.status === 'fulfilled') {
    ports.value = server.value.ports;
    serverError.value = server.value.error ?? '';
  } else {
    ports.value = [];
    serverError.value = 'Server unavailable';
  }
  if (browser.status === 'fulfilled') {
    inputs.value = browser.value.inputs;
    outputs.value = browser.value.outputs;
    browserError.value = '';
  } else {
    inputs.value = [];
    outputs.value = [];
    browserError.value =
      browser.reason instanceof Error ? browser.reason.message : String(browser.reason);
  }
  if (selectedInput.value && !inputs.value.some((p) => p.id === selectedInput.value))
    selectedInput.value = '';
  const available = [
    ...outputs.value.map((p) => `browser:${p.id}`),
    ...ports.value.map((p) => `server:${p}`),
  ];
  if (!available.includes(selectedMidiOutputId())) selectedOutput.value = '';
  else selectedOutput.value = selectedMidiOutputId();
  loading.value = false;
  if (!restored) {
    restored = true;
    if (selectedOutput.value.startsWith('server:') && server.status === 'fulfilled') {
      changing.value = true;
      try {
        if (server.value.current !== selectedOutput.value.slice(7))
          await setPort(selectedOutput.value.slice(7));
      } catch (e) {
        error.value = String(e);
        clearMidiOutput();
        selectedOutput.value = '';
      } finally {
        changing.value = false;
      }
    }
  }
}
function changeInput() {
  error.value = '';
  if (!selectedInput.value) clearBrowserMidiInput();
  else if (!selectBrowserMidiInput(selectedInput.value))
    error.value = 'Input is no longer available.';
}
async function changeOutput() {
  if (changing.value) return;
  changing.value = true;
  error.value = '';
  const route = selectedOutput.value;
  try {
    await stopTransport();
    releaseHeldNotes();
    if (route.startsWith('server:')) {
      await setPort(route.slice(7));
      selectNativeMidiOutput(route.slice(7));
    } else {
      if (selectedMidiOutputId().startsWith('server:')) await clearPort();
      if (route.startsWith('browser:')) {
        if (!selectBrowserMidiOutput(route.slice(8)))
          throw new Error('Output is no longer available.');
      } else clearMidiOutput();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    clearMidiOutput();
    selectedOutput.value = '';
  } finally {
    changing.value = false;
  }
}
const unsubscribe = onBrowserMidiStateChange(load);
onMounted(load);
onUnmounted(() => {
  disposed = true;
  unsubscribe();
});
</script>
<style scoped>
.port-selector {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  width: 100%;
  font-size: 0.7rem;
}
label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--muted);
  min-width: 0;
}
select {
  min-width: 0;
  max-width: min(200px, 65vw);
}
select,
button {
  padding: 0.45rem;
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  font-size: 0.75rem;
}
button,
summary {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
details {
  position: relative;
  min-width: 0;
}
.device-details {
  display: grid;
  gap: 0.65rem;
  padding: 1rem;
  max-width: 32rem;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  margin-top: 0.5rem;
  line-height: 1.5;
}
.thru {
  flex-wrap: wrap;
}
.selection-error {
  color: var(--coral);
  overflow-wrap: anywhere;
}
@media (max-width: 560px) {
  .port-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
  .port-selector > label {
    flex-direction: column;
    align-items: stretch;
  }
  .port-selector > details,
  .selection-error {
    grid-column: 1/-1;
  }
  select {
    width: 100%;
    max-width: 100%;
  }
}
</style>
