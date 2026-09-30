import { reactive, ref, watch } from 'vue';
import { NoteRegistry } from '@midi-toolbox/core';
import { startTone, type ToneHandle } from '../audio/engine';
import { readStoredSettings, updateStoredSettings } from '../infrastructure/persistence/settings';

export interface BrowserMidiOutput {
  id: string;
  name: string;
  manufacturer?: string;
  state?: string;
  connection?: string;
}
export type BrowserMidiInput = BrowserMidiOutput;
export interface MidiNoteInput {
  note: number;
  velocity: number;
  channel: number;
  timestamp: number;
}
const settings = readStoredSettings();
let access: MIDIAccess | null = null;
let accessRequest: Promise<MIDIAccess> | null = null;
let selectedInputId = settings.midiInputId ?? '';
const selectedRoute = ref(settings.midiOutputId ?? '');
const deviceVersion = ref(0);
export const midiInputEnabled = ref(Boolean(selectedInputId));
export const midiOutputEnabled = ref(Boolean(selectedRoute.value));
export const midiSustainDown = ref(false);
export const midiLastControl = ref<{ controller: number; value: number } | null>(null);
export const midiError = ref('');
export const midiThru = ref(false);
export const inputChannel = ref(-1);
export const inputNotes = reactive(new Set<number>());
const subscribers = new Set<(event: MidiNoteInput) => void>();
const stateSubscribers = new Set<() => void>();
const inputTones = new Map<
  string,
  { note: number; channel: number; tone: ToneHandle; thru?: () => void }
>();
const sustained = new Map<string, { channel: number; tone: ToneHandle }>();
const sustainChannels = new Set<number>();
const registries = new Map<MIDIOutput, NoteRegistry>();
const usedChannels = new Map<MIDIOutput, Set<number>>();
const thruChannels = new Map<MIDIOutput, Set<number>>();
const scheduled = new Set<{
  output: MIDIOutput;
  note: number;
  channel: number;
  timers: number[];
}>();
let attachedInput: MIDIInput | null = null;

function output(): MIDIOutput | undefined {
  void deviceVersion.value;
  return selectedRoute.value.startsWith('browser:')
    ? access?.outputs.get(selectedRoute.value.slice(8))
    : undefined;
}
function report(error: unknown): void {
  midiError.value = error instanceof Error ? error.message : String(error);
}
function send(port: MIDIOutput, data: number[], at?: number): void {
  try {
    if ((data[0] & 0xf0) === 0x90 && data[2] > 0) {
      const channels = usedChannels.get(port) ?? new Set<number>();
      channels.add(data[0] & 0x0f);
      usedChannels.set(port, channels);
    }
    port.send(data, at);
  } catch (error) {
    report(error);
    throw error;
  }
}
function registry(port: MIDIOutput): NoteRegistry {
  let notes = registries.get(port);
  if (!notes) {
    notes = new NoteRegistry(
      (n, v, c) => send(port, [0x90 + c, n, v]),
      (n, c) => send(port, [0x80 + c, n, 0]),
    );
    registries.set(port, notes);
  }
  return notes;
}
export function startBrowserNote(note: number, velocity = 100, channel = 2): (() => void) | null {
  const port = output();
  if (!midiOutputEnabled.value || !port || port.state === 'disconnected') return null;
  const id = crypto.randomUUID(),
    notes = registry(port);
  try {
    notes.press(id, note, velocity, channel);
  } catch {
    return null;
  }
  return () => {
    try {
      notes.release(id);
    } catch {
      /* Error is already exposed. */
    }
  };
}
export function scheduleBrowserNote(
  note: number,
  velocity: number,
  channel: number,
  at: number,
  duration: number,
): void {
  const port = output();
  if (!midiOutputEnabled.value || !port) return;
  const start = Math.max(performance.now(), at),
    end = start + duration * 1000;
  const item = { output: port, note, channel, timers: [] as number[] };
  // clear() is specified by Web MIDI but not implemented by every browser.
  // Without it, keep future messages in our own cancellable queue.
  if ('clear' in port && typeof port.clear === 'function') {
    send(port, [0x90 + channel, note, velocity], start);
    send(port, [0x80 + channel, note, 0], end);
  } else {
    const queue = (data: number[], at: number) =>
      item.timers.push(
        window.setTimeout(
          () => {
            try {
              send(port, data);
            } catch {
              /* Exposed via midiError. */
            }
          },
          Math.max(0, at - performance.now()),
        ),
      );
    queue([0x90 + channel, note, velocity], start);
    queue([0x80 + channel, note, 0], end);
  }
  item.timers.push(
    window.setTimeout(() => scheduled.delete(item), Math.max(0, end - performance.now()) + 50),
  );
  scheduled.add(item);
}
export function stopBrowserMidiPlayback(): void {
  const ports = new Set([...scheduled].map((item) => item.output));
  for (const port of ports) {
    try {
      if ('clear' in port && typeof port.clear === 'function') port.clear();
    } catch (error) {
      report(error);
    }
  }
  for (const item of scheduled) {
    for (const timer of item.timers) window.clearTimeout(timer);
    try {
      send(item.output, [0x80 + item.channel, item.note, 0]);
    } catch {
      /* Continue releasing other notes. */
    }
  }
  scheduled.clear();
}
export function panicBrowserMidi(): void {
  stopBrowserMidiPlayback();
  stopInputTones();
  for (const notes of registries.values()) {
    try {
      notes.releaseAll();
    } catch (error) {
      report(error);
    }
  }
  for (const [port, channels] of usedChannels) {
    for (const channel of channels) {
      for (const controller of [64, 123, 120]) {
        try {
          send(port, [0xb0 + channel, controller, 0]);
        } catch (error) {
          report(error);
        }
      }
    }
  }
  usedChannels.clear();
  registries.clear();
}
function stopInputTones(): void {
  stopThru();
  for (const entry of inputTones.values()) {
    entry.tone.stop();
    entry.thru?.();
  }
  for (const entry of sustained.values()) entry.tone.stop();
  inputTones.clear();
  sustained.clear();
  inputNotes.clear();
  sustainChannels.clear();
  midiSustainDown.value = false;
  midiLastControl.value = null;
}
function stopThru(): void {
  for (const entry of inputTones.values()) {
    entry.thru?.();
    entry.thru = undefined;
  }
  for (const [port, channels] of thruChannels) {
    for (const channel of channels) {
      try {
        send(port, [0xb0 + channel, 64, 0]);
      } catch {
        /* Continue releasing other channels. */
      }
    }
  }
  thruChannels.clear();
}
watch(
  midiThru,
  (enabled) => {
    if (!enabled) stopThru();
  },
  { flush: 'sync' },
);
function updatePressed(note: number) {
  if ([...inputTones.values()].some((entry) => entry.note === note)) inputNotes.add(note);
  else inputNotes.delete(note);
}
function canThru(): boolean {
  const port = output();
  if (!midiThru.value || !port || !attachedInput) return false;
  if (port.id === attachedInput.id || port.name === attachedInput.name) {
    midiThru.value = false;
    midiError.value = 'MIDI Thru is disabled when input and output refer to the same device.';
    return false;
  }
  return true;
}
function configureInput(): void {
  if (attachedInput) attachedInput.onmidimessage = null;
  attachedInput = access?.inputs.get(selectedInputId) ?? null;
  if (!attachedInput || attachedInput.state === 'disconnected') {
    midiInputEnabled.value = false;
    stopInputTones();
    return;
  }
  midiInputEnabled.value = true;
  attachedInput.onmidimessage = (event) => {
    const data = event.data;
    if (!data || data.length < 3) return;
    const command = data[0] & 0xf0,
      channel = data[0] & 0x0f,
      note = data[1],
      velocity = data[2];
    if (inputChannel.value !== -1 && channel !== inputChannel.value) return;
    if (command === 0xb0) {
      midiLastControl.value = { controller: note, value: velocity };
      if (note === 64) {
        if (velocity >= 64) sustainChannels.add(channel);
        else {
          sustainChannels.delete(channel);
          for (const [key, entry] of sustained)
            if (entry.channel === channel) {
              entry.tone.release();
              sustained.delete(key);
            }
        }
        midiSustainDown.value = sustainChannels.size > 0;
      }
      if (canThru()) {
        try {
          const port = output()!;
          const channels = thruChannels.get(port) ?? new Set<number>();
          channels.add(channel);
          thruChannels.set(port, channels);
          send(port, [...data]);
        } catch {
          /* Exposed via midiError. */
        }
      }
      return;
    }
    if (command !== 0x90 && command !== 0x80) return;
    const on = command === 0x90 && velocity > 0,
      key = `${channel}:${note}`;
    if (on) {
      sustained.get(key)?.tone.stop();
      sustained.delete(key);
      const previous = inputTones.get(key);
      previous?.tone.stop();
      previous?.thru?.();
      inputTones.set(key, {
        note,
        channel,
        tone: startTone(note, velocity, 'input'),
        thru: canThru() ? (startBrowserNote(note, velocity, channel) ?? undefined) : undefined,
      });
    } else {
      const entry = inputTones.get(key);
      inputTones.delete(key);
      entry?.thru?.();
      if (entry) {
        if (sustainChannels.has(channel)) sustained.set(key, { channel, tone: entry.tone });
        else entry.tone.release();
      }
    }
    updatePressed(note);
    for (const handler of subscribers)
      handler({
        note,
        velocity: on ? velocity : 0,
        channel,
        timestamp: event.timeStamp || performance.now(),
      });
  };
}
export async function loadBrowserMidiDevices(): Promise<{
  inputs: BrowserMidiInput[];
  outputs: BrowserMidiOutput[];
}> {
  if (!navigator.requestMIDIAccess)
    throw new Error(
      'Web MIDI is not supported here. Use a compatible browser on localhost or HTTPS.',
    );
  if (!access) {
    accessRequest ??= navigator.requestMIDIAccess();
    try {
      access = await accessRequest;
    } finally {
      accessRequest = null;
    }
    access.onstatechange = () => {
      deviceVersion.value++;
      configureInput();
      if (
        selectedRoute.value.startsWith('browser:') &&
        (!output() || output()?.state === 'disconnected')
      ) {
        panicBrowserMidi();
        midiError.value = 'The selected MIDI output was disconnected.';
      }
      for (const handler of stateSubscribers) handler();
    };
  }
  deviceVersion.value++;
  configureInput();
  const describe = ({ id, name, manufacturer, state, connection }: MIDIPort) => ({
    id,
    name: name || 'Unnamed MIDI device',
    manufacturer: manufacturer ?? undefined,
    state,
    connection,
  });
  return {
    inputs: [...access.inputs.values()].filter((p) => p.state !== 'disconnected').map(describe),
    outputs: [...access.outputs.values()].filter((p) => p.state !== 'disconnected').map(describe),
  };
}
export function onBrowserMidiStateChange(handler: () => void): () => void {
  stateSubscribers.add(handler);
  return () => {
    stateSubscribers.delete(handler);
  };
}
export function onBrowserMidiNote(handler: (event: MidiNoteInput) => void): () => void {
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}
export function selectedBrowserMidiInputId(): string {
  return selectedInputId;
}
export function selectedMidiOutputId(): string {
  return selectedRoute.value;
}
export function selectBrowserMidiInput(id: string): boolean {
  if (!access?.inputs.has(id)) return false;
  stopInputTones();
  selectedInputId = id;
  midiInputEnabled.value = true;
  updateStoredSettings({ midiInputId: id });
  configureInput();
  return true;
}
export function clearBrowserMidiInput(): void {
  stopInputTones();
  selectedInputId = '';
  midiInputEnabled.value = false;
  updateStoredSettings({ midiInputId: '' });
  configureInput();
}
export function selectBrowserMidiOutput(id: string): boolean {
  if (!access?.outputs.has(id)) return false;
  panicBrowserMidi();
  selectedRoute.value = `browser:${id}`;
  midiOutputEnabled.value = true;
  updateStoredSettings({ midiOutputId: selectedRoute.value });
  return true;
}
export function selectNativeMidiOutput(port: string): void {
  panicBrowserMidi();
  selectedRoute.value = `server:${port}`;
  midiOutputEnabled.value = true;
  updateStoredSettings({ midiOutputId: selectedRoute.value });
}
export function clearMidiOutput(): void {
  panicBrowserMidi();
  selectedRoute.value = '';
  midiOutputEnabled.value = false;
  updateStoredSettings({ midiOutputId: '' });
}
export function hasSelectedBrowserMidiOutput(): boolean {
  return Boolean(output() && output()?.state !== 'disconnected');
}
export function hasSelectedNativeMidiOutput(): boolean {
  return selectedRoute.value.startsWith('server:');
}
export function setInputChannel(channel: number): void {
  stopInputTones();
  inputChannel.value = channel;
}
