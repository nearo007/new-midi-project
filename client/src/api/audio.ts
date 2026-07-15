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

export function playTone(midi: number, duration = 0.3): void {
  const ctx = getCtx();
  if (ctx.state === 'suspended') return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(midiToFreq(midi), now);

  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration);
}

export function playChord(notes: number[], duration = 0.3): void {
  for (const note of notes) {
    playTone(note, duration);
  }
}

export async function resumeAudio(): Promise<void> {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}
