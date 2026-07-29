import c2Url from './piano-c2.wav?url';
import c4Url from './piano-c4.wav?url';
import c6Url from './piano-c6.wav?url';

export interface PianoSample {
  midi: number;
  url: string;
}

// Local, normalized C2/C4/C6 attacks from the University of Iowa Electronic
// Music Studios Steinway recordings. Vite packages these files with the app;
// playback does not depend on an external URL.
export const PIANO_SAMPLES: PianoSample[] = [
  { midi: 36, url: c2Url },
  { midi: 60, url: c4Url },
  { midi: 84, url: c6Url },
];
