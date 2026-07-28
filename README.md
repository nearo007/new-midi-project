# MIDI Toolbox

MIDI Toolbox is a browser-based MIDI workspace for playing notes and building chord progressions with an optional generated melody.

## Screenshots

### Screenshot 1

<img width="1880" height="930" alt="image" src="https://github.com/user-attachments/assets/169a785e-298a-4e55-b093-c8c80fc9c50e" />


### Screenshot 2

<img width="1880" height="930" alt="image" src="https://github.com/user-attachments/assets/6bb34a67-4342-4317-baff-1f113432dabc" />

## Features

- 88-key piano keyboard
- MIDI output port selection
- Chord progression builder
- Chord muting, editing, reordering, and adding/removing chords
- BPM-controlled progression playback
- Optional deterministic melody generator
- Melody scales: chord tones, major, minor, blues, and chromatic
- Melody register selection and 0–4 notes per chord
- Synchronized chord-only, melody-only, or combined playback
- Browser Web Audio preview

## Requirements

- Node.js 20 or newer
- A MIDI output device or virtual MIDI port for MIDI playback

## Installation

```bash
npm install
```

## Development

Run the integrated server with the Vue development middleware:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
npm start
```

The production server serves the built client and listens on port `3000` by default. Set `PORT` to use another port.

## Chord Lab

1. Select a MIDI output port from the header.
2. Add and edit chords in the Chord progression panel.
3. Set the BPM.
4. Enable or disable chord and melody playback independently.
5. Press **Play selected** to start the progression.

The melody uses a deterministic seed. Chord edits preserve the current seed; changing melody restrictions or pressing **Generate** creates a new melody variation.

