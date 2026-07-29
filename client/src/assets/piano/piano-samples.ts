import c1Url from './piano-c1.wav?url';
import c2Url from './piano-c2.wav?url';
import c3Url from './piano-c3.wav?url';
import c4Url from './piano-c4.wav?url';
import c5Url from './piano-c5.wav?url';
import c6Url from './piano-c6.wav?url';
import c7Url from './piano-c7.wav?url';
import c8Url from './piano-c8.wav?url';

export interface PianoSample {
  midi: number;
  url: string;
}

// Local, normalized chromatic-register C1-C8 attacks from the University of Iowa Electronic
// Music Studios Steinway recordings. Vite packages these files with the app;
// playback does not depend on an external URL.
export const PIANO_SAMPLES: PianoSample[] = [
  { midi: 24, url: c1Url },
  { midi: 36, url: c2Url },
  { midi: 48, url: c3Url },
  { midi: 60, url: c4Url },
  { midi: 72, url: c5Url },
  { midi: 84, url: c6Url },
  { midi: 96, url: c7Url },
  { midi: 108, url: c8Url },
];
