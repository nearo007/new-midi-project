import type { MidiOutput } from '../infrastructure/midi/midi-output.js';
import type { Config } from '../infrastructure/config.js';
import { calcInterval, calcNoteDuration, calcSilenceDuration } from '../core/timing.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SequenceEntry {
  notes: number[];
  muted: boolean;
}

export class PlayerService {
  private midi: MidiOutput;
  private config: Config;
  private playing = false;
  private loopTimeout: ReturnType<typeof setTimeout> | null = null;
  private _currentChordIndex = -1;

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

  async playSequence(sequence: SequenceEntry[]): Promise<void> {
    const interval = calcInterval(this.config.bpm, this.config.timeSignature);
    const noteDuration = calcNoteDuration(interval, this.config.staccato);
    const silenceDuration = calcSilenceDuration(interval, noteDuration);

    for (const entry of sequence) {
      if (!this.playing) break;
      if (!entry.muted) {
        for (const note of entry.notes) {
          this.midi.sendNoteOn(note, 100);
        }
      }
      await sleep(noteDuration * 1000);
      if (!entry.muted) {
        for (const note of entry.notes) {
          this.midi.sendNoteOff(note);
        }
      }
      await sleep(silenceDuration * 1000);
    }
    this.playing = false;
  }

  async loopSequence(sequence: SequenceEntry[]): Promise<void> {
    this.stopLoop();
    await sleep(100);

    this.playing = true;
    const interval = calcInterval(this.config.loopBpm, this.config.timeSignature);
    const noteDuration = calcNoteDuration(interval, this.config.loopStaccato);
    const silenceDuration = calcSilenceDuration(interval, noteDuration);

    while (this.playing) {
      for (let i = 0; i < sequence.length; i++) {
        if (!this.playing) break;
        const entry = sequence[i];
        this._currentChordIndex = i;
        if (!entry.muted) {
          for (const note of entry.notes) {
            this.midi.sendNoteOn(note, 100);
          }
        }
        await sleep(noteDuration * 1000);
        if (!entry.muted) {
          for (const note of entry.notes) {
            this.midi.sendNoteOff(note);
          }
        }
        await sleep(silenceDuration * 1000);
      }
    }
    this._currentChordIndex = -1;
  }

  stopLoop(): void {
    this.playing = false;
    this._currentChordIndex = -1;
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }
  }
}
