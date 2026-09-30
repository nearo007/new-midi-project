import { ref, watch } from 'vue';
import { compileProject } from '@midi-toolbox/core';
import { PIANO_SAMPLES } from '../assets/piano/piano-samples';
import { readStoredSettings, updateStoredSettings } from '../infrastructure/persistence/settings';
import { useSoundMode } from './sound-mode';

export const audioError = ref('');
export const loadingSamples = ref(0);
let audioCtx: AudioContext | null = null;
let audioOutput: {
  dry: GainNode;
  reverb: ConvolverNode;
  wet: GainNode;
  master: DynamicsCompressorNode;
  dcBlocker: BiquadFilterNode;
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

function createImpulse(ctx: BaseAudioContext): AudioBuffer {
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
  audioOutput = { dry, reverb, wet, master, dcBlocker };
  return audioOutput;
}

watch(soundMode, (mode) => {
  stopAudio();
  if (mode === 'piano') preloadPianoSamples();
  if (!audioOutput) return;
  const now = getCtx().currentTime;
  audioOutput.dry.gain.setTargetAtTime(mode === 'none' ? 0 : 1, now, 0.01);
  audioOutput.wet.gain.setTargetAtTime(
    mode === 'none' || !reverbEnabled.value ? 0 : 0.8,
    now,
    0.01,
  );
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

function decodePcmWav(ctx: BaseAudioContext, wav: ArrayBuffer): AudioBuffer | null {
  try {
    const view = new DataView(wav);
    if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645)
      return null;
    let channels = 1;
    let sampleRate = 8000;
    let bitsPerSample = 16;
    let dataOffset = -1;
    let dataSize = 0;

    for (let offset = 12; offset + 8 <= view.byteLength;) {
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
  return PIANO_SAMPLES.reduce(
    (closest, sample) =>
      Math.abs(sample.midi - midi) < Math.abs(closest.midi - midi) ? sample : closest,
    PIANO_SAMPLES[0],
  );
}

function loadPianoBuffer(ctx: BaseAudioContext, midi: number): Promise<AudioBuffer | null> {
  const sample = sampleFor(midi);
  const cached = pianoBufferCache.get(sample.midi);
  if (cached) return cached;

  loadingSamples.value++;
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
    .catch(() => null)
    .then((buffer) => {
      if (!buffer) {
        pianoBufferCache.delete(sample.midi);
        audioError.value = 'Unable to load a piano sample. Check the connection and try again.';
      }
      return buffer;
    })
    .finally(() => {
      loadingSamples.value--;
    });
  pianoBufferCache.set(sample.midi, decoded);
  return decoded;
}

export function preloadPianoSamples(): void {
  audioError.value = '';
  if (soundMode.value !== 'piano') return;
  const ctx = getCtx();
  for (const sample of PIANO_SAMPLES) void loadPianoBuffer(ctx, sample.midi);
}

export interface ToneHandle {
  release(): void;
  stop(): void;
}
type Voice = { handle: ToneHandle; group: string };
const voices = new Set<Voice>();
const silentHandle: ToneHandle = { release() {}, stop() {} };

/** at is a performance.now() timestamp; pending samples cannot resurrect a cancelled voice. */
function voice(
  note: number,
  velocity: number,
  group: string,
  at: number,
  duration?: number,
): ToneHandle {
  const mode = soundMode.value;
  if (mode === 'none') return silentHandle;
  if (!Number.isInteger(note) || note < 0 || note > 127) throw new Error('Invalid MIDI note');
  while (voices.size >= 128) voices.values().next().value?.handle.stop();
  let state: 'pending' | 'active' | 'released' | 'stopped' = 'pending';
  let source: AudioScheduledSourceNode | null = null;
  let gain: GainNode | null = null;
  let start = 0;
  const ctx = getCtx();
  const cleanup = () => {
    voices.delete(entry);
    source?.disconnect();
    gain?.disconnect();
  };
  const finish = (immediate: boolean) => {
    if (state === 'stopped' || (!immediate && state === 'released')) return;
    const wasPending = state === 'pending';
    state = immediate ? 'stopped' : 'released';
    if (wasPending) {
      cleanup();
      return;
    }
    if (!source || !gain) return;
    const now = ctx.currentTime;
    if (now < start) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
      source.stop(now);
      cleanup();
      return;
    }
    const release = immediate ? 0.025 : mode === 'piano' ? 0.35 : 0.12;
    holdGainAt(gain, now);
    gain.gain.linearRampToValueAtTime(0, now + release);
    source.stop(now + release + 0.01);
    if (immediate) voices.delete(entry);
  };
  const handle: ToneHandle = { release: () => finish(false), stop: () => finish(true) };
  const entry: Voice = { handle, group };
  voices.add(entry);
  void (async () => {
    if (ctx.state !== 'running') await ctx.resume();
    const buffer = mode === 'piano' ? await loadPianoBuffer(ctx, note) : null;
    if (state !== 'pending') return;
    if (mode === 'piano' && !buffer) {
      state = 'stopped';
      cleanup();
      return;
    }
    if (duration !== undefined && performance.now() > at + duration * 1000) {
      state = 'stopped';
      cleanup();
      return;
    }
    start = ctx.currentTime + Math.max(0.005, (at - performance.now()) / 1000);
    gain = ctx.createGain();
    const volume = (0.5 * velocity) / 127;
    let naturalEnd = Infinity;
    if (buffer) {
      const sample = ctx.createBufferSource();
      sample.buffer = buffer;
      const rate = Math.pow(2, (note - sampleFor(note).midi) / 12);
      sample.playbackRate.setValueAtTime(rate, start);
      naturalEnd = start + buffer.duration / rate;
      source = sample;
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(note), start);
      source = osc;
    }
    const end = Math.min(naturalEnd, duration === undefined ? Infinity : start + duration);
    const attack = Math.min(0.008, (end - start) / 3);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(buffer ? volume * 0.75 : volume, start + attack);
    source.connect(gain);
    connectVoice(gain, ctx);
    source.onended = cleanup;
    if (Number.isFinite(end)) {
      const release = Math.min(0.08, (end - start) / 3);
      gain.gain.setValueAtTime(
        buffer ? volume * 0.3 : volume * 0.7,
        Math.max(start + attack, end - release),
      );
      gain.gain.linearRampToValueAtTime(0, end);
    }
    state = 'active';
    source.start(start);
    if (Number.isFinite(end)) source.stop(end + 0.01);
  })().catch((error) => {
    audioError.value = error instanceof Error ? error.message : String(error);
    handle.stop();
  });
  return handle;
}
export function startTone(note: number, velocity = 100, group = 'live'): ToneHandle {
  return voice(note, velocity, group, performance.now());
}
export function scheduleTone(
  note: number,
  duration: number,
  velocity: number,
  at: number,
  group = 'transport',
): ToneHandle {
  return voice(note, velocity, group, at, duration);
}
export function playTone(note: number, duration = 0.3, velocity = 100): void {
  scheduleTone(note, duration, velocity, performance.now(), 'preview');
}
export function stopAudio(group?: string): void {
  for (const voice of [...voices]) if (!group || voice.group === group) voice.handle.stop();
  if (!group && audioOutput) {
    // Discard the effect graph too so Panic cannot leave a reverb tail audible.
    for (const node of Object.values(audioOutput)) node.disconnect();
    audioOutput = null;
  }
}
export function playChord(notes: number[], duration = 0.3, velocity = 100): void {
  stopAudio('preview');
  for (const note of notes) playTone(note, duration, velocity);
}
export async function resumeAudio(): Promise<void> {
  if (soundMode.value === 'none') return;
  const ctx = getCtx();
  if (ctx.state !== 'running' && ctx.state !== 'closed') await ctx.resume();
}

/** Offline rendering uses its own graph and never captures live input or the running transport. */
export async function renderProjectWav(
  project: import('@midi-toolbox/core').Project,
): Promise<Blob> {
  const sequence = compileProject(project, false);
  const mode = soundMode.value;
  if (mode === 'none') throw new Error('Choose Piano or 8-bit before exporting audio.');
  const seconds = (sequence.totalBeats * 60) / sequence.bpm + (reverbEnabled.value ? 2.5 : 0.2);
  if (seconds > 180)
    throw new Error(
      'Audio export supports up to 3 minutes per project. Export MIDI for longer compositions.',
    );
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
  const master = ctx.createDynamicsCompressor();
  master.connect(ctx.destination);
  const dry = ctx.createGain();
  dry.connect(master);
  let reverb: ConvolverNode | undefined;
  if (reverbEnabled.value) {
    reverb = ctx.createConvolver();
    reverb.buffer = createImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.8;
    reverb.connect(wet);
    wet.connect(master);
  }
  const buffers = new Map<number, AudioBuffer>();
  if (mode === 'piano') {
    for (const note of new Set(
      sequence.steps.flatMap((step) => step.events.map((event) => event.note)),
    )) {
      const buffer = await loadPianoBuffer(ctx, note);
      if (!buffer) throw new Error('Piano samples are unavailable. Retry before exporting.');
      buffers.set(note, buffer);
    }
  }
  let beat = 0;
  for (const step of sequence.steps) {
    for (const event of step.events) {
      const start = ((beat + event.startBeat) * 60) / sequence.bpm;
      let end = start + (event.durationBeats * 60) / sequence.bpm;
      const gain = ctx.createGain(),
        volume = (0.5 * event.velocity) / 127;
      let source: AudioScheduledSourceNode;
      if (mode === 'piano') {
        const sample = ctx.createBufferSource();
        sample.buffer = buffers.get(event.note)!;
        const rate = Math.pow(2, (event.note - sampleFor(event.note).midi) / 12);
        sample.playbackRate.value = rate;
        end = Math.min(end, start + sample.buffer.duration / rate);
        source = sample;
      } else {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midiToFreq(event.note);
        source = osc;
      }
      gain.gain.setValueAtTime(0, start);
      const attack = Math.min(0.008, (end - start) / 3);
      gain.gain.linearRampToValueAtTime(volume * (mode === 'piano' ? 0.75 : 1), start + attack);
      gain.gain.setValueAtTime(
        volume * (mode === 'piano' ? 0.3 : 0.7),
        Math.max(start + attack, end - Math.min(0.08, (end - start) / 3)),
      );
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain);
      gain.connect(dry);
      if (reverb) gain.connect(reverb);
      source.start(start);
      source.stop(end + 0.01);
    }
    beat += step.durationBeats;
  }
  const buffer = await ctx.startRendering();
  const data = new ArrayBuffer(44 + buffer.length * 4),
    view = new DataView(data);
  const write = (at: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, data.byteLength - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 44100 * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, buffer.length * 4, true);
  const left = buffer.getChannelData(0),
    right = buffer.getChannelData(1);
  for (let i = 0; i < buffer.length; i++)
    for (let ch = 0; ch < 2; ch++) {
      const sample = Math.max(-1, Math.min(1, ch ? right[i] : left[i]));
      view.setInt16(44 + i * 4 + ch * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
  return new Blob([data], { type: 'audio/wav' });
}
