import type { CompiledSequence, SequenceStep } from './sequence.js';
export interface Clock {
  now(): number;
  setTimer(callback: () => void, delay: number): unknown;
  clearTimer(handle: unknown): void;
}
export const systemClock: Clock = {
  now: () => performance.now(),
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
/** Each callback is an occurrence, even when the sequence has only one step. */
export class LoopScheduler {
  private timer: unknown;
  private sequence: CompiledSequence | null = null;
  private pending: CompiledSequence | null = null;
  private applyAfter = -Infinity;
  private nextAt = 0;
  private index = 0;
  private occurrence = 0;
  private beat = 0;
  constructor(
    private clock: Clock,
    private onStep: (
      step: SequenceStep,
      at: number,
      bpm: number,
      occurrence: number,
      beat: number,
    ) => void,
    private onError: (error: unknown) => void,
    private lookahead = 0,
  ) {}
  start(sequence: CompiledSequence, at = this.clock.now()): void {
    this.stop();
    this.sequence = sequence;
    this.nextAt = at;
    this.index = 0;
    this.occurrence = 0;
    this.beat = 0;
    this.tick();
  }
  update(sequence: CompiledSequence, applyAfter = -Infinity): void {
    this.pending = sequence;
    this.applyAfter = applyAfter;
  }
  stop(): void {
    if (this.timer !== undefined) this.clock.clearTimer(this.timer);
    this.timer = undefined;
    this.sequence = null;
    this.pending = null;
  }
  private tick = (): void => {
    this.timer = undefined;
    if (!this.sequence) return;
    try {
      const now = this.clock.now();
      if (this.nextAt <= now + this.lookahead) {
        if (this.pending && this.nextAt >= this.applyAfter) {
          this.sequence = this.pending;
          this.pending = null;
        }
        const sequence = this.sequence;
        this.index %= sequence.steps.length;
        const step = sequence.steps[this.index];
        if (!step) throw new Error('Cannot play an empty sequence');
        const duration = (step.durationBeats * 60000) / sequence.bpm;
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid step duration');
        if (this.nextAt < now - duration) this.nextAt = now;
        this.onStep(step, this.nextAt, sequence.bpm, this.occurrence++, this.beat);
        this.nextAt += duration;
        this.beat += step.durationBeats;
        this.index++;
      }
      if (this.sequence)
        this.timer = this.clock.setTimer(
          this.tick,
          Math.max(1, Math.min(20, this.nextAt - this.clock.now() - this.lookahead)),
        );
    } catch (error) {
      this.stop();
      this.onError(error);
    }
  };
}

/** Same-pitch owners share one attack until the last owner releases it. Channels remain independent. */
export class NoteRegistry {
  private owners = new Map<string, { note: number; channel: number }>();
  constructor(
    private sendOn: (note: number, velocity: number, channel: number) => void,
    private sendOff: (note: number, channel: number) => void,
  ) {}
  press(id: string, note: number, velocity: number, channel: number): void {
    if (this.owners.has(id)) return;
    const active = [...this.owners.values()].some(
      (owner) => owner.note === note && owner.channel === channel,
    );
    if (!active) this.sendOn(note, velocity, channel);
    this.owners.set(id, { note, channel });
  }
  release(id: string): void {
    const owner = this.owners.get(id);
    if (!owner) return;
    this.owners.delete(id);
    if (
      ![...this.owners.values()].some(
        (other) => other.note === owner.note && other.channel === owner.channel,
      )
    )
      this.sendOff(owner.note, owner.channel);
  }
  releaseAll(prefix = ''): void {
    let failure: unknown;
    for (const id of [...this.owners.keys()]) {
      if (!id.startsWith(prefix)) continue;
      try {
        this.release(id);
      } catch (error) {
        failure = error;
      }
    }
    if (failure) throw failure;
  }
}
