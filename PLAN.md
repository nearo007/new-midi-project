# MIDI Toolbox — TypeScript + Vue Implementation Plan

## Architecture

```
new-midi-project/
├── package.json              # root workspace config
├── SPEC.md
├── PLAN.md
├── server/                   # backend
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── core/
│       │   ├── note.ts
│       │   ├── scale.ts
│       │   ├── chord.ts
│       │   └── timing.ts
│       ├── application/
│       │   └── player-service.ts
│       ├── infrastructure/
│       │   ├── midi/
│       │   │   ├── midi-output.ts      # interface
│       │   │   └── node-midi-adapter.ts # concrete impl
│       │   └── config.ts
│       ├── routes/
│       │   ├── play.ts
│       │   ├── chord-lab.ts
│       │   └── port.ts
│       └── index.ts                    # Express app entry
└── client/                   # frontend
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.vue
        ├── main.ts
        ├── router/
        │   └── index.ts
        ├── components/
        │   ├── Layout.vue
        │   ├── PianoKey.vue
        │   ├── PianoKeyboard.vue
        │   ├── ChordBlock.vue
        │   └── PortSelector.vue
        ├── views/
        │   ├── PianoView.vue
        │   └── ChordLabView.vue
        ├── api/
        │   └── client.ts              # fetch wrapper
        └── assets/
            └── style.css
```

---

## Phase 1: Root + Workspace Setup

1. Root `package.json` with `"workspaces": ["server", "client"]`
2. `server/package.json` — deps: `express`, `node-midi`, devDeps: `typescript`, `@types/express`, `@types/node`, `tsx`
3. `client/package.json` — deps: `vue`, `vue-router`, devDeps: `vite`, `@vitejs/plugin-vue`, `typescript`
4. `.gitignore` — `node_modules/`, `dist/`, `.env`

---

## Phase 2: Backend Core (Pure Functions)

**`server/src/core/note.ts`**
- `NOTE_NAMES` constant: `['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']`
- `noteToMidi(octave, noteIndex)`: `21 + (octave - 1) * 12 + noteIndex`
- `midiToNote(midi)`: inverse
- `NOTE_NAMES_TO_KEY` map: `{C:1, C#:2, ..., B:12}`

**`server/src/core/scale.ts`**
- `SCALE_PATTERNS`: `{ major: [2,2,1,2,2,2,1], minor: [2,1,2,2,1,2,2], blues: [3,2,1,1,3,2], chromatic: [1,1,1,1,1,1,1,1,1,1,1,1] }`
- `getScaleNotes(mode, key, octave, register?, includeRoot?)`: pure function per spec algorithm

**`server/src/core/chord.ts`**
- `CHORD_INTERVALS`: `{ major: [0,4,7], minor: [0,3,7] }`
- `SEVENTH_INTERVALS`: `{ none: 0, maj7: 11, min7: 10 }`
- `getChord(scale, tonality, seventh?)`: returns MIDI note array

**`server/src/core/timing.ts`**
- `calcInterval(bpm, timeSignature)`: `60 / bpm / timeSignature`, returns 100 if bpm=0
- `calcNoteDuration(interval, staccato)`: `interval * staccato`

---

## Phase 3: Backend Infrastructure

**`server/src/infrastructure/midi/midi-output.ts`** (interface)
```typescript
interface MidiOutput {
  listPorts(): string[];
  openPort(name: string): void;
  closePort(): void;
  sendNoteOn(note: number, velocity: number): void;
  sendNoteOff(note: number): void;
  currentPort(): string;
}
```

**`server/src/infrastructure/midi/node-midi-adapter.ts`**
- Wraps `node-midi` `output`
- `autoSelectPort()`: prefers ports containing "midi" or "virtual"
- Proper cleanup on port switch

**`server/src/infrastructure/config.ts`**
- Defaults: `{ bpm: 80, timeSignature: 0.5, staccato: 0.5, loopStaccato: 1.0, loopBpm: 80 }`

---

## Phase 4: Backend Application Layer

**`server/src/application/player-service.ts`**
- Constructor takes `MidiOutput` + `Config`
- `playing` flag with `Mutex` (from `async-mutex` package)
- `playSequence(sequence)` — async, plays once
- `loopSequence(sequence)` — loops until `stopLoop()`
- `stopLoop()` — sets flag, loop breaks after current chord
- All playback uses `setTimeout` chains (Node.js event loop, no threads needed)

---

## Phase 5: Backend Routes

**`server/src/routes/play.ts`**
- `POST /play` — body: `{ keyNum: number }` → calls `playerService.playSequence([[keyNum]])`

**`server/src/routes/chord-lab.ts`**
- `POST /chord-lab/start-progression` — body: progression array → builds chords from spec algorithm → `playerService.loopSequence()`
- `POST /chord-lab/stop-progression` — `playerService.stopLoop()`

**`server/src/routes/port.ts`**
- `GET /ports` — `midiAdapter.listPorts()`
- `POST /set-port` — body: `{ port: string }` → stop loop, switch port

**`server/src/index.ts`**
- Express app, JSON body parser, CORS for dev
- Mount routes, listen on port from env or 3000

---

## Phase 6: Frontend Setup

**`client/vite.config.ts`**
- Proxy `/api` to `localhost:3000` for dev

**`client/src/router/index.ts`**
- `/` → redirect to `/piano`
- `/piano` → `PianoView`
- `/chord-lab` → `ChordLabView`

---

## Phase 7: Frontend Components

**`Layout.vue`**
- Header: nav links (Piano, Chord Lab) + `PortSelector`
- Dark theme: black → dark purple gradient, white borders, backdrop blur header
- `<router-view>` slot

**`PortSelector.vue`**
- Fetches ports on mount from `GET /ports`
- Dropdown + Set button → `POST /set-port`

**`PianoKeyboard.vue`**
- Renders 88 keys (A0-C8) with correct white/black positioning
- Each key calls `POST /play` on click
- CSS: white keys tall/narrow, black keys shorter/wider, overlaid

**`PianoKey.vue`**
- Single key component, emits click with MIDI note number
- Visual feedback on press

**`ChordBlock.vue`**
- Props: `index`, `model` (note, octave, tonality, seventh)
- Dropdowns: Note (C-B), Octave (1-7), Tone (Major/Minor)
- 7th checkboxes (maj7, min7, mutually exclusive)
- Displays computed chord name

**`ChordLabView.vue`**
- Array of 4 `ChordBlock`s (default: C-F-G-Am)
- Add/remove chord buttons
- BPM slider
- Start/Stop buttons → `POST /chord-lab/start-progression` / `stop-progression`
- Progression payload: `[[noteKey, octave, tonality, seventh], ...]`

---

## Phase 8: Frontend API Client

**`client/src/api/client.ts`**
- `fetchJSON(url, options?)` — wrapper around `fetch`, handles JSON
- Functions: `playNote(keyNum)`, `startProgression(chords, bpm)`, `stopProgression()`, `getPorts()`, `setPort(name)`

---

## Phase 9: Styling

- Global dark theme in `style.css`
- Piano keys: CSS grid/flex, white keys `z-index: 1`, black keys `z-index: 2` with negative margin
- Responsive: piano scrolls horizontally on mobile
- Chord blocks: card layout with consistent spacing

---

## Key Decisions

| Concern | Decision |
|---------|----------|
| MIDI library | `node-midi` (RtMidi bindings) |
| Threading | Not needed — `setTimeout` chains in Node event loop |
| State sharing | Props/events only, no Pinia |
| CORS | Dev proxy via Vite, production: serve `client/dist` from Express |
| TypeScript strict | Yes, strict mode in both projects |
| Error handling | Express error middleware, proper HTTP status codes |

---

## Build & Run

```bash
# Install dependencies
npm install

# Development — one Express process with Vite middleware and hot reload
npm run dev

# Production build and server — Express serves the Vue app and API
npm run build
npm start
```

The integrated server listens on `http://localhost:3000`. Frontend API calls
continue to use the `/api` prefix. The client workspace scripts remain
available for standalone Vite usage, but are not required for the normal
workflow.
