import { compileProject } from './sequence.js';
import type { Project } from './project.js';
const bytes = (value: number, length: number) =>
  Array.from({ length }, (_, i) => (value >>> (8 * (length - i - 1))) & 255);
function variable(value: number): number[] {
  const result = [value & 127];
  while ((value >>>= 7)) result.unshift((value & 127) | 128);
  return result;
}
const chunk = (name: string, data: number[]) => [
  ...[...name].map((c) => c.charCodeAt(0)),
  ...bytes(data.length, 4),
  ...data,
];
/** Standard MIDI File type 1, 480 ticks/quarter, one tempo track and two musical tracks. */
export function exportMidi(project: Project): Uint8Array {
  const sequence = compileProject(project, false),
    ppq = 480;
  const tracks: number[][] = [];
  const tempo = Math.round(60000000 / sequence.bpm);
  tracks.push(chunk('MTrk', [0, 0xff, 0x51, 3, ...bytes(tempo, 3), 0, 0xff, 0x2f, 0]));
  for (const track of ['harmony', 'melody'] as const) {
    const events: { tick: number; message: number[]; order: number }[] = [];
    let beat = 0;
    for (const step of sequence.steps) {
      for (const event of step.events.filter((event) => event.track === track)) {
        const on = Math.round((beat + event.startBeat) * ppq);
        const off = Math.max(
          on + 1,
          Math.round((beat + event.startBeat + event.durationBeats) * ppq),
        );
        events.push({
          tick: on,
          message: [0x90 + event.channel, event.note, event.velocity],
          order: 1,
        });
        events.push({ tick: off, message: [0x80 + event.channel, event.note, 0], order: 0 });
      }
      beat += step.durationBeats;
    }
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const name = [...track].map((c) => c.charCodeAt(0));
    const data = [0, 0xff, 3, name.length, ...name];
    let tick = 0;
    for (const event of events) {
      data.push(...variable(event.tick - tick), ...event.message);
      tick = event.tick;
    }
    data.push(
      ...variable(Math.max(0, Math.round(sequence.totalBeats * ppq) - tick)),
      0xff,
      0x2f,
      0,
    );
    tracks.push(chunk('MTrk', data));
  }
  return Uint8Array.from([
    ...chunk('MThd', [0, 1, 0, tracks.length, ...bytes(ppq, 2)]),
    ...tracks.flat(),
  ]);
}
