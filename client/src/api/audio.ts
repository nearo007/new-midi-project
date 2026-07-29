import { ref, watch } from 'vue';
import { PIANO_SAMPLES } from '../assets/piano/piano-samples';
import { readStoredSettings, updateStoredSettings } from './settings';
import { setSoundMode, useSoundMode } from './sound-toggle';

let audioCtx: AudioContext | null = null;
let audioOutput: {
  dry: GainNode;
  reverb: ConvolverNode;
  wet: GainNode;
} | null = null;
const reverbEnabled = ref(readStoredSettings().reverbEnabled ?? false);
const pianoBufferCache = new Map<number, Promise<AudioBuffer | null>>();
const pianoBuffers = new Map<number, AudioBuffer>();
const soundMode = useSoundMode();

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
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
  dry.gain.value = soundMode.value === 'none' ? 0 : 1;
  wet.gain.value = reverbEnabled.value && soundMode.value !== 'none' ? 0.8 : 0;
  dry.connect(ctx.destination);
  reverb.connect(wet);
  wet.connect(ctx.destination);
  audioOutput = { dry, reverb, wet };
  return audioOutput;
}

watch(soundMode, (mode) => {
  if (!audioOutput) return;
  const now = getCtx().currentTime;
  audioOutput.dry.gain.setTargetAtTime(mode === 'none' ? 0 : 1, now, 0.01);
  audioOutput.wet.gain.setTargetAtTime(mode === 'none' || !reverbEnabled.value ? 0 : 0.8, now, 0.01);
});

export { reverbEnabled };

export function setReverbEnabled(enabled: boolean): void {
  reverbEnabled.value = enabled;
  updateStoredSettings({ reverbEnabled: enabled });
  const ctx = getCtx();
  const output = getAudioOutput(ctx);
  const now = ctx.currentTime;
  output.wet.gain.cancelScheduledValues(now);
  output.wet.gain.setTargetAtTime(enabled && soundMode.value !== 'none' ? 0.8 : 0, now, 0.03);
}

function connectVoice(gain: GainNode, ctx: AudioContext): void {
  const output = getAudioOutput(ctx);
  gain.connect(output.dry);
  gain.connect(output.reverb);
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function decodePcmWav(ctx: AudioContext, wav: ArrayBuffer): AudioBuffer | null {
  try {
    const view = new DataView(wav);
    if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) return null;
    let channels = 1;
    let sampleRate = 8000;
    let bitsPerSample = 16;
    let dataOffset = -1;
    let dataSize = 0;

    for (let offset = 12; offset + 8 <= view.byteLength; ) {
      const chunk = view.getUint32(offset, false);
      const size = view.getUint32(offset + 4, true);
      if (chunk === 0x666d7420 && size >= 16) {
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);
      } else if (chunk === 0x64617461) {
        dataOffset = offset + 8;
        dataSize = Math.min(size, view.byteLength - dataOffset);
        break;
      }
      offset += 8 + size + (size % 2);
    }

    if (dataOffset < 0 || bitsPerSample !== 16 || channels < 1) return null;
    const frameCount = Math.floor(dataSize / (channels * 2));
    const audioBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
    for (let channel = 0; channel < channels; channel += 1) {
      const output = audioBuffer.getChannelData(channel);
      for (let frame = 0; frame < frameCount; frame += 1) {
        output[frame] = view.getInt16(dataOffset + (frame * channels + channel) * 2, true) / 32768;
      }
    }
    return audioBuffer;
  } catch {
    return null;
  }
}

function sampleFor(midi: number) {
  return PIANO_SAMPLES.reduce((closest, sample) =>
    Math.abs(sample.midi - midi) < Math.abs(closest.midi - midi) ? sample : closest,
  PIANO_SAMPLES[0]);
}

function loadPianoBuffer(ctx: AudioContext, midi: number): Promise<AudioBuffer | null> {
  const sample = sampleFor(midi);
  const ready = pianoBuffers.get(sample.midi);
  if (ready) return Promise.resolve(ready);
  const cached = pianoBufferCache.get(sample.midi);
  if (cached) return cached;

  const wav = decodeBase64(sample.wavBase64);
  // The bundled asset is PCM, so parse it synchronously first. This matters
  // for short MIDI notes: startTone must be able to create the sample voice
  // before a quick note-off arrives.
  const pcm = decodePcmWav(ctx, wav);
  if (pcm) {
    pianoBuffers.set(sample.midi, pcm);
    const decoded = Promise.resolve(pcm);
    pianoBufferCache.set(sample.midi, decoded);
    return decoded;
  }

  const decoded = ctx.decodeAudioData(wav.slice(0)).catch(() => decodePcmWav(ctx, wav));
  pianoBufferCache.set(sample.midi, decoded);
  return decoded;
}

function scheduleSynthTone(
  ctx: AudioContext,
  midi: number,
  start: number,
  duration: number,
  volume: number,
  _mode: 'piano' | '8bit',
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const end = Math.max(start + 0.05, start + duration);
  const frequency = midiToFreq(midi);

  // This is the shared synthesized fallback for Piano and the 8-bit option.
  // Keeping one voice here guarantees both paths behave identically when a
  // sample is unavailable.
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume * 0.38, 0.001), start + 0.09);
  gain.gain.exponentialRampToValueAtTime(0.001, end);

  osc.connect(gain);
  connectVoice(gain, ctx);
  osc.start(start);
  osc.stop(end + 0.02);
}

async function schedulePianoAttack(
  ctx: AudioContext,
  midi: number,
  start: number,
  duration: number,
  volume: number,
): Promise<void> {
  const buffer = await loadPianoBuffer(ctx, midi);
  if (!buffer || ctx.state === 'closed') {
    setSoundMode('none');
    return;
  }

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const sample = sampleFor(midi);
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(Math.pow(2, (midi - sample.midi) / 12), start);
  gain.gain.setValueAtTime(volume * 0.75, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + Math.min(0.22, Math.max(0.04, buffer.duration)));
  source.connect(gain);
  connectVoice(gain, ctx);
  source.start(start);
  source.stop(start + Math.max(0.05, Math.min(0.3, buffer.duration + 0.02)));
}

function scheduleVoice(ctx: AudioContext, midi: number, start: number, duration: number, volume: number): void {
  const mode = useSoundMode().value;
  if (mode === 'none') return;
  if (mode === '8bit') {
    scheduleSynthTone(ctx, midi, start, duration, volume, mode);
    return;
  }

  // Piano is sample-only. A failed load turns the option off instead of
  // silently changing its timbre to the synthesized 8-bit/fallback voice.
  void schedulePianoAttack(ctx, midi, start, duration, volume * 1.08);
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
  if (useSoundMode().value === 'none') return;
  whenAudioReady((ctx) => {
    scheduleVoice(ctx, midi, ctx.currentTime, duration, 0.5 * velocity / 127);
  });
}

export interface ToneHandle {
  release(): void;
  stop(): void;
}

export function startTone(midi: number, velocity = 100): ToneHandle {
  let stopped = false;
  let releaseRequested = false;
  let stopRequested = false;
  let releaseTone: (() => void) | null = null;
  let stopTone: (() => void) | null = null;

  whenAudioReady((ctx) => {
    if (stopped || useSoundMode().value === 'none') return;

    const start = ctx.currentTime;
    const frequency = midiToFreq(midi);
    const mode = useSoundMode().value;
    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const volume = 0.5 * velocity / 127;
    let toneStopped = false;
    let releaseApplied = false;

    // Use the exact same attack scheduler as clicked keys. In Piano mode this
    // starts the sample; if it cannot be decoded it uses the shared fallback.
    // In 8-bit mode the same fallback is selected directly.
    scheduleVoice(ctx, midi, start, 0.3, volume);

    const addOscillator = (type: OscillatorType, partial: number, level: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency * partial, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(volume * level, start + (mode === 'piano' ? 0.012 : 0.002));
      osc.connect(gain);
      connectVoice(gain, ctx);
      osc.start(start);
      oscillators.push(osc);
      gains.push(gain);
    };

    if (mode === '8bit') addOscillator('sine', 1, 1);

    releaseTone = () => {
      if (toneStopped || releaseApplied) return;
      releaseApplied = true;
      const releaseAt = ctx.currentTime;
      const releaseDuration = mode === 'piano' ? 2.2 : 1.8;
      for (const gain of gains) {
        gain.gain.cancelScheduledValues(releaseAt);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), releaseAt);
        gain.gain.exponentialRampToValueAtTime(0.001, releaseAt + releaseDuration);
      }
      // Let the decaying voice finish naturally; stop() below can still mute
      // it quickly when the pedal is lifted.
      for (const osc of oscillators) osc.stop(releaseAt + releaseDuration + 0.03);
    };

    stopTone = () => {
      if (toneStopped) return;
      toneStopped = true;
      const stopAt = ctx.currentTime;
      const stopFade = mode === 'piano' ? 0.3 : 0.24;
      for (const gain of gains) {
        gain.gain.cancelScheduledValues(stopAt);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), stopAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, stopAt + stopFade);
      }
      if (!releaseApplied) {
        for (const osc of oscillators) osc.stop(stopAt + stopFade + 0.03);
      }
    };

    if (releaseRequested) releaseTone();
    if (stopRequested) stopTone();
  });

  return {
    release() {
      if (stopped) return;
      releaseRequested = true;
      releaseTone?.();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      stopRequested = true;
      stopTone?.();
    },
  };
}

export function playChord(notes: number[], duration = 0.3, velocity = 100): void {
  for (const note of notes) playTone(note, duration, velocity);
}

export function playChordWithMelody(
  chordNotes: number[],
  melodyNotes: number[],
  interval: number,
  harmonyVelocity = 100,
  melodyVelocity = 88,
): void {
  if (useSoundMode().value === 'none') return;
  const ctx = getCtx();
  whenAudioReady(() => {
    const now = ctx.currentTime;
    for (const note of chordNotes) scheduleVoice(ctx, note, now, interval, 0.5 * harmonyVelocity / 127);
    if (melodyNotes.length === 0) return;
    const slot = interval / melodyNotes.length;
    melodyNotes.forEach((note, index) => {
      scheduleVoice(ctx, note, now + index * slot, slot * 0.72, 0.32 * melodyVelocity / 127);
    });
  });
}

export async function resumeAudio(): Promise<void> {
  const ctx = getCtx();
  if (ctx.state !== 'running' && ctx.state !== 'closed') await ctx.resume();
}
