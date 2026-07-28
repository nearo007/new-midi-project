import { ref } from 'vue';
import { startTone } from './audio';
import { readStoredSettings, updateStoredSettings } from './settings';

export interface BrowserMidiOutput {
  id: string;
  name: string;
  manufacturer?: string;
  state?: string;
  connection?: string;
}

let access: MIDIAccess | null = null;
let selectedOutputId = '';
let browserOutputDisabled = false;
let stateChangeHandler: (() => void) | null = null;
const storedSettings = readStoredSettings();
export const midiInputEnabled = ref(storedSettings.midiInputEnabled ?? true);
export const midiOutputEnabled = ref(storedSettings.midiOutputEnabled ?? true);
export const midiSustainDown = ref(false);
export const midiLastControl = ref<{ controller: number; value: number } | null>(null);
const midiNoteHandlers = new Set<(note: number, velocity: number) => void>();
const inputHandlers = new Map<string, (event: MIDIMessageEvent) => void>();
const inputToneStops = new Map<number, () => void>();
const sustainedToneStops = new Map<number, () => void>();
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
  for (const stop of inputToneStops.values()) stop();
  for (const stop of sustainedToneStops.values()) stop();
  inputToneStops.clear();
  sustainedToneStops.clear();
  midiSustainDown.value = false;
}

function releaseSustainedTones(): void {
  for (const stop of sustainedToneStops.values()) stop();
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

  for (const [id, handler] of inputHandlers) {
    if (access.inputs.has(id)) continue;
    const input = access.inputs.get(id);
    if (input && input.onmidimessage === handler) input.onmidimessage = null;
    inputHandlers.delete(id);
  }

  if (!midiInputEnabled.value) {
    disconnectBrowserMidiInputs();
    return;
  }

  access.inputs.forEach((input) => {
    if (inputHandlers.has(input.id)) return;
    const handler = (event: MIDIMessageEvent) => {
      const data = event.data;
      if (!data || data.length < 3) return;
      const command = data[0] & 0xf0;
      const note = data[1];
      const velocity = data[2];
      if (!midiInputEnabled.value) return;

      if (command === 0xb0) {
        midiLastControl.value = { controller: note, value: velocity };
        // Standard MIDI CC #64 is the damper/sustain pedal.
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
        sustainedToneStops.get(note)?.();
        sustainedToneStops.delete(note);
        inputToneStops.get(note)?.();
        inputToneStops.set(note, startTone(note, velocity));
      } else {
        const stop = inputToneStops.get(note);
        inputToneStops.delete(note);
        if (midiSustainDown.value && stop) sustainedToneStops.set(note, stop);
        else stop?.();
      }

      for (const notify of midiNoteHandlers) notify(note, noteOn ? velocity : 0);
    };
    inputHandlers.set(input.id, handler);
    input.onmidimessage = handler;
  });
}

export async function loadBrowserMidiOutputs(): Promise<BrowserMidiOutput[]> {
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
    throw new Error('Web MIDI is not supported by this browser. Use Chrome or Edge on localhost.');
  }

  if (!access) {
    access = await navigator.requestMIDIAccess();
    access.onstatechange = () => {
      configureBrowserMidiInputs();
      if (stateChangeHandler) stateChangeHandler();
    };
  }

  configureBrowserMidiInputs();

  if (!browserOutputDisabled && (!selectedOutputId || !access.outputs.has(selectedOutputId))) {
    selectedOutputId = access.outputs.keys().next().value ?? '';
  }
  return outputList();
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

export function setBrowserMidiInputEnabled(enabled: boolean): void {
  midiInputEnabled.value = enabled;
  updateStoredSettings({ midiInputEnabled: enabled });
  if (!enabled) stopInputTones();
  configureBrowserMidiInputs();
}

export function setBrowserMidiOutputEnabled(enabled: boolean): void {
  if (!enabled) stopBrowserMidiPlayback();
  midiOutputEnabled.value = enabled;
  updateStoredSettings({ midiOutputEnabled: enabled });
}

export function selectBrowserMidiOutput(id: string): boolean {
  if (!access?.outputs.has(id)) return false;
  stopBrowserMidiPlayback();
  browserOutputDisabled = false;
  selectedOutputId = id;
  return true;
}

export function clearBrowserMidiOutput(): void {
  stopBrowserMidiPlayback();
  browserOutputDisabled = true;
  selectedOutputId = '';
}

export function selectedBrowserMidiOutputId(): string {
  return selectedOutputId;
}

export function hasSelectedBrowserMidiOutput(): boolean {
  return selectedOutput() !== null;
}

export function sendBrowserNoteOn(note: number, velocity = 100): boolean {
  if (!midiOutputEnabled.value) return false;
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
