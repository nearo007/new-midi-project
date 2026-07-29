import { ref } from 'vue';
import { startTone, type ToneHandle } from './audio';
import { readStoredSettings, updateStoredSettings } from './settings';

export interface BrowserMidiOutput {
  id: string;
  name: string;
  manufacturer?: string;
  state?: string;
  connection?: string;
}

export interface BrowserMidiInput extends BrowserMidiOutput {}

let access: MIDIAccess | null = null;
let selectedOutputId = '';
let selectedInputId = readStoredSettings().midiInputId ?? '';
let stateChangeHandler: (() => void) | null = null;
const storedSettings = readStoredSettings();
const selectedRoute = ref(storedSettings.midiOutputId ?? '');
export const midiInputEnabled = ref(Boolean(selectedInputId));
export const midiOutputEnabled = ref(Boolean(selectedRoute.value));
export const midiSustainDown = ref(false);
export const midiLastControl = ref<{ controller: number; value: number } | null>(null);
const midiNoteHandlers = new Set<(note: number, velocity: number) => void>();
const inputHandlers = new Map<string, (event: MIDIMessageEvent) => void>();
const inputToneStops = new Map<number, ToneHandle>();
const sustainedToneStops = new Map<number, ToneHandle>();
const activeNotes = new Map<number, number>();
const scheduledTimers = new Set<number>();

function outputList(): BrowserMidiOutput[] {
  return access ? [...access.outputs.values()].map(({ id, name, manufacturer, state, connection }) => ({
    id,
    name: name || 'Unnamed MIDI output',
    manufacturer: manufacturer ?? undefined,
    state,
    connection,
  })) : [];
}

function inputList(): BrowserMidiInput[] {
  return access ? [...access.inputs.values()].map(({ id, name, manufacturer, state, connection }) => ({
    id,
    name: name || 'Unnamed MIDI input',
    manufacturer: manufacturer ?? undefined,
    state,
    connection,
  })) : [];
}

function selectedOutput(): MIDIOutput | null {
  return access?.outputs.get(selectedOutputId) ?? null;
}

function send(data: number[]): boolean {
  const output = selectedOutput();
  if (!output) return false;
  try {
    output.send(data);
    return true;
  } catch (err) {
    console.warn('Failed to send MIDI message:', err);
    return false;
  }
}

function clearTimer(timer: number): void {
  window.clearTimeout(timer);
  scheduledTimers.delete(timer);
}

function schedule(callback: () => void, delay: number): void {
  const timer = window.setTimeout(() => {
    scheduledTimers.delete(timer);
    callback();
  }, delay);
  scheduledTimers.add(timer);
}

function stopInputTones(): void {
  for (const tone of inputToneStops.values()) tone.stop();
  for (const tone of sustainedToneStops.values()) tone.stop();
  inputToneStops.clear();
  sustainedToneStops.clear();
  midiSustainDown.value = false;
  midiLastControl.value = null;
}

function releaseSustainedTones(): void {
  // A note released while the pedal is down must remain held. Begin its
  // release only when the pedal comes back up; stopping here creates a sudden
  // level change and makes the pedal itself click/pop.
  for (const tone of sustainedToneStops.values()) tone.release();
  sustainedToneStops.clear();
}

function disconnectBrowserMidiInputs(): void {
  for (const [id, handler] of inputHandlers) {
    const input = access?.inputs.get(id);
    if (input?.onmidimessage === handler) input.onmidimessage = null;
    inputHandlers.delete(id);
  }
}

function configureBrowserMidiInputs(): void {
  if (!access) return;

  disconnectBrowserMidiInputs();
  if (!midiInputEnabled.value || !selectedInputId) return;

  const input = access.inputs.get(selectedInputId);
  if (!input) {
    clearBrowserMidiInput();
    return;
  }

  const handler = (event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 3 || !midiInputEnabled.value) return;
    const command = data[0] & 0xf0;
    const note = data[1];
    const velocity = data[2];

    if (command === 0xb0) {
      midiLastControl.value = { controller: note, value: velocity };
      if (note === 64) {
        const sustainDown = velocity >= 64;
        midiSustainDown.value = sustainDown;
        if (!sustainDown) releaseSustainedTones();
      }
      return;
    }

    if (command !== 0x90 && command !== 0x80) return;
    const noteOn = command === 0x90 && velocity > 0;
    if (noteOn) {
      sustainedToneStops.get(note)?.stop();
      sustainedToneStops.delete(note);
      inputToneStops.get(note)?.stop();
      inputToneStops.set(note, startTone(note, velocity));
    } else {
      const stop = inputToneStops.get(note);
      inputToneStops.delete(note);
      if (midiSustainDown.value && stop) {
        // Keep the voice at its sustain level until CC64 is released.
        sustainedToneStops.set(note, stop);
      } else stop?.release();
    }

    for (const notify of midiNoteHandlers) notify(note, noteOn ? velocity : 0);
  };

  inputHandlers.set(input.id, handler);
  input.onmidimessage = handler;
}

export async function loadBrowserMidiDevices(): Promise<{
  inputs: BrowserMidiInput[];
  outputs: BrowserMidiOutput[];
}> {
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
    throw new Error('Web MIDI is not supported by this browser. Use Chrome or Edge on localhost.');
  }

  if (!access) {
    access = await navigator.requestMIDIAccess();
    access.onstatechange = () => {
      if (selectedInputId && !access?.inputs.has(selectedInputId)) clearBrowserMidiInput();
      if (selectedRoute.value.startsWith('browser:') && !access?.outputs.has(selectedOutputId)) clearMidiOutput();
      configureBrowserMidiInputs();
      stateChangeHandler?.();
    };
  }

  if (selectedRoute.value.startsWith('browser:')) {
    selectedOutputId = selectedRoute.value.slice('browser:'.length);
    if (!access.outputs.has(selectedOutputId)) clearMidiOutput();
  }
  configureBrowserMidiInputs();
  return { inputs: inputList(), outputs: outputList() };
}

export async function loadBrowserMidiOutputs(): Promise<BrowserMidiOutput[]> {
  return (await loadBrowserMidiDevices()).outputs;
}

export async function loadBrowserMidiInputs(): Promise<BrowserMidiInput[]> {
  return (await loadBrowserMidiDevices()).inputs;
}

export function onBrowserMidiStateChange(handler: () => void): () => void {
  stateChangeHandler = handler;
  return () => {
    if (stateChangeHandler === handler) stateChangeHandler = null;
  };
}

export function onBrowserMidiNote(handler: (note: number, velocity: number) => void): () => void {
  midiNoteHandlers.add(handler);
  return () => midiNoteHandlers.delete(handler);
}

export function selectedBrowserMidiInputId(): string {
  return selectedInputId;
}

export function selectBrowserMidiInput(id: string): boolean {
  if (!access?.inputs.has(id)) return false;
  stopInputTones();
  selectedInputId = id;
  midiInputEnabled.value = true;
  updateStoredSettings({ midiInputId: id, midiInputEnabled: true });
  configureBrowserMidiInputs();
  return true;
}

export function clearBrowserMidiInput(): void {
  stopInputTones();
  disconnectBrowserMidiInputs();
  selectedInputId = '';
  midiInputEnabled.value = false;
  updateStoredSettings({ midiInputId: '', midiInputEnabled: false });
}

// Kept as a compatibility API for callers that used the former IN toggle.
export function setBrowserMidiInputEnabled(enabled: boolean): void {
  if (!enabled) clearBrowserMidiInput();
  else {
    midiInputEnabled.value = Boolean(selectedInputId);
    updateStoredSettings({ midiInputEnabled: midiInputEnabled.value });
    configureBrowserMidiInputs();
  }
}

export function selectedMidiOutputId(): string {
  return selectedRoute.value;
}

export function selectBrowserMidiOutput(id: string): boolean {
  if (!access?.outputs.has(id)) return false;
  stopBrowserMidiPlayback();
  selectedOutputId = id;
  selectedRoute.value = `browser:${id}`;
  midiOutputEnabled.value = true;
  updateStoredSettings({ midiOutputId: selectedRoute.value, midiOutputEnabled: true });
  return true;
}

export function selectNativeMidiOutput(port: string): void {
  stopBrowserMidiPlayback();
  selectedOutputId = '';
  selectedRoute.value = `server:${port}`;
  midiOutputEnabled.value = true;
  updateStoredSettings({ midiOutputId: selectedRoute.value, midiOutputEnabled: true });
}

export function clearMidiOutput(): void {
  stopBrowserMidiPlayback();
  selectedOutputId = '';
  selectedRoute.value = '';
  midiOutputEnabled.value = false;
  updateStoredSettings({ midiOutputId: '', midiOutputEnabled: false });
}

// Compatibility API for integrations that still expose an output power
// toggle. The selected device remains the source of truth for new callers.
export function setBrowserMidiOutputEnabled(enabled: boolean): void {
  if (!enabled) clearMidiOutput();
  else if (selectedRoute.value) {
    midiOutputEnabled.value = true;
    updateStoredSettings({ midiOutputEnabled: true });
  }
}

// Compatibility alias for the previous combined selector.
export function clearBrowserMidiOutput(): void {
  clearMidiOutput();
}

export function selectedBrowserMidiOutputId(): string {
  return selectedRoute.value.startsWith('browser:') ? selectedOutputId : '';
}

export function hasSelectedBrowserMidiOutput(): boolean {
  return selectedRoute.value.startsWith('browser:') && selectedOutput() !== null;
}

export function hasSelectedNativeMidiOutput(): boolean {
  return selectedRoute.value.startsWith('server:');
}

export function sendBrowserNoteOn(note: number, velocity = 100): boolean {
  if (!midiOutputEnabled.value || !hasSelectedBrowserMidiOutput()) return false;
  const sent = send([0x90, note, velocity]);
  if (sent) activeNotes.set(note, (activeNotes.get(note) ?? 0) + 1);
  return sent;
}

export function sendBrowserNoteOff(note: number): boolean {
  const count = activeNotes.get(note);
  if (!count) return false;
  if (count > 1) {
    activeNotes.set(note, count - 1);
    return true;
  }
  activeNotes.delete(note);
  return send([0x80, note, 0]);
}

export function stopBrowserMidiPlayback(): void {
  for (const timer of scheduledTimers) clearTimer(timer);
  for (const note of activeNotes.keys()) send([0x80, note, 0]);
  activeNotes.clear();
}

export function playBrowserChordWithMelody(
  chordNotes: number[],
  melodyNotes: number[],
  intervalSeconds: number,
  harmonyVelocity = 100,
  melodyVelocity = 88,
): boolean {
  if (!midiOutputEnabled.value || !hasSelectedBrowserMidiOutput()) return false;
  stopBrowserMidiPlayback();

  const duration = Math.max(1, intervalSeconds * 1000);
  for (const note of chordNotes) {
    if (sendBrowserNoteOn(note, harmonyVelocity)) schedule(() => sendBrowserNoteOff(note), duration);
  }

  if (melodyNotes.length > 0) {
    const slot = duration / melodyNotes.length;
    const melodyDuration = slot * 0.72;
    melodyNotes.forEach((note, index) => {
      schedule(() => {
        if (!sendBrowserNoteOn(note, melodyVelocity)) return;
        schedule(() => sendBrowserNoteOff(note), melodyDuration);
      }, index * slot);
    });
  }
  return true;
}
