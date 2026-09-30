# MIDI Toolbox

A local music workspace built with Vue, TypeScript, Express and Web Audio. Play an 88-key piano, compose chord progressions, generate or record a melody, and export your project to a DAW or audio file.

## Run locally

Use Node **22.13+ in the 22.x line, or Node 24+**. `.nvmrc` selects Node 22.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The development server serves both the API and Vite; a separate frontend process is unnecessary.

```bash
npm run build
npm start
```

`npm run build:start` performs both production steps. Run commands from the repository root so the shared package is compiled first.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port, integer 1–65535. |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` explicitly for access from other machines. |
| `MIDI_BACKEND` | native JZZ | Set to `none` for browser-only use or machines without a native MIDI runtime. |

For example, `MIDI_BACKEND=none npm run dev` supports Web Audio and browser MIDI without loading native MIDI bindings. Network access is intended for a trusted local environment; the app has no remote account or authentication system.

## Workspace

- **Piano:** 88 keys, mouse/touch input with pressure position, Enter/Space while a key is focused, note labels and MIDI input highlighting.
- **Chord Lab:** major/minor triads, major/minor sevenths, inversions, per-chord duration and mute, drag handles plus move buttons, transposition and chord previews.
- **Melody:** deterministic generator with persisted seed, chord/major/minor/blues/chromatic scales, register and density controls; editable piano roll with pitch, start, duration and velocity.
- **Recording:** capture browser MIDI IN over one full progression, replace or append, retain source channels and velocities, and apply reversible quantization. Recording also works with local sound muted.
- **Transport:** persistent Play/Stop/Panic across views, BPM, tap tempo, metronome, four-beat count-in and a selected chord range in a loop.
- **Projects:** autosave, named library, duplicate, JSON import/export, validated migration of previous settings, and up to 100 undo steps. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z work outside text fields.
- **Exports:** Standard MIDI File type 1 with tempo, harmony and melody tracks; stereo PCM WAV rendered offline with the selected local sound and reverb.
- **Devices and sound:** browser/native MIDI outputs, per-channel input sustain, input channel filter, optional browser MIDI Thru, track channels/volumes, sampled piano, 8-bit sound, reverb and seven themes.

Select a local sound or MIDI output, edit the progression and press **Play selected**. The header remains available in Piano and Chord Lab. Clicking a chord name previews its notes; Panic interrupts all sound immediately. The move buttons also work on touch screens and with a keyboard.

**Generate** or changing generator restrictions replaces manual melody edits with a new generated variation. The UI marks custom notes, and Undo restores the previous idea. **Edit generated notes** materializes the current generator output for manual editing. Record captures one full progression, with optional count-in; changing the project identity, tempo, chord order or durations cancels the take and preserves the existing melody. Recording begins after the count-in.

The melody velocity slider controls generated notes. Edited and recorded melodies retain their individual note velocities, so that slider is disabled with an explanation. Edit velocity in the piano roll or use track volume to scale the whole melody; playback, MIDI and WAV use those same values.

## MIDI and audio behavior

The two MIDI output routes are alternatives:

- **Browser MIDI** uses the browser's Web MIDI access. A compatible browser such as Chrome/Edge on localhost or HTTPS can access host devices, including when the server runs in WSL or a container. MIDI details exposes unsupported browsers, permission errors and device availability separately from server errors.
- **Native MIDI** uses JZZ in Node. On Linux, install the ALSA runtime and make the device visible to the server's environment. Only one browser session owns native progression playback at a time; another tab receives a conflict instead of taking over. Panic can stop that shared native output.

Harmony and melody use distinct configurable channels (shown as 1–16; stored as 0–15). Live piano uses a channel outside those two tracks. A captured input channel remains in the project as `sourceChannel`; playback and exports route recorded notes through the melody track channel. On a shared pitch/channel, held live owners share a gate until the last release. In a sequence, a later attack retriggers that pitch; simultaneous duplicates share a gate. Use separate channels for external parts that need independent articulation, including MIDI Thru.

MIDI Thru is off by default and forwards notes and control changes to the selected browser output. Identical input/output IDs or names are rejected; the app cannot inspect external patch cables or routing graphs, so use a route that does not feed back into its input. Turning Thru off or changing input releases forwarded notes and sustain.

Stop cancels the progression and queued attacks while letting the local effect tail decay. Panic releases live/input/progression notes and discards the audio effects tail. Switching devices releases notes through their original port. A native playback session and held native notes expire after 10 seconds without their browser heartbeat.

Navigation inside the app preserves playback. Hiding the browser tab stops it deliberately to avoid background timer throttling. Returning to the tab requires Play. Web Audio/Web MIDI are scheduled locally from a monotonic clock, without per-chord HTTP polling. Native playback uses the same compiled sequence and a future start time; native edits and local audio switch at a common future chord boundary. If an update response arrives too late, playback stops with a recovery message. Hardware latency and clock drift over long sessions still depend on the system and instrument.

Native update, Stop and heartbeat commands from browser sessions carry the `runId` returned by Start. Commands for an earlier run receive a conflict and cannot change a restarted session. The original API without a session remains available under its isolated `legacy` owner. Local audio creates sources within an 80 ms scheduling window; future notes remain cancellable without consuming simultaneous polyphony.

## Projects and limits

Current projects and the named library are stored in this browser under `midi-toolbox-projects-v1`; sound/theme/device preferences use `midi-toolbox-settings`. Previous chord tuples and preferences migrate on first use. Seed and generator version are retained. A bad import leaves the open project intact; storage failures appear in the UI, and JSON export remains available.

Closing an unchanged tab does not rewrite its saved snapshot. Library saves and deletions merge with the latest stored library, and other tabs refresh their library lists. If another tab changed the autosaved project or the same library entry, a stale edit is kept open with a conflict message. Save a separate copy with **Duplicate** or export JSON to preserve it, then open the desired library project to resume autosaving.

- 1–128 chords, each 0.25–16 beats; 20–240 BPM.
- Up to 2,048 manual/recorded melody notes and 128 active local audio voices.
- JSON imports up to 1 MB; projects use `schemaVersion: 1` and `generatorVersion: 1`.
- MIDI and WAV export the **full progression once**, independent of the current loop selection. Both include enabled tracks and their volume/velocity settings.
- WAV export uses 44.1 kHz, stereo, 16-bit PCM, with a maximum rendered duration of **3 minutes including the effect tail**. It excludes live input, count-in and metronome. External synthesizer timbres are not captured. Use MIDI for longer projects.

## Code organization

```text
packages/music-core/src/       Pure music rules, versioned project validation,
                               sequence compilation, clock/ownership and MIDI file export
client/src/features/piano/     Piano interaction and held-note performance
client/src/features/chord-lab/ Project editing, history, library, recording and piano roll
client/src/playback/           Global transport and its UI
client/src/audio/              Web Audio voices, sample loading and offline rendering
client/src/midi/               Browser input/output, sustain, Thru and device selection
client/src/infrastructure/     HTTP and browser persistence
client/src/ui/                 Shared layout, menus, theme and sound controls
server/src/app.ts              Injectable Express application and input validation
server/src/application/        Native player with an injected clock and MIDI port
server/src/ports/              MIDI adapter interface
server/src/infrastructure/     JZZ and disabled MIDI adapters
server/src/index.ts            Configuration, startup and shutdown
```

`@midi-toolbox/core` is the shared public interface for music and project contracts. Client and server compile the same project into events; components do not rebuild theory rules or own progression timers. Add an instrument in the audio engine, a MIDI backend behind `MidiOutput`, or a project operation in the editor. Preserve validation and revision/ownership semantics at those boundaries.

## Validation

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install --with-deps chromium
npm run test:e2e
npm audit
```

`npm run format` applies the repository formatter. Unit/integration tests use an injected clock and fake MIDI adapter. Playwright builds the production app, starts an isolated server on port 3107 with `MIDI_BACKEND=none`, instruments real Web Audio and supplies controlled browser MIDI devices. No physical MIDI device is required. CI runs types, lint, formatting, tests and build/E2E on Node 22 and 24.

Automated tests cover musical rules, validation, recurring one-chord loops, ownership and revision conflicts, note cancellation, browser navigation, recording, project recovery, file export and layouts from 320 to 1440 px. Physical MIDI hot-plug, synthesizer response and audio latency need a hardware smoke test; browser mocks cannot verify them.

The original diagnosis is in [ANALISE_E_PLANO_DE_MELHORIAS.md](ANALISE_E_PLANO_DE_MELHORIAS.md). Implementation decisions, evidence and remaining environmental validation are recorded in [IMPLEMENTACAO.md](IMPLEMENTACAO.md).
