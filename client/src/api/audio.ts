let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scheduleTone(ctx: AudioContext, midi: number, start: number, duration: number, volume: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(midiToFreq(midi), start);

  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(start + duration);
}

export function playTone(midi: number, duration = 0.3, velocity = 100): void {
  const ctx = getCtx();
  if (ctx.state === 'suspended') return;
  scheduleTone(ctx, midi, ctx.currentTime, duration, 0.5 * velocity / 127);
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
  if (ctx.state === 'suspended') return;

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
}

export async function resumeAudio(): Promise<void> {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}
