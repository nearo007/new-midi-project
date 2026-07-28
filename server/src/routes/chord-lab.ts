import { Router } from 'express';
import type { PlayerService, SequenceEntry } from '../application/player-service.js';
import type { JzzAdapter } from '../infrastructure/midi/jzz-adapter.js';
import { getScaleNotes } from '../core/scale.js';
import { getChord } from '../core/chord.js';
import { chordDisplayName } from '../core/note.js';
import type { Tonality, SeventhType } from '../core/chord.js';
import {
  generateMelody,
  validateMelodySettings,
  type MelodySettings,
} from '../core/melody.js';

const TONALITY_MAP: Record<number, Tonality> = { 0: 'major', 1: 'minor' };
const SEVENTH_MAP: Record<number, SeventhType> = { 0: 'none', 1: 'maj7', 2: 'min7' };

type ChordTuple = [number, number, number, number, boolean];
export interface PlaybackSettings {
  chords: boolean;
  melody: boolean;
}

function validatePlaybackSettings(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'playback must be an object';
  const playback = value as Partial<PlaybackSettings>;
  if (typeof playback.chords !== 'boolean' || typeof playback.melody !== 'boolean') {
    return 'playback.chords and playback.melody must be booleans';
  }
  return null;
}

function buildSequence(
  chords: ChordTuple[],
  melody?: MelodySettings,
  playback: PlaybackSettings = { chords: true, melody: Boolean(melody?.enabled) },
): SequenceEntry[] {
  const entries: SequenceEntry[] = chords.map(([noteKey, octave, tonality, seventh, muted]) => {
    const scale = getScaleNotes('chromatic', noteKey, octave);
    const notes = getChord(
      scale,
      TONALITY_MAP[tonality] ?? 'major',
      SEVENTH_MAP[seventh] ?? 'none',
    );
    return { notes, muted: !playback.chords || (muted ?? false) };
  });

  if (melody) {
    const melodyNotes = generateMelody(entries, { ...melody, enabled: playback.melody && melody.enabled });
    entries.forEach((entry, index) => {
      entry.melodyNotes = melodyNotes[index];
    });
  }
  return entries;
}

export function chordLabRouter(player: PlayerService, midi: JzzAdapter) {
  const router = Router();

  router.post('/start-progression', async (req, res) => {
    const { chords, bpm, melody, playback } = req.body as {
      chords: ChordTuple[];
      bpm?: number;
      melody?: MelodySettings;
      playback?: PlaybackSettings;
    };

    if (!Array.isArray(chords) || chords.length === 0) {
      res.status(400).json({ error: 'chords must be a non-empty array' });
      return;
    }

    if (melody !== undefined) {
      const melodyError = validateMelodySettings(melody);
      if (melodyError) {
        res.status(400).json({ error: melodyError });
        return;
      }
    }

    if (playback !== undefined) {
      const playbackError = validatePlaybackSettings(playback);
      if (playbackError) {
        res.status(400).json({ error: playbackError });
        return;
      }
    }

    if (bpm !== undefined) {
      player.setLoopBpm(bpm);
    }

    player.loopSequence(buildSequence(chords, melody, playback));
    res.json({ ok: true });
  });

  router.put('/progression', (req, res) => {
    const { chords, bpm, melody, playback } = req.body as {
      chords: ChordTuple[];
      bpm?: number;
      melody?: MelodySettings;
      playback?: PlaybackSettings;
    };

    if (!Array.isArray(chords) || chords.length === 0) {
      res.status(400).json({ error: 'chords must be a non-empty array' });
      return;
    }

    if (melody !== undefined) {
      const melodyError = validateMelodySettings(melody);
      if (melodyError) {
        res.status(400).json({ error: melodyError });
        return;
      }
    }

    if (playback !== undefined) {
      const playbackError = validatePlaybackSettings(playback);
      if (playbackError) {
        res.status(400).json({ error: playbackError });
        return;
      }
    }

    if (!player.updateLoopSequence(buildSequence(chords, melody, playback))) {
      res.status(409).json({ error: 'No progression is currently playing' });
      return;
    }

    if (bpm !== undefined) {
      player.setLoopBpm(bpm);
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
