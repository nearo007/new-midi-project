import { ref, watch } from 'vue';
import type { MelodyNote } from '@midi-toolbox/core';
import { onBrowserMidiNote, midiInputEnabled } from '../../midi/devices';
import {
  isRunning,
  startTransport,
  stopTransport,
  transportStartTime,
  transportState,
} from '../../playback/transport';
import { project, editProject, materializeMelody } from './editor';
export const recording = ref(false),
  recordingMessage = ref('');
let removeListener: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
let finish: ((cancel?: boolean) => void) | undefined;
let preparing = false;
export async function startRecording(append = false): Promise<void> {
  if (recording.value || preparing) return;
  if (!midiInputEnabled.value) {
    recordingMessage.value = 'Select a MIDI input before recording.';
    return;
  }
  preparing = true;
  await stopTransport();
  preparing = false;
  if (append && project.value.melodyNotes === null) materializeMelody();
  const snapshot = project.value,
    total = snapshot.chords.reduce((sum, c) => sum + c.durationBeats, 0);
  const pending = new Map<
      string,
      { note: number; velocity: number; channel: number; beat: number }
    >(),
    notes: MelodyNote[] = [];
  recording.value = true;
  recordingMessage.value = 'Recording a full progression. Playback stops after one pass.';
  editProject((p) => {
    p.loop = null;
  });
  let start = Infinity;
  const beatAt = (timestamp: number) =>
    Math.max(0, Math.min(total, ((timestamp - start) * snapshot.bpm) / 60000));
  const close = (key: string, beat: number) => {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    if (
      entry.beat > total - 0.001 ||
      notes.length >= 2048 - (append ? (snapshot.melodyNotes?.length ?? 0) : 0)
    )
      return;
    notes.push({
      id: crypto.randomUUID(),
      note: entry.note,
      velocity: entry.velocity,
      sourceChannel: entry.channel,
      startBeat: entry.beat,
      durationBeats: Math.max(0.001, Math.min(total - entry.beat, beat - entry.beat)),
    });
  };
  finish = (cancel = false) => {
    if (!recording.value) return;
    recording.value = false;
    removeListener?.();
    removeListener = undefined;
    if (timer) clearTimeout(timer);
    timer = undefined;
    for (const key of [...pending.keys()]) close(key, beatAt(performance.now()));
    void stopTransport();
    editProject((p) => {
      if (p.id !== snapshot.id) return;
      p.loop = snapshot.loop;
      if (!cancel && notes.length) {
        p.melodyNotes = append ? [...(snapshot.melodyNotes ?? []), ...notes] : notes;
        p.melody.enabled = p.playback.melody = true;
      }
    });
    recordingMessage.value = cancel
      ? 'Recording cancelled.'
      : notes.length
        ? `${notes.length} notes recorded. Quantize or edit them below.`
        : 'No notes recorded. The existing melody was preserved.';
  };
  await startTransport(true);
  if (!recording.value) return;
  if (!isRunning.value) {
    finish(true);
    return;
  }
  start = transportStartTime();
  removeListener = onBrowserMidiNote((event) => {
    if (event.timestamp < start || event.timestamp >= start + (total * 60000) / snapshot.bpm)
      return;
    const key = `${event.channel}:${event.note}`,
      beat = beatAt(event.timestamp);
    if (event.velocity > 0) {
      close(key, beat);
      pending.set(key, {
        note: event.note,
        velocity: event.velocity,
        channel: event.channel,
        beat,
      });
    } else close(key, beat);
  });
  timer = setTimeout(
    () => finish?.(),
    Math.max(0, start + (total * 60000) / snapshot.bpm - performance.now()),
  );
}
export function stopRecording(): void {
  finish?.();
}
watch(transportState, (state) => {
  if (recording.value && (state === 'idle' || state === 'error')) finish?.();
});
watch(
  () =>
    JSON.stringify([
      project.value.id,
      project.value.bpm,
      project.value.chords.map((c) => [c.id, c.durationBeats]),
    ]),
  () => {
    if (!recording.value) return;
    finish?.(true);
    recordingMessage.value =
      'Recording cancelled because the project timing changed. The existing melody was preserved.';
  },
  { flush: 'sync' },
);
