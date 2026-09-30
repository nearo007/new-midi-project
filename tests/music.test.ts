import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chordNotes,
  scaleNotes,
  legacyChord,
  defaultProject,
  compileProject,
  generateMelody,
  parseProject,
  parseProgression,
  transposeProject,
  newChord,
} from '@midi-toolbox/core';

test('Cmaj7 includes all four valid notes, including legacy input', () => {
  assert.deepEqual(chordNotes(legacyChord([1, 4, 0, 1, false], 'c')), [60, 64, 67, 71]);
});
test('major and chromatic scales include the tonic and optional octave', () => {
  assert.deepEqual(scaleNotes('major', 1, 4), [60, 62, 64, 65, 67, 69, 71]);
  assert.equal(scaleNotes('chromatic', 1, 4).length, 12);
  assert.equal(scaleNotes('major', 1, 4, true).at(-1), 72);
});
test('all supported chord shapes produce integer MIDI notes', () => {
  for (let root = 0; root < 12; root++)
    for (let octave = 1; octave <= 7; octave++) {
      for (const quality of ['major', 'minor'] as const)
        for (const seventh of ['none', 'maj7', 'min7'] as const) {
          for (let inversion = 0; inversion < (seventh === 'none' ? 3 : 4); inversion++) {
            const notes = chordNotes({
              ...newChord('c'),
              rootPitchClass: root,
              octave,
              quality,
              seventh,
              inversion,
            });
            assert.ok(notes.every((note) => Number.isInteger(note) && note >= 0 && note <= 127));
          }
        }
    }
});
test('melody is deterministic and survives a project round trip', () => {
  const project = defaultProject('test', 345);
  project.melody.enabled = project.playback.melody = true;
  assert.deepEqual(
    compileProject(project),
    compileProject(parseProject(JSON.parse(JSON.stringify(project)))),
  );
  for (const scale of ['chord', 'major', 'minor', 'blues', 'chromatic'] as const) {
    const melody = generateMelody(project.chords, { ...project.melody, scale });
    assert.ok(melody.flat().every((note) => note >= 60 && note <= 83));
  }
});
test('validation rejects malformed tuples, tempo and duplicate identities', () => {
  for (const bpm of [-120, 0, null, '80', Infinity, 241])
    assert.throws(() => parseProgression({ chords: [[1, 4, 0, 0, false]], bpm }));
  for (const chord of [null, [], [99, 99, 0, 0, false], [1, 4, 0, 0, 'false']])
    assert.throws(() => parseProgression({ chords: [chord] }));
  const project = defaultProject();
  project.chords[1].id = project.chords[0].id;
  assert.throws(() => parseProject(project));
});
test('compilation respects durations, mute, range and distinct musical channels', () => {
  const project = defaultProject();
  project.chords[0].durationBeats = 4;
  project.chords[0].muted = true;
  project.melody.enabled = project.playback.melody = true;
  project.loop = { startId: project.chords[0].id, endId: project.chords[1].id };
  const sequence = compileProject(project);
  assert.equal(sequence.totalBeats, 6);
  assert.equal(sequence.steps.length, 2);
  assert.ok(sequence.steps[0].events.every((event) => event.channel === 1));
  assert.ok(sequence.steps[1].events.some((event) => event.channel === 0));
  assert.equal(compileProject(project, false).steps.length, 4);
});
test('transposition is reversible and rejects register overflow', () => {
  const project = defaultProject();
  assert.deepEqual(transposeProject(transposeProject(project, 1), -1), project);
  project.chords[0].octave = 7;
  assert.throws(() => transposeProject(project, 12));
});

test('same-pitch manual notes have one gate per channel and retrigger chronologically', () => {
  const project = defaultProject();
  project.playback.melody = project.melody.enabled = true;
  project.melodyNotes = [
    { id: 'b', note: 60, startBeat: 1, durationBeats: 2, velocity: 90, sourceChannel: 0 },
    { id: 'a', note: 60, startBeat: 0, durationBeats: 3, velocity: 80, sourceChannel: 0 },
    { id: 'c', note: 60, startBeat: 1, durationBeats: 1, velocity: 110, sourceChannel: 0 },
  ];
  const notes = compileProject(project)
    .steps.flatMap((step) => step.events)
    .filter((event) => event.track === 'melody')
    .sort((a, b) => a.startBeat - b.startBeat);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].durationBeats, 1);
  assert.equal(notes[1].durationBeats, 2);
  assert.equal(notes[1].velocity, 110);
});
