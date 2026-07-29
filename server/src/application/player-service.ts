import type { MidiOutput } from '../infrastructure/midi/midi-output.js';
import type { Config } from '../infrastructure/config.js';
import { calcInterval, calcNoteDuration, calcSilenceDuration } from '../core/timing.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SequenceEntry {
  notes: number[];
  muted: boolean;
  velocity?: number;
  melodyNotes?: number[];
  melodyVelocity?: number;
}

export class PlayerService {
  private midi: MidiOutput;
  private config: Config;
  private playing = false;
  private loopTimeout: ReturnType<typeof setTimeout> | null = null;
  private _currentChordIndex = -1;
  private activeLoopSequence: SequenceEntry[] | null = null;
  private loopRunId = 0;
  private nextNoteToken = 1;
  private activeNoteTokens = new Map<number, number>();
  private midiOutputEnabled = false;

  constructor(midi: MidiOutput, config: Config) {
    this.midi = midi;
    this.config = config;
  }

  setBpm(bpm: number): void {
    this.config.bpm = bpm;
  }

  setLoopBpm(bpm: number): void {
    this.config.loopBpm = bpm;
  }

  setStaccato(value: number): void {
    this.config.staccato = value;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  get currentChordIndex(): number {
    return this._currentChordIndex;
  }

  setMidiOutputEnabled(enabled: boolean): void {
    if (this.midiOutputEnabled === enabled) return;
    if (!enabled) this.releaseAllNotes();
    this.midiOutputEnabled = enabled;
  }

  isMidiOutputEnabled(): boolean {
    return this.midiOutputEnabled;
  }

  private noteOn(note: number, velocity = 100): number {
    if (!this.midiOutputEnabled) return 0;
    const token = this.nextNoteToken++;
    this.activeNoteTokens.set(token, note);
    this.midi.sendNoteOn(note, velocity);
    return token;
  }

  private noteOff(token: number): void {
    if (!token) return;
    const note = this.activeNoteTokens.get(token);
    if (note === undefined) return;
    this.activeNoteTokens.delete(token);
    if (this.midiOutputEnabled) this.midi.sendNoteOff(note);
  }

  private releaseTokens(tokens: number[]): void {
    for (const token of tokens) this.noteOff(token);
  }

  private releaseAllNotes(): void {
    const tokens = [...this.activeNoteTokens.keys()];
    this.releaseTokens(tokens);
  }

  private async waitUntil(deadline: number, runId: number): Promise<void> {
    while (this.playing && runId === this.loopRunId) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      await sleep(Math.min(remaining, 10));
    }
  }

  private async playLoopEntry(
    entry: SequenceEntry,
    noteDuration: number,
    runId: number,
    windowStart: number,
  ): Promise<void> {
    const chordTokens: number[] = [];
    const melodyTokens: number[] = [];
    const melodyNotes = entry.melodyNotes ?? [];

    if (!entry.muted) {
      for (const note of entry.notes) chordTokens.push(this.noteOn(note, entry.velocity ?? 100));
    }

    if (melodyNotes.length > 0) {
      // Divide the chord's active window into melodic slots. A small rest at
      // the end of each slot keeps the line distinct from a sustained chord.
      const slotDuration = noteDuration / melodyNotes.length;
      const melodyDuration = slotDuration * 0.72;

      for (const [index, note] of melodyNotes.entries()) {
        if (!this.playing || runId !== this.loopRunId) break;
        const token = this.noteOn(note, entry.melodyVelocity ?? 88);
        melodyTokens.push(token);
        await this.waitUntil(windowStart + (index * slotDuration + melodyDuration) * 1000, runId);
        this.noteOff(token);
        await this.waitUntil(windowStart + ((index + 1) * slotDuration) * 1000, runId);
      }

      // If a loop was stopped during the final rest, there is no extra wait
      // needed here: all melody tokens have already been released.
    } else {
      await this.waitUntil(windowStart + noteDuration * 1000, runId);
    }

    this.releaseTokens(melodyTokens);
    this.releaseTokens(chordTokens);

  }

  async playSequence(sequence: SequenceEntry[]): Promise<void> {
    const interval = calcInterval(this.config.bpm, this.config.timeSignature);
    const noteDuration = calcNoteDuration(interval, this.config.staccato);
    const silenceDuration = calcSilenceDuration(interval, noteDuration);

    for (const entry of sequence) {
      const tokens: number[] = [];
      if (!entry.muted) {
        for (const note of entry.notes) tokens.push(this.noteOn(note, entry.velocity ?? 100));
      }
      await sleep(noteDuration * 1000);
      this.releaseTokens(tokens);
      await sleep(silenceDuration * 1000);
    }
  }

  async loopSequence(sequence: SequenceEntry[]): Promise<void> {
    this.stopLoop();

    const runId = this.loopRunId;
    this.activeLoopSequence = sequence;
    this.playing = true;
    let sequenceIndex = 0;
    let nextBoundary = Date.now();

    while (this.playing && runId === this.loopRunId) {
      const activeSequence = this.activeLoopSequence;
      if (!activeSequence || activeSequence.length === 0) break;
      if (sequenceIndex >= activeSequence.length) sequenceIndex = 0;

      const entry = activeSequence[sequenceIndex];
      this._currentChordIndex = sequenceIndex;
      sequenceIndex += 1;

      // Read the tempo at each chord boundary so a live BPM update changes
      // the next step without interrupting the chord currently sounding.
      const interval = calcInterval(this.config.loopBpm, this.config.timeSignature);
      const noteDuration = calcNoteDuration(interval, this.config.loopStaccato);
      const intervalMilliseconds = interval * 1000;
      const boundary = nextBoundary;
      await this.playLoopEntry(entry, noteDuration, runId, boundary);
      nextBoundary = boundary + intervalMilliseconds;
      // Keep the clock anchored to chord boundaries. If a heavily loaded
      // process misses a whole beat, recover from the current time instead of
      // trying to play a burst of overdue chords.
      if (nextBoundary < Date.now() - intervalMilliseconds) nextBoundary = Date.now();
      await this.waitUntil(nextBoundary, runId);
    }

    if (runId === this.loopRunId) {
      this.releaseAllNotes();
      this.playing = false;
      this.activeLoopSequence = null;
      this._currentChordIndex = -1;
    }
  }

  updateLoopSequence(sequence: SequenceEntry[]): boolean {
    if (!this.playing) return false;
    this.activeLoopSequence = sequence;
    return true;
  }

  stopLoop(): void {
    this.playing = false;
    this.loopRunId += 1;
    this.releaseAllNotes();
    this.activeLoopSequence = null;
    this._currentChordIndex = -1;
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }
  }
}
