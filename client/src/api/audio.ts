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
  const dcBlocker = ctx.createBiquadFilter();
  const master = ctx.createDynamicsCompressor();
  reverb.buffer = createImpulse(ctx);
  dry.gain.value = soundMode.value === 'none' ? 0 : 1;
  wet.gain.value = reverbEnabled.value && soundMode.value !== 'none' ? 0.8 : 0;
  dcBlocker.type = 'highpass';
  dcBlocker.frequency.value = 20;
  dcBlocker.Q.value = 0.7;
  master.threshold.value = -18;
  master.knee.value = 18;
  master.ratio.value = 8;
  master.attack.value = 0.003;
  master.release.value = 0.25;
  dry.connect(dcBlocker);
  reverb.connect(wet);
  wet.connect(dcBlocker);
  dcBlocker.connect(master);
  master.connect(ctx.destination);
  audioOutput = { dry, reverb, wet };
  return audioOutput;
}

watch(soundMode, (mode) => {
  if (mode === 'piano') preloadPianoSamples();
  if (!audioOutput) return;
  const now = getCtx().currentTime;
  audioOutput.dry.gain.setTargetAtTime(mode === 'none' ? 0 : 1, now, 0.01);
  audioOutput.wet.gain.setTargetAtTime(mode === 'none' || !reverbEnabled.value ? 0 : 0.8, now, 0.01);
});

// Warm every register when Piano is the persisted/default sound mode so the
// first note in each sample region does not pay the fetch/decode cost.
if (soundMode.value === 'piano') preloadPianoSamples();

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

function holdGainAt(gain: GainNode, time: number): void {
  // Preserve the exact value of an in-flight envelope. Reading gain.value and
  // writing it back can jump to the parameter's intrinsic value in browsers
  // that are still rendering scheduled automation, which creates a click.
  if (typeof gain.gain.cancelAndHoldAtTime === 'function') {
    gain.gain.cancelAndHoldAtTime(time);
  } else {
    gain.gain.cancelScheduledValues(time);
    gain.gain.setValueAtTime(gain.gain.value, time);
  }
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
  const cached = pianoBufferCache.get(sample.midi);
  if (cached) return cached;

  const decoded = fetch(sample.url)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load piano sample (${response.status})`);
      return response.arrayBuffer();
    })
    .then((wav) => {
      // The bundled files are PCM WAVs, so parse them without relying on the
      // browser's asynchronous decoder or its format support.
      const pcm = decodePcmWav(ctx, wav);
      if (pcm) return pcm;
      return ctx.decodeAudioData(wav.slice(0)).catch(() => null);
    })
    .catch(() => null);
  pianoBufferCache.set(sample.midi, decoded);
  return decoded;
}

function preloadPianoSamples(): void {
  if (soundMode.value !== 'piano') return;
  const ctx = getCtx();
  for (const sample of PIANO_SAMPLES) void loadPianoBuffer(ctx, sample.midi);
}

function scheduleSynthTone(
  ctx: AudioContext,
  midi: number,
  start: number,
  duration: number,
  volume: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const end = Math.max(start + 0.05, start + duration);
  const frequency = midiToFreq(midi);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume * 0.38, 0.001), start + 0.09);
  gain.gain.linearRampToValueAtTime(0, end);

  osc.connect(gain);
  connectVoice(gain, ctx);
  osc.start(start);
  osc.stop(end + 0.02);
}

async function createPianoVoice(
  ctx: AudioContext,
  midi: number,
  start: number,
  volume: number,
): Promise<{ source: AudioBufferSourceNode; gain: GainNode } | null> {
  const buffer = await loadPianoBuffer(ctx, midi);
  if (!buffer || ctx.state === 'closed') {
    setSoundMode('none');
    return null;
  }

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const sample = sampleFor(midi);
  const playbackRate = Math.pow(2, (midi - sample.midi) / 12);
  const naturalDuration = buffer.duration / playbackRate;
  // Loading a local asset still yields to a promise. Move the scheduled start
  // into the future so automation is never written entirely in the past on
  // the first piano note.
  const scheduledStart = Math.max(start, ctx.currentTime + 0.005);
  const attackDuration = Math.min(0.012, naturalDuration * 0.08);
  const fadeDuration = Math.max(0.04, Math.min(0.12, naturalDuration * 0.2));
  const sampleEnd = scheduledStart + Math.max(attackDuration, naturalDuration - fadeDuration);
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(playbackRate, scheduledStart);
  gain.gain.setValueAtTime(0, scheduledStart);
  gain.gain.linearRampToValueAtTime(volume * 0.75, scheduledStart + attackDuration);
  gain.gain.linearRampToValueAtTime(0, sampleEnd);
  source.connect(gain);
  connectVoice(gain, ctx);
  source.start(scheduledStart);
  source.stop(scheduledStart + naturalDuration + 0.02);
  return { source, gain };
}

function schedulePianoAttack(ctx: AudioContext, midi: number, start: number, volume: number): void {
  void createPianoVoice(ctx, midi, start, volume);
}

function scheduleVoice(ctx: AudioContext, midi: number, start: number, duration: number, volume: number): void {
  const mode = useSoundMode().value;
  if (mode === 'none') return;
  if (mode === '8bit') {
    scheduleSynthTone(ctx, midi, start, duration, volume);
    return;
  }

  // Piano is sample-only. A failed load turns the option off instead of
  // silently changing its timbre to the synthesized 8-bit/fallback voice.
  void schedulePianoAttack(ctx, midi, start, volume * 1.08);
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
    const sources: AudioScheduledSourceNode[] = [];
    const gains: GainNode[] = [];
    const volume = 0.5 * velocity / 127;
    let toneStopped = false;
    let releaseApplied = false;

    const addOscillator = (type: OscillatorType, partial: number, level: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency * partial, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * level, start + 0.008);
      osc.connect(gain);
      connectVoice(gain, ctx);
      osc.start(start);
      sources.push(osc);
      gains.push(gain);
    };

    releaseTone = () => {
      if (toneStopped || releaseApplied) return;
      releaseApplied = true;
      const releaseAt = ctx.currentTime;
      const releaseDuration = mode === 'piano' ? 2.2 : 1.8;
      for (const gain of gains) {
        holdGainAt(gain, releaseAt);
        gain.gain.linearRampToValueAtTime(0, releaseAt + releaseDuration);
      }
      // Let the decaying voice finish naturally; stop() below can still mute
      // it quickly when the pedal is lifted.
      for (const source of sources) source.stop(releaseAt + releaseDuration + 0.2);
    };

    stopTone = () => {
      if (toneStopped) return;
      toneStopped = true;
      const stopAt = ctx.currentTime;
      const stopFade = mode === 'piano' ? 0.4 : 0.5;
      for (const gain of gains) {
        holdGainAt(gain, stopAt);
        gain.gain.linearRampToValueAtTime(0, stopAt + stopFade);
      }
      if (!releaseApplied) {
        for (const source of sources) source.stop(stopAt + stopFade + 0.2);
      }
    };

    if (mode === '8bit') {
      // This is the complete 8-bit voice. Do not also call scheduleVoice()
      // here: doing so creates a second, unmanaged oscillator with a separate
      // 300 ms envelope that cannot follow sustain or note-off events.
      addOscillator('triangle', 1, 1);
    } else {
      // A piano sample is asynchronous, so register its source and gain when
      // it is ready. Note-off requests made while it loads are replayed below.
      void createPianoVoice(ctx, midi, start, volume).then((voice) => {
        if (!voice) return;
        sources.push(voice.source);
        gains.push(voice.gain);
        if (toneStopped) {
          const stopAt = ctx.currentTime;
          holdGainAt(voice.gain, stopAt);
          voice.gain.gain.linearRampToValueAtTime(0, stopAt + 0.4);
          voice.source.stop(stopAt + 0.6);
        } else if (releaseRequested) releaseTone?.();
      });
    }

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
