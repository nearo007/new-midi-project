import { Router } from 'express';
import type { PlayerService, SequenceEntry } from '../application/player-service.js';
import type { JzzAdapter } from '../infrastructure/midi/jzz-adapter.js';
import { getScaleNotes } from '../core/scale.js';
import { getChord } from '../core/chord.js';
import { chordDisplayName } from '../core/note.js';
import type { Tonality, SeventhType } from '../core/chord.js';

const TONALITY_MAP: Record<number, Tonality> = { 0: 'major', 1: 'minor' };
const SEVENTH_MAP: Record<number, SeventhType> = { 0: 'none', 1: 'maj7', 2: 'min7' };

type ChordTuple = [number, number, number, number, boolean];

function buildSequence(chords: ChordTuple[]): SequenceEntry[] {
  return chords.map(([noteKey, octave, tonality, seventh, muted]) => {
    const scale = getScaleNotes('chromatic', noteKey, octave);
    const notes = getChord(
      scale,
      TONALITY_MAP[tonality] ?? 'major',
      SEVENTH_MAP[seventh] ?? 'none',
    );
    return { notes, muted: muted ?? false };
  });
}

export function chordLabRouter(player: PlayerService, midi: JzzAdapter) {
  const router = Router();

  router.post('/start-progression', async (req, res) => {
    const { chords, bpm } = req.body as {
      chords: ChordTuple[];
      bpm?: number;
    };

    if (!Array.isArray(chords) || chords.length === 0) {
      res.status(400).json({ error: 'chords must be a non-empty array' });
      return;
    }

    if (bpm !== undefined) {
      player.setLoopBpm(bpm);
    }

    player.loopSequence(buildSequence(chords));
    res.json({ ok: true });
  });

  router.put('/progression', (req, res) => {
    const { chords } = req.body as { chords: ChordTuple[] };

    if (!Array.isArray(chords) || chords.length === 0) {
      res.status(400).json({ error: 'chords must be a non-empty array' });
      return;
    }

    if (!player.updateLoopSequence(buildSequence(chords))) {
      res.status(409).json({ error: 'No progression is currently playing' });
      return;
    }

    res.json({ ok: true });
  });

  router.post('/stop-progression', (_req, res) => {
    player.stopLoop();
    res.json({ ok: true });
  });

  router.get('/status', (_req, res) => {
    res.json({ playing: player.isPlaying(), currentChord: player.currentChordIndex });
  });

  router.get('/progression/preview', (req, res) => {
    const { chords } = req.query as { chords?: string };
    if (!chords) {
      res.json([]);
      return;
    }
    try {
      const parsed: ChordTuple[] = JSON.parse(chords);
      const names = parsed.map(([noteKey, , tonality, seventh]) =>
        chordDisplayName(noteKey, tonality, seventh),
      );
      res.json(names);
    } catch {
      res.status(400).json({ error: 'Invalid chords format' });
    }
  });

  return router;
}
