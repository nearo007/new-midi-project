import { project } from '../chord-lab/editor';
import { reactive, ref } from 'vue';
import { startTone, stopAudio } from '../../audio/engine';
import {
  startBrowserNote,
  hasSelectedNativeMidiOutput,
  panicBrowserMidi,
} from '../../midi/devices';
import { noteOn, noteOff, heartbeatNotes, releaseSession } from '../../infrastructure/http/client';
export const heldNotes = reactive(new Set<number>());
export const performanceError = ref('');
const held = new Map<
  string,
  { note: number; release: () => void; stop: () => void; native: boolean }
>();
let heartbeat: ReturnType<typeof setInterval> | undefined;
function report(error: unknown) {
  performanceError.value = error instanceof Error ? error.message : String(error);
}
export function pressNote(note: number, velocity = 100): () => void {
  const liveChannel =
    [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 0, 1].find(
      (channel) =>
        channel !== project.value.tracks.harmony.channel &&
        channel !== project.value.tracks.melody.channel,
    ) ?? 2;
  const id = crypto.randomUUID(),
    local = startTone(note, velocity),
    browserRelease = startBrowserNote(note, velocity, liveChannel);
  const native = !browserRelease && hasSelectedNativeMidiOutput();
  let released = false;
  const pending = native
    ? noteOn(id, note, velocity, liveChannel).catch(report)
    : Promise.resolve();
  const off = () => {
    if (released) return;
    released = true;
    browserRelease?.();
    if (native) void pending.then(() => noteOff(id)).catch(report);
    held.delete(id);
    if (![...held.values()].some((v) => v.note === note)) heldNotes.delete(note);
  };
  held.set(id, {
    note,
    native,
    release: () => {
      local.release();
      off();
    },
    stop: () => {
      local.stop();
      off();
    },
  });
  heldNotes.add(note);
  if (native && !heartbeat)
    heartbeat = setInterval(() => {
      const ids = [...held].filter(([, v]) => v.native).map(([id]) => id);
      if (ids.length) void heartbeatNotes(ids).catch(report);
      else {
        clearInterval(heartbeat);
        heartbeat = undefined;
      }
    }, 3000);
  return () => held.get(id)?.release();
}
export function releaseHeldNotes(): void {
  for (const entry of [...held.values()]) entry.stop();
  heldNotes.clear();
}
export function panicPerformance(): void {
  releaseHeldNotes();
  stopAudio();
  panicBrowserMidi();
}
export function initializePerformance(): () => void {
  const release = () => {
    releaseHeldNotes();
    if (hasSelectedNativeMidiOutput()) void releaseSession().catch(report);
  };
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', release);
  return () => {
    release();
    window.removeEventListener('blur', release);
    window.removeEventListener('pagehide', release);
    if (heartbeat) clearInterval(heartbeat);
  };
}
