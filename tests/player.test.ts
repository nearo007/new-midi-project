import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultProject, LoopScheduler, NoteRegistry, compileProject } from '@midi-toolbox/core';
import { PlayerService } from '../server/src/application/player-service.js';
import { FakeClock } from './clock.js';
import { fakeMidi } from './midi-fixture.js';

test('a live edit retriggers a sustained pitch and its previous release cannot cut the new note', () => {
  const midi = fakeMidi(),
    clock = new FakeClock(),
    player = new PlayerService(midi, clock);
  player.setMidiOutputEnabled(true);
  const project = defaultProject();
  project.bpm = 120;
  project.chords = project.chords.slice(0, 3);
  project.playback.chords = false;
  project.playback.melody = project.melody.enabled = true;
  project.melodyNotes = [
    { id: 'held', note: 60, startBeat: 0, durationBeats: 4, velocity: 80, sourceChannel: 1 },
    { id: 'next', note: 62, startBeat: 2, durationBeats: 3, velocity: 110, sourceChannel: 1 },
  ];
  player.start(project, 'tab', 0, 0);
  clock.advance(500);
  const edited = structuredClone(project);
  edited.melodyNotes![1].note = 60;
  player.update(edited, 'tab', 1, undefined, player.status().runId);
  clock.advance(510);
  assert.deepEqual(midi.events, [
    [0x91, 60, 80],
    [0x81, 60, 0],
    [0x91, 60, 110],
  ]);
  clock.advance(1000);
  assert.equal(midi.events.length, 3, 'the old release must not stop the retriggered note');
  clock.advance(500);
  assert.deepEqual(midi.events.at(-1), [0x81, 60, 0]);
  player.panic();
});
test('one chord creates recurring occurrences and stop cancels the clock', () => {
  const clock = new FakeClock(),
    occurrences: number[] = [];
  const scheduler = new LoopScheduler(
    clock,
    (_step, _at, _bpm, id) => occurrences.push(id),
    (error) => {
      throw error;
    },
  );
  const project = defaultProject();
  project.chords = project.chords.slice(0, 1);
  project.bpm = 240;
  scheduler.start(compileProject(project));
  clock.advance(1600);
  assert.deepEqual(occurrences, [0, 1, 2, 3]);
  scheduler.stop();
  clock.advance(1000);
  assert.equal(occurrences.length, 4);
  assert.equal(clock.tasks.size, 0);
});
test('server stop cancels melody attacks and releases sounding notes', () => {
  const midi = fakeMidi(),
    clock = new FakeClock(),
    player = new PlayerService(midi, clock);
  player.setMidiOutputEnabled(true);
  const project = defaultProject();
  project.melody.enabled = project.playback.melody = true;
  player.start(project, 'tab', 0, 0);
  clock.advance(50);
  player.stop('tab', player.status().runId);
  const count = midi.events.length;
  clock.advance(10000);
  assert.equal(midi.events.length, count);
  assert.equal(player.status().playing, false);
  assert.ok(midi.events.some((event) => (event[0] & 0xf0) === 0x80));
});
test('native live note follows release, independent of progression tempo', () => {
  const midi = fakeMidi(),
    clock = new FakeClock(),
    player = new PlayerService(midi, clock);
  player.setMidiOutputEnabled(true);
  player.press('a', 60, 80);
  clock.advance(2000);
  assert.deepEqual(midi.events, [[0x92, 60, 80]]);
  player.release('a');
  player.release('a');
  assert.deepEqual(midi.events, [
    [0x92, 60, 80],
    [0x82, 60, 0],
  ]);
});
test('overlap shares one note per channel until the final owner releases', () => {
  const events: number[][] = [];
  const notes = new NoteRegistry(
    (n, v, c) => events.push([0x90 + c, n, v]),
    (n, c) => events.push([0x80 + c, n, 0]),
  );
  notes.press('a', 60, 80, 0);
  notes.press('b', 60, 90, 0);
  notes.press('melody', 60, 90, 1);
  notes.release('b');
  assert.equal(events.length, 2);
  notes.release('melody');
  assert.deepEqual(events.at(-1), [0x81, 60, 0]);
  notes.release('a');
  assert.deepEqual(events.at(-1), [0x80, 60, 0]);
});
test('ownership and revision reject stale updates without altering playback', () => {
  const player = new PlayerService(fakeMidi(), new FakeClock()),
    project = defaultProject();
  player.start(project, 'a', 3, 0);
  assert.throws(() => player.start(project, 'b'));
  assert.throws(() => player.stop('b', player.status().runId));
  assert.throws(() => player.update(project, 'a', 2, undefined, player.status().runId));
  assert.equal(player.status().revision, 3);
  assert.equal(player.status().owner, 'a');
  player.panic();
});
test('device exceptions are supervised and terminate the active run', () => {
  const midi = fakeMidi(),
    clock = new FakeClock();
  midi.sendNoteOn = () => {
    throw new Error('disconnected');
  };
  const player = new PlayerService(midi, clock);
  player.setMidiOutputEnabled(true);
  player.start(defaultProject(), 'a', 0, 0);
  clock.advance(20);
  assert.equal(player.status().playing, false);
  assert.equal(player.status().error, 'disconnected');
});

test('playback lease expires after a disconnected tab and heartbeat renews it', () => {
  const clock = new FakeClock(),
    player = new PlayerService(fakeMidi(), clock);
  player.start(defaultProject(), 'tab', 0, 0);
  clock.advance(9000);
  player.heartbeat('tab', player.status().runId);
  clock.advance(9000);
  assert.equal(player.status().playing, true);
  clock.advance(1001);
  assert.equal(player.status().playing, false);
  assert.match(player.status().error ?? '', /disconnected/);
  assert.equal(clock.tasks.size, 0);
});

test('panic still releases live notes when a progression note-off throws', () => {
  const midi = fakeMidi(),
    clock = new FakeClock(),
    player = new PlayerService(midi, clock);
  player.setMidiOutputEnabled(true);
  player.start(defaultProject(), 'tab', 0, 0);
  clock.advance(10);
  player.press('tab:held', 100, 90, 3);
  const released: number[] = [];
  midi.sendNoteOff = (note) => {
    released.push(note);
    throw new Error('device unavailable');
  };
  assert.throws(() => player.panic());
  assert.ok(released.includes(100));
  assert.equal(player.status().playing, false);
  assert.equal(clock.tasks.size, 0);
  assert.doesNotThrow(() => player.panic());
});

test('held-note timeout is supervised even if the output disconnects', () => {
  const midi = fakeMidi(),
    clock = new FakeClock(),
    player = new PlayerService(midi, clock);
  player.setMidiOutputEnabled(true);
  player.press('held', 60, 80);
  midi.sendNoteOff = () => {
    throw new Error('unplugged');
  };
  assert.doesNotThrow(() => clock.advance(10001));
  assert.equal(player.status().error, 'unplugged');
  assert.equal(clock.tasks.size, 0);
});

test('schedulers with different lookahead apply an edit at the same future boundary', () => {
  const clock = new FakeClock();
  const project = defaultProject();
  project.bpm = 240;
  const before = compileProject(project);
  project.bpm = 120;
  const after = compileProject(project);
  const events: { at: number; bpm: number }[][] = [[], []];
  const schedulers = [0, 80].map(
    (lookahead, index) =>
      new LoopScheduler(
        clock,
        (_step, at, bpm) => events[index].push({ at, bpm }),
        (error) => {
          throw error;
        },
        lookahead,
      ),
  );
  for (const scheduler of schedulers) scheduler.start(before, 100);
  clock.advance(530); // Browser has queued the 600ms chord; native output has not.
  for (const scheduler of schedulers) scheduler.update(after, 900);
  clock.advance(1800);
  for (const scheduler of schedulers) scheduler.stop();
  assert.deepEqual(events[0], events[1]);
  assert.deepEqual(events[0].slice(0, 3), [
    { at: 100, bpm: 240 },
    { at: 600, bpm: 240 },
    { at: 1100, bpm: 120 },
  ]);
});
