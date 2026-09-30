import {
  compileProject,
  LoopScheduler,
  NoteRegistry,
  systemClock,
  type Clock,
  type Project,
  type SequenceStep,
} from '@midi-toolbox/core';
import type { MidiOutput } from '../ports/midi-output.js';

export class ConflictError extends Error {
  readonly status = 409;
  readonly code = 'PLAYBACK_CONFLICT';
}
export interface PlaybackLog {
  event: 'start' | 'update' | 'stop' | 'error';
  runId: number;
  revision: number;
  device: string;
  error?: string;
}
export class PlayerService {
  private scheduler: LoopScheduler;
  private notes: NoteRegistry;
  private timers = new Set<unknown>();
  private leaseTimer: unknown;
  private liveTimers = new Map<string, unknown>();
  private usedChannels = new Set<number>();
  private owner: string | null = null;
  private runId = 0;
  private revision = 0;
  private currentChordId: string | null = null;
  private stepId = -1;
  private playing = false;
  private enabled = false;
  private error: string | null = null;
  private project: Project | null = null;
  constructor(
    private midi: MidiOutput,
    private clock: Clock = systemClock,
    private onEvent: (event: PlaybackLog) => void = () => {},
  ) {
    this.notes = new NoteRegistry(
      (note, velocity, channel) => {
        if (this.enabled) {
          this.usedChannels.add(channel);
          this.midi.sendNoteOn(note, velocity, channel);
        }
      },
      (note, channel) => this.midi.sendNoteOff(note, channel),
    );
    this.scheduler = new LoopScheduler(
      clock,
      (step, at, bpm, occurrence) => this.playStep(step, at, bpm, occurrence),
      (error) => this.fail(error),
    );
  }
  status() {
    return {
      playing: this.playing,
      currentChord:
        this.project?.chords.findIndex((chord) => chord.id === this.currentChordId) ?? -1,
      currentChordId: this.currentChordId,
      stepId: this.stepId,
      runId: this.runId,
      revision: this.revision,
      owner: this.owner,
      error: this.error,
      serverTime: Date.now(),
    };
  }
  checkOwner(owner: string): void {
    if (this.playing && this.owner !== owner)
      throw new ConflictError('Another tab owns native playback. Stop it there or use Panic.');
  }
  start(project: Project, owner: string, revision = 0, delayMs = 100) {
    this.checkOwner(owner);
    const sequence = compileProject(project);
    this.stop(owner);
    this.project = project;
    this.owner = owner;
    this.revision = revision;
    this.playing = true;
    this.error = null;
    if (owner !== 'legacy') this.heartbeat(owner);
    const startAt = Date.now() + delayMs;
    this.scheduler.start(sequence, this.clock.now() + delayMs);
    this.log('start');
    return { ...this.status(), startAt };
  }
  update(project: Project, owner: string, revision: number, applyAt?: number): void {
    this.checkOwner(owner);
    if (!this.playing) throw new ConflictError('No progression is currently playing');
    const sequence = compileProject(project);
    if (revision <= this.revision)
      throw new ConflictError('This update is older than the current revision');
    this.project = project;
    this.revision = revision;
    this.scheduler.update(
      sequence,
      applyAt === undefined ? -Infinity : this.clock.now() + applyAt - Date.now(),
    );
    this.log('update');
  }
  stop(owner?: string): void {
    if (owner) this.checkOwner(owner);
    if (this.playing) this.log('stop');
    this.scheduler.stop();
    if (this.leaseTimer !== undefined) this.clock.clearTimer(this.leaseTimer);
    this.leaseTimer = undefined;
    this.runId++;
    this.playing = false;
    this.owner = null;
    this.currentChordId = null;
    this.stepId = -1;
    for (const timer of this.timers) this.clock.clearTimer(timer);
    this.timers.clear();
    this.notes.releaseAll('loop:');
  }
  heartbeat(owner: string): void {
    this.checkOwner(owner);
    if (!this.playing) throw new ConflictError('No active playback');
    if (this.leaseTimer !== undefined) this.clock.clearTimer(this.leaseTimer);
    this.leaseTimer = this.clock.setTimer(
      () => this.fail(new Error('Playback stopped because its browser session disconnected.')),
      10000,
    );
  }
  panic(): void {
    let failure: unknown;
    try {
      this.stop();
    } catch (error) {
      failure = error;
    }
    for (const timer of this.liveTimers.values()) this.clock.clearTimer(timer);
    this.liveTimers.clear();
    try {
      this.notes.releaseAll();
    } catch (error) {
      failure = error;
    }
    for (const channel of this.usedChannels) {
      try {
        this.midi.resetChannel(channel);
      } catch (error) {
        failure = error;
      }
    }
    this.usedChannels.clear();
    if (failure) throw failure;
  }
  setMidiOutputEnabled(enabled: boolean): void {
    if (!enabled) this.panic();
    this.enabled = enabled;
  }
  isMidiOutputEnabled(): boolean {
    return this.enabled;
  }
  press(id: string, note: number, velocity: number, channel = 2): void {
    if (!this.enabled || !this.midi.currentPort())
      throw new ConflictError('Select a native MIDI output first');
    if (this.liveTimers.size >= 128 && !this.liveTimers.has(id))
      throw new ConflictError('Too many held notes');
    this.notes.press(`live:${id}`, note, velocity, channel);
    if (!this.liveTimers.has(id)) this.liveTimers.set(id, undefined);
    this.renew(id);
  }
  renew(id: string): void {
    if (!this.liveTimers.has(id)) return;
    const previous = this.liveTimers.get(id);
    if (previous !== undefined) this.clock.clearTimer(previous);
    this.liveTimers.set(
      id,
      this.clock.setTimer(() => {
        try {
          this.release(id);
        } catch (error) {
          this.fail(error);
        }
      }, 10000),
    );
  }
  release(id: string): void {
    const timer = this.liveTimers.get(id);
    if (timer !== undefined) this.clock.clearTimer(timer);
    this.liveTimers.delete(id);
    this.notes.release(`live:${id}`);
  }
  releaseSession(session: string): void {
    for (const id of [...this.liveTimers.keys()]) {
      if (!id.startsWith(`${session}:`)) continue;
      const timer = this.liveTimers.get(id);
      if (timer !== undefined) this.clock.clearTimer(timer);
      this.liveTimers.delete(id);
    }
    this.notes.releaseAll(`live:${session}:`);
  }
  private schedule(callback: () => void, at: number): void {
    const run = this.runId;
    const timer = this.clock.setTimer(
      () => {
        this.timers.delete(timer);
        if (run !== this.runId || !this.playing) return;
        try {
          callback();
        } catch (error) {
          this.fail(error);
        }
      },
      Math.max(0, at - this.clock.now()),
    );
    this.timers.add(timer);
  }
  private playStep(step: SequenceStep, at: number, bpm: number, occurrence: number): void {
    this.currentChordId = step.chordId;
    this.stepId = occurrence;
    step.events.forEach((event, i) => {
      const id = `loop:${this.runId}:${occurrence}:${i}`;
      const start = at + (event.startBeat * 60000) / bpm;
      this.schedule(() => this.notes.press(id, event.note, event.velocity, event.channel), start);
      this.schedule(() => this.notes.release(id), start + (event.durationBeats * 60000) / bpm);
    });
  }
  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.log('error');
    try {
      this.panic();
    } catch {
      /* Keep the original device error in the snapshot. */
    }
  }
  private log(event: PlaybackLog['event']): void {
    this.onEvent({
      event,
      runId: this.runId,
      revision: this.revision,
      device: this.midi.currentPort(),
      ...(event === 'error' ? { error: this.error ?? 'Unknown playback error' } : {}),
    });
  }
}
