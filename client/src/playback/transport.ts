import { computed, ref, watch } from 'vue';
import { compileProject, LoopScheduler, systemClock, type Project } from '@midi-toolbox/core';
import { project } from '../features/chord-lab/editor';
import { resumeAudio, scheduleTone, stopAudio } from '../audio/engine';
import { useSoundMode } from '../audio/sound-mode';
import {
  hasSelectedBrowserMidiOutput,
  hasSelectedNativeMidiOutput,
  selectedMidiOutputId,
  scheduleBrowserNote,
  stopBrowserMidiPlayback,
} from '../midi/devices';
import {
  getProgressionStatus,
  heartbeatPlayback,
  startProgression,
  updateProgression,
  stopProgression,
  panicServer,
  sessionId,
} from '../infrastructure/http/client';
import { panicPerformance } from '../features/piano/performance';

export const transportState = ref<'idle' | 'starting' | 'playing' | 'stopping' | 'error'>('idle');
export const transportError = ref('');
export const currentChordId = ref<string | null>(null);
export const currentStep = ref(-1);
export const isRunning = computed(
  () => transportState.value === 'starting' || transportState.value === 'playing',
);
export const isBusy = computed(
  () => transportState.value === 'starting' || transportState.value === 'stopping',
);
export const playUnavailable = computed(() => {
  if (
    useSoundMode().value === 'none' &&
    !hasSelectedBrowserMidiOutput() &&
    !hasSelectedNativeMidiOutput()
  )
    return 'Choose a sound or a MIDI output to hear playback.';
  if (
    !compileProject(project.value).steps.some((step) => step.events.length) &&
    !project.value.metronome
  )
    return 'Enable a track with notes, unmute a chord, or enable the metronome.';
  return '';
});
let run = 0,
  revision = 0,
  nativeRun = false;
let nativeStart: ReturnType<typeof startProgression> | null = null;
let nativeRunId: number | null = null;
let startTime = 0;
let nativeClockOffset = 0,
  updateLead = 500;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
const markers = new Set<ReturnType<typeof setTimeout>>();
let appliedBpm = 80,
  stepStart = 0,
  stepBeat = 0;
let activeProject: Project = project.value;
const scheduler = new LoopScheduler(
  systemClock,
  (step, at, bpm, occurrence, beat) => {
    const token = run;
    const snapshot = activeProject;
    for (const event of step.events) {
      const start = at + (event.startBeat * 60000) / bpm,
        duration = (event.durationBeats * 60) / bpm;
      scheduleTone(event.note, duration, event.velocity, start);
      if (hasSelectedBrowserMidiOutput())
        scheduleBrowserNote(event.note, event.velocity, event.channel, start, duration);
    }
    if (snapshot.metronome) {
      for (let b = Math.ceil(beat); b < beat + step.durationBeats; b++)
        scheduleTone(
          b % 4 === 0 ? 96 : 89,
          0.045,
          65,
          at + ((b - beat) * 60000) / bpm,
          'transport',
        );
    }
    const marker = setTimeout(
      () => {
        markers.delete(marker);
        if (token !== run) return;
        transportState.value = 'playing';
        currentChordId.value = step.chordId;
        currentStep.value = occurrence;
        stepStart = at;
        stepBeat = beat;
        appliedBpm = bpm;
      },
      Math.max(0, at - performance.now()),
    );
    markers.add(marker);
  },
  (error) => {
    transportError.value = error instanceof Error ? error.message : String(error);
    void stopTransport(true);
  },
  80,
);

export function transportPosition(): number {
  return Math.max(0, stepBeat + ((performance.now() - stepStart) * appliedBpm) / 60000);
}
export function transportStartTime(): number {
  return startTime;
}
function cancelLocal(): void {
  scheduler.stop();
  stopAudio('transport');
  stopBrowserMidiPlayback();
  for (const timer of markers) clearTimeout(timer);
  markers.clear();
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = undefined;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = undefined;
  currentChordId.value = null;
  currentStep.value = -1;
}
async function monitor(token: number): Promise<void> {
  const runId = nativeRunId;
  if (runId === null || token !== run) return;
  try {
    const status = await heartbeatPlayback(runId);
    if (token !== run || !nativeRun) return;
    if (!status.playing || status.owner !== sessionId || status.runId !== runId)
      throw new Error(status.error || 'Native playback stopped or changed ownership.');
  } catch (error) {
    if (token === run) {
      transportError.value = error instanceof Error ? error.message : String(error);
      void stopTransport(true);
    }
    return;
  }
  if (token === run) statusTimer = setTimeout(() => void monitor(token), 1500);
}
export async function startTransport(allowSilent = false): Promise<void> {
  if (isRunning.value || transportState.value === 'stopping') return;
  if (playUnavailable.value && !allowSilent) {
    transportError.value = playUnavailable.value;
    return;
  }
  const token = ++run;
  transportState.value = 'starting';
  transportError.value = '';
  revision = 0;
  activeProject = project.value;
  const snapshot = activeProject;
  nativeRun = hasSelectedNativeMidiOutput();
  nativeRunId = null;
  try {
    await resumeAudio();
    if (token !== run) return;
    const countIn = snapshot.countIn ? (4 * 60000) / snapshot.bpm : 0;
    startTime = performance.now() + 120 + countIn;
    if (nativeRun) {
      const sent = Date.now();
      const request = startProgression(snapshot, revision, 300 + countIn);
      nativeStart = request;
      const response = await request;
      if (nativeStart === request) nativeStart = null;
      // Stop/Panic/pagehide owns cancellation, including a start still in flight.
      if (token !== run) return;
      nativeRunId = response.runId;
      const offset = response.serverTime - (sent + Date.now()) / 2;
      nativeClockOffset = offset;
      updateLead = Math.max(500, (Date.now() - sent) * 3);
      startTime = performance.now() + Math.max(0, response.startAt - offset - Date.now());
    }
    if (snapshot.countIn)
      for (let i = 0; i < 4; i++)
        scheduleTone(
          i === 0 ? 96 : 89,
          0.045,
          75,
          startTime - countIn + (i * 60000) / snapshot.bpm,
          'transport',
        );
    stepStart = startTime;
    stepBeat = 0;
    appliedBpm = snapshot.bpm;
    scheduler.start(compileProject(snapshot), startTime);
    if (nativeRun) statusTimer = setTimeout(() => void monitor(token), 1500);
    if (project.value !== snapshot) queueUpdate();
  } catch (error) {
    if (token === run) {
      cancelLocal();
      nativeRun = false;
      nativeRunId = null;
      nativeStart = null;
      transportState.value = 'error';
      transportError.value = error instanceof Error ? error.message : String(error);
    }
  }
}
export async function stopTransport(failed = false): Promise<void> {
  const wasNative = nativeRun,
    pendingStart = nativeStart,
    previousRunId = nativeRunId,
    token = ++run;
  cancelLocal();
  nativeRun = false;
  nativeRunId = null;
  transportState.value = wasNative ? 'stopping' : failed ? 'error' : 'idle';
  if (wasNative) {
    try {
      const started = await pendingStart?.catch(() => null);
      const runId = previousRunId ?? started?.runId;
      if (runId !== undefined && runId !== null) await stopProgression(runId);
      if (token === run) transportState.value = failed ? 'error' : 'idle';
    } catch (error) {
      if (token === run) {
        transportError.value = `Local audio stopped. Native stop could not be confirmed: ${error instanceof Error ? error.message : String(error)}`;
        transportState.value = 'error';
      }
    }
  }
}
export async function panic(): Promise<void> {
  const token = ++run;
  cancelLocal();
  nativeRun = false;
  nativeRunId = null;
  panicPerformance();
  transportState.value = 'stopping';
  try {
    await nativeStart?.catch(() => {});
    if (hasSelectedNativeMidiOutput()) await panicServer();
    if (token === run) {
      transportError.value = '';
      transportState.value = 'idle';
    }
  } catch (error) {
    if (token === run) {
      transportError.value = String(error);
      transportState.value = 'error';
    }
  }
}
function queueUpdate(): void {
  if (!isRunning.value) return;
  if (nativeRun && nativeRunId === null) return;
  if (updateTimer) clearTimeout(updateTimer);
  const token = run;
  updateTimer = setTimeout(async () => {
    updateTimer = undefined;
    if (token !== run) return;
    const next = project.value,
      runId = nativeRunId,
      nextRevision = ++revision;
    try {
      const applyAfter = nativeRun ? performance.now() + updateLead : -Infinity;
      if (nativeRun) {
        if (runId === null) return;
        await updateProgression(
          next,
          nextRevision,
          Date.now() + nativeClockOffset + updateLead,
          runId,
        );
        if (token === run && performance.now() >= applyAfter - 80)
          throw new Error(
            'The server responded too late to synchronize this edit. Press Play to restart.',
          );
      }
      if (token !== run || nextRevision !== revision) return;
      activeProject = next;
      scheduler.update(compileProject(next), applyAfter);
    } catch (error) {
      if (token === run) {
        transportError.value = `Could not apply the edit: ${error instanceof Error ? error.message : String(error)}`;
        if (nativeRun) void stopTransport(true);
      }
    }
  }, 80);
}
export function initializeTransport(): () => void {
  const unwatch = watch(project, queueUpdate);
  const routeWatch = watch(
    () => selectedMidiOutputId(),
    () => {
      if (isRunning.value) void stopTransport();
    },
  );
  const hide = () => {
    ++run;
    cancelLocal();
    transportState.value = 'idle';
    if (nativeRun) {
      const stop = (runId: number) =>
        fetch('/api/chord-lab/stop-progression', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: sessionId, runId }),
          keepalive: true,
        }).catch(() => {});
      if (nativeRunId !== null) void stop(nativeRunId);
      else if (nativeStart) void nativeStart.then((status) => stop(status.runId)).catch(() => {});
    }
    nativeRun = false;
    nativeRunId = null;
  };
  const visibility = () => {
    if (document.hidden && isRunning.value) {
      transportError.value = 'Playback stopped while the tab was hidden. Press Play to resume.';
      void stopTransport();
    }
  };
  window.addEventListener('pagehide', hide);
  document.addEventListener('visibilitychange', visibility);
  // A new tab may inspect an existing native run, but never adopts another tab's ownership.
  if (hasSelectedNativeMidiOutput())
    void getProgressionStatus()
      .then((status) => {
        if (status.playing && status.owner !== sessionId)
          transportError.value =
            'Native playback is active in another tab. Use that tab or Panic to stop it.';
      })
      .catch(() => {});
  return () => {
    hide();
    unwatch();
    routeWatch();
    window.removeEventListener('pagehide', hide);
    document.removeEventListener('visibilitychange', visibility);
  };
}
