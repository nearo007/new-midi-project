import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultProject, exportMidi } from '@midi-toolbox/core';

test('SMF export contains tempo, track names, channels, note gates and the full project duration', () => {
  const project = defaultProject();
  project.bpm = 120;
  project.chords = project.chords.slice(0, 1);
  project.chords[0].durationBeats = 4;
  project.playback.melody = project.melody.enabled = true;
  project.tracks.harmony.channel = 4;
  project.tracks.melody.channel = 8;
  project.melodyNotes = [
    { id: 'note', note: 74, startBeat: 1, durationBeats: 0.5, velocity: 90, sourceChannel: 2 },
  ];
  const file = Buffer.from(exportMidi(project));
  assert.equal(file.toString('ascii', 0, 4), 'MThd');
  assert.equal(file.readUInt32BE(4), 6);
  assert.equal(file.readUInt16BE(8), 1);
  assert.equal(file.readUInt16BE(10), 3);
  assert.equal(file.readUInt16BE(12), 480);
  let position = 14;
  const tracks: { tick: number; status: number; data: number[] }[][] = [];
  const readVariable = () => {
    let value = 0,
      byte: number;
    do {
      byte = file[position++];
      value = value * 128 + (byte & 127);
    } while (byte & 128);
    return value;
  };
  while (position < file.length) {
    assert.equal(file.toString('ascii', position, position + 4), 'MTrk');
    const end = position + 8 + file.readUInt32BE(position + 4);
    position += 8;
    const events: (typeof tracks)[number] = [];
    let tick = 0;
    while (position < end) {
      tick += readVariable();
      const status = file[position++];
      if (status === 0xff) {
        const kind = file[position++],
          length = readVariable();
        events.push({ tick, status: kind, data: [...file.subarray(position, position + length)] });
        position += length;
      } else {
        assert.ok(status >= 0x80 && status < 0xa0);
        events.push({ tick, status, data: [...file.subarray(position, position + 2)] });
        position += 2;
      }
    }
    assert.equal(position, end);
    tracks.push(events);
  }
  assert.deepEqual(tracks[0][0], { tick: 0, status: 0x51, data: [7, 161, 32] }); // 500000 us/quarter
  assert.equal(Buffer.from(tracks[1][0].data).toString(), 'harmony');
  assert.equal(Buffer.from(tracks[2][0].data).toString(), 'melody');
  assert.ok(tracks[1].some((e) => e.status === 0x94));
  assert.deepEqual(tracks[2].slice(1, 3), [
    { tick: 480, status: 0x98, data: [74, 90] },
    { tick: 720, status: 0x88, data: [74, 0] },
  ]);
  assert.equal(tracks[1].at(-1)?.tick, 1920);
  assert.equal(tracks[2].at(-1)?.tick, 1920);
});
