/**
 * A tiny original, synthesized piano-like attack used as a bundled reference
 * sample. The Web Audio envelope supplies the voice envelope. If decoding is
 * unavailable, Piano mode is disabled rather than changing timbre silently.
 *
 * License: CC0 1.0. Generated for MIDI Toolbox; no third-party recording is
 * included. See LICENSE.md in this directory.
 */
export interface PianoSample {
  midi: number;
  wavBase64: string;
}

// Verified 8 kHz, mono, 16-bit PCM WAV: 128 samples / 16 ms attack.
const REFERENCE_SAMPLE =
  'UklGRiQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQABAAAAAIsA/QHgA6YF3QZVByUHlwb8BYYFLwXBBPQDlAKkAFr+DvwF+kz4oPaK9JDxge2w6Ank6OC74I/kqOxI+M4FDxPrHdskTyfIJZAhRhxUF4QT2xDADl0MBQmJBEj/+vlV9azxuO6s64rnquEs2jXSy8tPycbMIdfG55T8VRKPJWozZTqhOq417C3AJd8e5BleFjQTQw/mCTYD+/s79bnviOvx57rju92B1cfLisKXvMS8/MSE1a3sHgemIEk1TELORt5D8DsFMq4oZiFNHHQYdxQzD0cIMQAJ+OnwY+sk5w7jsd0C1gvMPsFIuGW0XbiQxU/b2/b6EwguK0FCS1VM';

// One bundled attack reference per octave leaves room for velocity layers
// later without changing the audio engine API.
export const PIANO_SAMPLES: PianoSample[] = [24, 36, 48, 60, 72, 84, 96]
  .map((midi) => ({ midi, wavBase64: REFERENCE_SAMPLE }));
