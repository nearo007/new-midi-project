import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import {
  boolean,
  number,
  object,
  parseProgression,
  text,
  ValidationError,
  chordName,
  legacyChord,
} from '@midi-toolbox/core';
import type { MidiOutput } from './ports/midi-output.js';
import { PlayerService } from './application/player-service.js';

const asyncRoute =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status =
    typeof error.status === 'number' && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : error.message,
    code: error.code ?? (status === 400 ? 'INVALID_INPUT' : 'INTERNAL_ERROR'),
  });
};
export function createApp(midi: MidiOutput, player = new PlayerService(midi)) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/ports', (_req, res) =>
    res.json({ ports: midi.listPorts(), current: midi.currentPort(), ...midi.status() }),
  );
  let changingPort = false;
  app.post(
    '/api/set-port',
    asyncRoute(async (req, res) => {
      const body = object(req.body, 'body');
      const port = text(body.port, 'port', 200);
      player.checkOwner(text(body.session ?? 'legacy', 'session'));
      if (changingPort) {
        res.status(409).json({ error: 'Device selection is already in progress' });
        return;
      }
      changingPort = true;
      try {
        if (!midi.listPorts().includes(port))
          throw new ValidationError('The selected MIDI output is unavailable');
        player.panic();
        midi.closePort();
        await midi.openPort(port);
        player.setMidiOutputEnabled(true);
        res.json({ ok: true, current: midi.currentPort() });
      } finally {
        changingPort = false;
      }
    }),
  );
  app.post('/api/clear-port', (req, res) => {
    player.checkOwner(text(object(req.body ?? {}, 'body').session ?? 'legacy', 'session'));
    if (changingPort) {
      res.status(409).json({ error: 'Device selection is already in progress' });
      return;
    }
    player.setMidiOutputEnabled(false);
    midi.closePort();
    res.json({ ok: true });
  });
  app.post('/api/midi-output', (req, res) => {
    const body = object(req.body, 'body');
    const enabled = boolean(body.enabled, 'enabled');
    player.checkOwner(text(body.session ?? 'legacy', 'session'));
    player.setMidiOutputEnabled(enabled);
    res.json({ ok: true, enabled });
  });
  app.post('/api/note-on', (req, res) => {
    const body = object(req.body, 'body');
    const session = text(body.session, 'session'),
      id = text(body.id, 'id');
    player.press(
      `${session}:${id}`,
      number(body.note, 'note', 0, 127),
      number(body.velocity, 'velocity', 1, 127),
      number(body.channel ?? 2, 'channel', 0, 15),
    );
    res.json({ ok: true });
  });
  app.post('/api/note-off', (req, res) => {
    const body = object(req.body, 'body');
    player.release(`${text(body.session, 'session')}:${text(body.id, 'id')}`);
    res.json({ ok: true });
  });
  app.post('/api/release-session', (req, res) => {
    player.releaseSession(text(object(req.body, 'body').session, 'session'));
    res.json({ ok: true });
  });
  app.post('/api/note-heartbeat', (req, res) => {
    const body = object(req.body, 'body');
    const session = text(body.session, 'session');
    if (!Array.isArray(body.ids) || body.ids.length > 128)
      throw new ValidationError('Invalid held notes');
    for (const id of body.ids) player.renew(`${session}:${text(id, 'id')}`);
    res.json({ ok: true });
  });
  app.post('/api/play', (req, res) => {
    const body = object(req.body, 'body');
    const note = number(body.keyNum, 'keyNum', 0, 127),
      velocity = number(body.velocity ?? 100, 'velocity', 1, 127);
    const id = `preview:${crypto.randomUUID()}`;
    player.press(id, note, velocity);
    setTimeout(() => {
      try {
        player.release(id);
      } catch (error) {
        console.error(error);
      }
    }, 300).unref();
    res.json({ ok: true });
  });
  app.post('/api/panic', (_req, res) => {
    player.panic();
    res.json({ ok: true });
  });
  app.post('/api/chord-lab/start-progression', (req, res) => {
    const body = object(req.body, 'body');
    const project = parseProgression(body);
    const owner = text(body.session ?? 'legacy', 'session');
    const revision = number(body.revision ?? 0, 'revision', 0, Number.MAX_SAFE_INTEGER);
    const delay = number(body.delayMs ?? 100, 'delayMs', 0, 15000, false);
    res.json({ ok: true, ...player.start(project, owner, revision, delay) });
  });
  app.put('/api/chord-lab/progression', (req, res) => {
    const body = object(req.body, 'body');
    const project = parseProgression(body);
    player.update(
      project,
      text(body.session ?? 'legacy', 'session'),
      number(body.revision ?? player.status().revision + 1, 'revision', 0, Number.MAX_SAFE_INTEGER),
      body.applyAt === undefined
        ? undefined
        : number(body.applyAt, 'applyAt', Date.now() - 1000, Date.now() + 10000, false),
    );
    res.json({ ok: true });
  });
  app.post('/api/chord-lab/heartbeat', (req, res) => {
    player.heartbeat(text(object(req.body, 'body').session, 'session'));
    res.json(player.status());
  });
  app.post('/api/chord-lab/stop-progression', (req, res) => {
    const body = object(req.body ?? {}, 'body');
    player.stop(text(body.session ?? 'legacy', 'session'));
    res.json({ ok: true });
  });
  app.get('/api/chord-lab/status', (_req, res) => res.json(player.status()));
  app.get('/api/chord-lab/progression/preview', (req, res) => {
    if (!req.query.chords) {
      res.json([]);
      return;
    }
    try {
      const value: unknown = JSON.parse(String(req.query.chords));
      if (!Array.isArray(value) || value.length > 128) throw new ValidationError('Invalid chords');
      res.json(value.map((chord, i) => chordName(legacyChord(chord, String(i)))));
    } catch {
      throw new ValidationError('Invalid chords format');
    }
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: 'API route not found', code: 'NOT_FOUND' }),
  );
  app.use(errorHandler);
  return { app, player };
}
