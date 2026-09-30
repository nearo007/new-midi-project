import { chordNotes, generateMelody } from './music.js';
import { parseProject, type Project } from './project.js';
export interface NoteEvent {
  note: number;
  channel: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
  track: 'harmony' | 'melody';
}
export interface SequenceStep {
  chordId: string;
  durationBeats: number;
  events: NoteEvent[];
}
export interface CompiledSequence {
  bpm: number;
  steps: SequenceStep[];
  totalBeats: number;
}
export function compileProject(value: Project, useLoop = true): CompiledSequence {
  const project = parseProject(value);
  const melody = generateMelody(project.chords, {
    ...project.melody,
    enabled: project.melody.enabled && project.playback.melody,
  });
  let position = 0;
  let steps: SequenceStep[] = project.chords.map((chord, index) => {
    const events: NoteEvent[] = [];
    if (project.playback.chords && !chord.muted && project.tracks.harmony.volume > 0) {
      for (const note of chordNotes(chord))
        events.push({
          note,
          channel: project.tracks.harmony.channel,
          velocity: Math.max(
            1,
            Math.round(project.playback.harmonyVelocity * project.tracks.harmony.volume),
          ),
          startBeat: 0,
          durationBeats: chord.durationBeats,
          track: 'harmony',
        });
    }
    const notes = melody[index] ?? [];
    const slot = chord.durationBeats / Math.max(1, notes.length);
    if (project.playback.melody && project.tracks.melody.volume > 0) {
      if (project.melodyNotes !== null) {
        for (const note of project.melodyNotes.filter(
          (note) => note.startBeat >= position && note.startBeat < position + chord.durationBeats,
        )) {
          events.push({
            ...note,
            startBeat: note.startBeat - position,
            channel: project.tracks.melody.channel,
            velocity: Math.max(1, Math.round(note.velocity * project.tracks.melody.volume)),
            track: 'melody',
          });
        }
      } else
        notes.forEach((note, i) =>
          events.push({
            note,
            channel: project.tracks.melody.channel,
            velocity: Math.max(
              1,
              Math.round(project.playback.melodyVelocity * project.tracks.melody.volume),
            ),
            startBeat: slot * i,
            durationBeats: slot * 0.72,
            track: 'melody',
          }),
        );
    }
    position += chord.durationBeats;
    return { chordId: chord.id, durationBeats: chord.durationBeats, events };
  });
  if (useLoop && project.loop) {
    const range = project.loop;
    steps = steps.slice(
      steps.findIndex((step) => step.chordId === range.startId),
      steps.findIndex((step) => step.chordId === range.endId) + 1,
    );
  }
  const endBeat = steps.reduce((sum, step) => sum + step.durationBeats, 0);
  const lanes = new Map<string, { event: NoteEvent; start: number }[]>();
  let cursor = 0;
  for (const step of steps) {
    for (const event of step.events) {
      event.durationBeats = Math.min(event.durationBeats, endBeat - cursor - event.startBeat);
      const key = `${event.channel}:${event.note}`;
      const lane = lanes.get(key) ?? [];
      lane.push({ event, start: cursor + event.startBeat });
      lanes.set(key, lane);
    }
    cursor += step.durationBeats;
  }
  // MIDI 1.0 cannot release separate owners of the same pitch/channel.
  // A new attack ends its predecessor; simultaneous duplicates share one gate.
  for (const lane of lanes.values()) {
    lane.sort((a, b) => a.start - b.start);
    let previous: (typeof lane)[number] | undefined;
    for (const entry of lane) {
      if (previous?.start === entry.start) {
        previous.event.durationBeats = Math.max(
          previous.event.durationBeats,
          entry.event.durationBeats,
        );
        previous.event.velocity = Math.max(previous.event.velocity, entry.event.velocity);
        entry.event.durationBeats = 0;
        continue;
      }
      if (previous)
        previous.event.durationBeats = Math.min(
          previous.event.durationBeats,
          entry.start - previous.start,
        );
      previous = entry;
    }
  }
  for (const step of steps)
    step.events = step.events
      .filter((event) => event.durationBeats > 0)
      .sort((a, b) => a.startBeat - b.startBeat);
  return {
    bpm: project.bpm,
    steps,
    totalBeats: steps.reduce((sum, step) => sum + step.durationBeats, 0),
  };
}
