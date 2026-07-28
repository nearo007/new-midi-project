import { ref } from 'vue';
import { readStoredSettings, updateStoredSettings } from './settings';

let audioCtx: AudioContext | null = null;
let audioOutput: {
  dry: GainNode;
  reverb: ConvolverNode;
  wet: GainNode;
} | null = null;
const reverbEnabled = ref(readStoredSettings().reverbEnabled ?? false);

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createImpulse(ctx: AudioContext): AudioBuffer {
  const duration = 2.4;
  const length = Math.floor(ctx.sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const decay = Math.pow(1 - index / length, 2.6);
      data[index] = (Math.random() * 2 - 1) * decay;
    }
  }
  return impulse;
}

function getAudioOutput(ctx: AudioContext) {
  if (audioOutput) return audioOutput;

  const dry = ctx.createGain();
  const reverb = ctx.createConvolver();
  const wet = ctx.createGain();
  reverb.buffer = createImpulse(ctx);
  dry.gain.value = 1;
  wet.gain.value = reverbEnabled.value ? 0.8 : 0;
  dry.connect(ctx.destination);
  reverb.connect(wet);
  wet.connect(ctx.destination);
  audioOutput = { dry, reverb, wet };
  return audioOutput;
}

export { reverbEnabled };

export function setReverbEnabled(enabled: boolean): void {
  reverbEnabled.value = enabled;
  updateStoredSettings({ reverbEnabled: enabled });
  const ctx = getCtx();
  const output = getAudioOutput(ctx);
  const now = ctx.currentTime;
  output.wet.gain.cancelScheduledValues(now);
  output.wet.gain.setTargetAtTime(enabled ? 0.8 : 0, now, 0.03);
}

function connectVoice(gain: GainNode, ctx: AudioContext): void {
  const output = getAudioOutput(ctx);
  gain.connect(output.dry);
  gain.connect(output.reverb);
}

function scheduleTone(ctx: AudioContext, midi: number, start: number, duration: number, volume: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(midiToFreq(midi), start);

  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  osc.connect(gain);
  connectVoice(gain, ctx);

  osc.start(start);
  osc.stop(start + duration);
}

function whenAudioReady(callback: (ctx: AudioContext) => void): void {
  const ctx = getCtx();
  if (ctx.state === 'running') {
    callback(ctx);
    return;
  }
  if (ctx.state !== 'closed') {
    void ctx.resume().then(() => {
      if (ctx.state === 'running') callback(ctx);
    }).catch(() => {});
  }
}

export function playTone(midi: number, duration = 0.3, velocity = 100): void {
  whenAudioReady((ctx) => {
    scheduleTone(ctx, midi, ctx.currentTime, duration, 0.5 * velocity / 127);
  });
}

export function startTone(midi: number, velocity = 100): () => void {
  let stopped = false;
  let stopStartedTone: (() => void) | null = null;

  whenAudioReady((ctx) => {
    if (stopped) return;

    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const volume = 0.5 * velocity / 127;
    let toneStopped = false;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midiToFreq(midi), start);
    gain.gain.setValueAtTime(volume, start);
    osc.connect(gain);
    connectVoice(gain, ctx);
    osc.start(start);

    stopStartedTone = () => {
      if (toneStopped) return;
      toneStopped = true;
      const stopAt = ctx.currentTime;
      gain.gain.cancelScheduledValues(stopAt);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), stopAt);
      gain.gain.exponentialRampToValueAtTime(0.001, stopAt + 0.04);
      osc.stop(stopAt + 0.05);
    };
  });

  return () => {
    if (stopped) return;
    stopped = true;
    stopStartedTone?.();
  };
}

export function playChord(notes: number[], duration = 0.3, velocity = 100): void {
  for (const note of notes) {
    playTone(note, duration, velocity);
  }
}

export function playChordWithMelody(
  chordNotes: number[],
  melodyNotes: number[],
  interval: number,
  harmonyVelocity = 100,
  melodyVelocity = 88,
): void {
  const ctx = getCtx();
  whenAudioReady(() => {
    const now = ctx.currentTime;
    // The progression advances on the interval boundary. Let the chord occupy
    // the full window so the preview does not introduce an audible gap between
    // successive chords.
    const chordDuration = interval;
    for (const note of chordNotes) scheduleTone(ctx, note, now, chordDuration, 0.5 * harmonyVelocity / 127);

    if (melodyNotes.length === 0) return;
    const slot = chordDuration / melodyNotes.length;
    const duration = slot * 0.72;
    melodyNotes.forEach((note, index) => {
      scheduleTone(ctx, note, now + index * slot, duration, 0.32 * melodyVelocity / 127);
    });
  });
}

export async function resumeAudio(): Promise<void> {
  const ctx = getCtx();
  if (ctx.state !== 'running' && ctx.state !== 'closed') {
    await ctx.resume();
  }
}
