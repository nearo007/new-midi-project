# MIDI Toolbox — Complete Project Specification

Language-agnostic specification for rewriting this project in any language.

---

## 1. Overview

A MIDI playback tool with interactive UIs for playing notes and building chord progressions. Communicates with MIDI output ports (physical devices or virtual like FluidSynth/tmidi) via the `mido` library.

**Core capabilities:**
- Play individual MIDI notes
- Play sequences of notes/chords with configurable timing
- Loop chord progressions
- Switch MIDI output port at runtime
- Generate scales and chords from music theory rules
- Interactive 88-key piano keyboard UI
- Chord progression builder UI (Chord Lab)

---

## 2. Features

### 2.1 Piano

Interactive visual representation of a standard 88-key piano (A0 to C8).

- Renders white and black keys with correct positioning
- Clicking any key sends a MIDI `note_on` + `note_off` event (single note, short duration)
- Default staccato: 0.5 (50% of beat interval)
- One-shot playback (not looping)

### 2.2 Chord Lab

UI for building and looping chord progressions.

- Default progression: C major, F major, G major, A minor (4 chords)
- Each chord block has configurable:
  - **Note** — C through B (12 chromatic notes)
  - **Octave** — 1 through 7
  - **Tonality** — major or minor
  - **7th extension** — none, major 7th (maj7), or minor 7th (7)
- Start button → loops the progression via MIDI
- Stop button → stops the loop
- Chord name updates dynamically (e.g., "Cm", "Fmaj7", "G7")

### 2.3 Port Management

- List all available MIDI output ports
- Select and switch port at runtime (from any page)
- Auto-selects a port on startup, preferring ports with "midi" or "virtual" in the name
- Switching port stops any active loop

### 2.4 Playback Engine

- **Play sequence** — one-shot, runs in background thread, plays each chord in order
- **Loop sequence** — repeats sequence infinitely until stopped
- **Stop** — sets a flag to break the loop after current chord finishes
- **BPM control** — converts BPM to seconds-per-beat interval
- **Staccato** — note duration as fraction of interval (0.0 to 1.0), rest fills the remainder
- All playback is non-blocking (threaded)

### 2.5 Scale Generation

Generates note lists for scales given mode, key, and octave.

Supported scale types (interval patterns in semitones):
| Name | Intervals |
|------|-----------|
| Major | [2, 2, 1, 2, 2, 2, 1] |
| Minor | [2, 1, 2, 2, 1, 2, 2] |
| Minor Blues | [3, 2, 1, 1, 3, 2] |
| Chromatic | [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] |

- Key: 1–12 (C=1, C#=2, D=3, ..., B=12)
- Octave: 1–7
- Optional multi-octave register (e.g., octaves 3–5)
- Optional: include root octave note (wrap-around)

### 2.6 Chord Building

Builds chords from a chromatic scale given root position.

| Tonality | Intervals from root |
|----------|-------------------|
| Major | [0, 4, 7] |
| Minor | [0, 3, 7] |

Optional 7th extensions:
| Extension | Additional interval |
|-----------|-------------------|
| None | — |
| Major 7th (maj7) | +11 |
| Minor 7th (7) | +10 |

### 2.7 Random Chord Sequence

Given a scale, picks `chord_count` random chords (each with `note_count` random notes from the scale).

---

## 3. Domain Model

### 3.1 MIDI Notes

Standard MIDI note numbers:
- A0 = 21 (lowest piano key)
- C8 = 108 (highest piano key)
- Middle C (C4) = 60
- Formula: `midi_number = 21 + (octave - 1) * 12 + semitone_offset`

Where semitone_offset within octave: C=0, C#=1, D=2, ..., B=11

### 3.2 Scale

A scale is defined by:
- `mode`: index into scale patterns (0=major, 1=minor, 2=blues, 3=chromatic)
- `key`: root note 1–12
- `octave`: starting octave 1–7
- `register`: optional [start_octave, end_octave] for multi-octave scales

Output: list of MIDI note numbers.

Algorithm:
```
function get_scale_notes(mode, key, octave, register=None, include_octave=False):
    steps = scale_patterns[mode]
    if not include_octave:
        steps = steps[:-1]   // remove last interval (would complete the octave)

    if register is not None:
        scale = []
        for oct in register[0] to register[1]:
            current = 23 + key   // b0=23, so 23+key = root note
            for step in steps:
                current += step
                scale.append(current + (oct - 1) * 12)
        if include_octave:
            scale = unique(scale)   // remove duplicates from register overlaps
        return scale
    else:
        current = 23 + key
        scale = []
        for step in steps:
            current += step
            scale.append(current + (octave - 1) * 12)
        return scale
```

### 3.3 Chord

A chord is built from a chromatic scale:
```
function get_chord(scale, tonality, seventh=0):
    if tonality == 0 (major): intervals = [0, 4, 7]
    if tonality == 1 (minor): intervals = [0, 3, 7]
    if seventh == 1 (maj7): append 11
    if seventh == 2 (min7): append 10

    return [scale[i] for i in intervals]
```

### 3.4 Playable Sequence

A playable sequence is a list of "chords" where each chord is a list of MIDI note numbers:
```
[[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]
```

Single notes are represented as single-element lists: `[[60]]`.

### 3.5 Timing

```
interval_seconds = 60 / bpm / time_signature
note_duration = interval_seconds * staccato
silence_duration = interval_seconds - note_duration
```

If BPM is 0, return a large sentinel value (100s) to prevent infinite loops.

---

## 4. Data Flow

### 4.1 Piano Key Press

```
User clicks key → UI sends MIDI note number → Controller receives note →
PlayerService.play_sequence([[note]]) → Thread: note_on → sleep → note_off
```

### 4.2 Chord Progression Start

```
User clicks Start → UI sends progression JSON → Controller receives progression →
For each chord: build chromatic scale → get_chord() → collect playable sequence →
PlayerService.loop_sequence(sequence) → Thread: loop { for each chord: note_on all → sleep → note_off all → sleep }
```

### 4.3 Port Switch

```
User selects port → UI sends port name → Controller: stop loop →
MidoAdapter.set_outport(name) → close old port → open new port
```

---

## 5. MIDI Adapter Interface

The adapter wraps a MIDI library and provides:

```
interface MidiOutput:
    list_ports() → list<string>
    open_port(name: string) → void
    close_port() → void
    send_note_on(note: int, velocity: int) → void
    send_note_off(note: int) → void
    current_port() → string
```

On startup: auto-select port preferring names containing "midi" or "virtual".
On port switch: close current, open new.
On cleanup: close port.

---

## 6. Player Service Interface

```
interface PlayerService:
    set_bpm(bpm: int, time_signature: float) → void
    set_staccato(value: float) → void
    play_sequence(sequence: list<list<int>>) → void     // one-shot, async
    loop_sequence(sequence: list<list<int>>) → void     // looping, async
    stop_loop() → void
```

State:
- `playing: bool` — flag checked by loop thread
- `interval_speed: float` — seconds per beat
- `staccato_value: float` — fraction of interval for note-on

Threading:
- `play_sequence` spawns a daemon thread, runs sequence once
- `loop_sequence` stops any existing loop, waits one interval, spawns daemon thread
- `stop_loop` sets `playing = False`, loop breaks after current chord

---

## 7. Web UI Structure

### 7.1 Pages

| Page | Route | Description |
|------|-------|-------------|
| Piano | `/piano` | Interactive 88-key keyboard |
| Chord Lab | `/chord-lab` | Chord progression builder |
| Root | `/` | Redirects to `/piano` |

### 7.2 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/play` | Play a single MIDI note (form: `key_num`) |
| POST | `/chord-lab/start-progression` | Start looping progression (JSON) |
| POST | `/chord-lab/stop-progression` | Stop current loop |
| POST | `/set-port` | Switch MIDI output port (JSON: `port`) |

### 7.3 Layout

Shared across all pages:
- Fixed header with navigation (Piano / Chord Lab buttons)
- MIDI port selector dropdown + Set button
- Dark theme (black → dark purple gradient, white borders, blur header)

### 7.4 Chord Lab Chord Block

Each block displays:
- Chord name (e.g., "Cm", "Fmaj7")
- Note selector (dropdown: C through B)
- Octave selector (dropdown: 1 through 7)
- Tone selector (dropdown: Major / Minor)
- 7th checkboxes (maj7 and min7, mutually exclusive)

Progression payload format:
```
[
  [note_key, octave, tonality, seventh],
  ...
]
```
Where:
- `note_key`: 1–12 (C=1)
- `octave`: 1–7
- `tonality`: 0=major, 1=minor
- `seventh`: 0=none, 1=maj7, 2=min7

---

## 8. Non-Web UIs (Legacy)

### 8.1 CLI

Menu-driven text interface:
1. Choose output port
2. Generate random chord progression (user picks mode/key/octave)
3. Loop scale (user picks mode/key/octave)

### 8.2 Tkinter GUI

Minimal desktop GUI:
- Port selector dropdown
- Set Port / Play / Stop / Quit buttons
- Plays a fixed C major scale

---

## 9. Dependencies

| Library | Purpose |
|---------|---------|
| mido | MIDI message construction and port management |
| python-rtmidi | Low-level MIDI I/O backend (used by mido) |
| flask | Web framework + Jinja2 templates |

---

## 10. Constraints & Edge Cases

- **No MIDI port available** — throw error on startup (current: `RuntimeError("No available port.")`)
- **BPM = 0** — return sentinel value 100 seconds to avoid division by zero
- **Port switch during playback** — stop loop first, then switch
- **Multiple loop requests** — stop previous loop, wait one interval, start new
- **Thread cleanup** — all playback threads are daemon threads (die with main process)

---

## 11. Recommended Architecture for Rewrite

### 11.1 Layer Separation

```
┌─────────────────────────────────────────────┐
│                UI Layer                      │
│  (Web / CLI / Desktop — only HTTP I/O)      │
├─────────────────────────────────────────────┤
│              Application Layer               │
│  PlayerService (orchestration, no I/O)       │
├─────────────────────────────────────────────┤
│               Core / Domain                  │
│  Note, Scale, Chord, Progression, Timing     │
│  (pure functions, zero dependencies)         │
├─────────────────────────────────────────────┤
│             Infrastructure Layer             │
│  MidiOutput (adapter), Config                │
└─────────────────────────────────────────────┘
```

### 11.2 Key Improvements Over Current Code

**1. Interface for MIDI backend**

Define a trait/interface/protocol:
```
MidiOutput:
    list_ports() → string[]
    open(name) → void
    close() → void
    note_on(note, velocity) → void
    note_off(note) → void
```

Enables mocking in tests, swapping backends (e.g., virtual MIDI, file output, network).

**2. Dependency Injection**

```
player = PlayerService(midi_output, config)
controller = PlayerController(player, midi_output)
```

No global singletons. Every component receives its dependencies.

**3. Config Layer**

Single config source with defaults, overridable by file/env/args:
```
Config:
    bpm: 80           // default
    time_signature: 0.5
    staccato: 0.5
    loop_staccato: 1.0
    loop_bpm: 80
    port: auto        // auto-detect or explicit name
```

**4. No Hard-Coded Values**

Current codebase has BPM=80, 120, staccato=0.5, 1.0, time_sig=0.5 scattered across controller, CLI, and tkinter. All should come from config.

**5. Pure Core Module**

Domain logic (notes, scales, chords, timing) has zero external dependencies. Trivially unit-testable.

**6. Proper Error Handling**

- No bare `except:` blocks
- Validate API input before processing
- Return proper error responses (not `", 204"` string bug)

**7. Thread Safety**

Use a proper synchronization primitive for the `playing` flag (mutex/lock), not a bare boolean.

### 11.3 Suggested File Structure

```
project/
├── config/
│   └── default.toml              # default settings
├── core/
│   ├── note.py                   # Note type, MIDI number mapping
│   ├── scale.py                  # Scale patterns + generation
│   ├── chord.py                  # Chord building
│   ├── progression.py            # Chord progression model
│   └── timing.py                 # BPM → interval calculation
├── application/
│   └── player_service.py         # Playback orchestration
├── infrastructure/
│   ├── midi/
│   │   ├── protocol.py           # MidiOutput interface
│   │   └── mido_adapter.py       # concrete implementation
│   └── config.py                 # Config loader
├── ui/
│   ├── web/
│   │   ├── app.py                # Flask setup
│   │   ├── routes/
│   │   │   ├── piano.py
│   │   │   ├── chord_lab.py
│   │   │   └── port.py
│   │   ├── templates/
│   │   └── static/
│   ├── cli/
│   │   └── app.py
│   └── desktop/
│       └── app.py
├── tests/
│   ├── core/
│   ├── application/
│   └── infrastructure/
└── main.py                       # entry point
```

### 11.4 Testing Strategy

| Layer | Test type | What to test |
|-------|-----------|-------------|
| Core | Unit | Scale generation, chord building, BPM calc, note mapping |
| Application | Unit + Mock | PlayerService with mocked MidiOutput |
| Infrastructure | Integration | MidoAdapter against virtual port |
| UI | E2E | Flask routes against test client |

---

## 12. Complete Note Reference

```
A0=21  A#0=22  B0=23
C1=24  C#1=25  D1=26  D#1=27  E1=28  F1=29  F#1=30  G1=31  G#1=32  A1=33  A#1=34  B1=35
C2=36  C#2=37  D2=38  D#2=39  E2=40  F2=41  F#2=42  G2=43  G#2=44  A2=45  A#2=46  B2=47
C3=48  C#3=49  D3=50  D#3=51  E3=52  F3=53  F#3=54  G3=55  G#3=56  A3=57  A#3=58  B3=59
C4=60  C#4=61  D4=62  D#4=63  E4=64  F4=65  F#4=66  G4=67  G#4=68  A4=69  A#4=70  B4=71
C5=72  C#5=73  D5=74  D#5=75  E5=76  F5=77  F#5=78  G5=79  G#5=80  A5=81  A#5=82  B5=83
C6=84  C#6=85  D6=86  D#6=87  E6=88  F6=89  F#6=90  G6=91  G#6=92  A6=93  A#6=94  B6=95
C7=96  C#7=97  D7=98  D#7=99  E7=100 F7=101 F#7=102 G7=103 G#7=104 A7=105 A#7=106 B7=107
C8=108
```

Formula: `midi = 21 + (octave - 1) * 12 + semitone` where C=0, C#=1, ..., B=11
