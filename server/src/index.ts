import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { DisabledMidiAdapter } from './infrastructure/midi/disabled-adapter.js';
import type { MidiOutput } from './ports/midi-output.js';
import { createApp, errorHandler } from './app.js';
import { PlayerService } from './application/player-service.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer from 1 to 65535');
const host = process.env.HOST ?? '127.0.0.1';
if (host !== 'localhost' && !isIP(host)) throw new Error('HOST must be an IP address or localhost');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client');
let midi: MidiOutput;
if (process.env.MIDI_BACKEND === 'none') midi = new DisabledMidiAdapter();
else {
  const { JzzAdapter } = await import('./infrastructure/midi/jzz-adapter.js');
  const adapter = new JzzAdapter();
  await adapter.init();
  midi = adapter;
}
const { app, player } = createApp(
  midi,
  new PlayerService(midi, undefined, (event) => console.info(JSON.stringify(event))),
);
if (midi.status().error) console.warn(midi.status().error);
let closeVite: (() => Promise<void>) | undefined;
if (process.env.NODE_ENV === 'development') {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: clientRoot,
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
} else {
  const dist = path.join(clientRoot, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errorHandler);
const server = app.listen(port, host, () =>
  console.log(`MIDI Toolbox server running on http://${host}:${port}`),
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    player.panic();
  } catch (error) {
    console.error('Could not release every MIDI note during shutdown:', error);
  }
  try {
    midi.closePort();
  } catch (error) {
    console.error('Could not close the MIDI port:', error);
  }
  try {
    await closeVite?.();
  } finally {
    server.close();
    server.closeAllConnections();
  }
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
