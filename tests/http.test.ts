import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../server/src/app.js';
import { fakeMidi } from './midi-fixture.js';

test('HTTP rejects bad input, preserves state and survives subsequent requests', async () => {
  const { app, player } = createApp(fakeMidi());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  const base = `http://127.0.0.1:${address.port}/api`;
  const post = (path: string, body: unknown, method = 'POST') =>
    fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
  try {
    const valid = { chords: [[1, 4, 0, 0, false]], bpm: 120 };
    assert.equal((await post('/chord-lab/start-progression', valid)).status, 200);
    const runId = player.status().runId;
    for (const body of [
      { ...valid, bpm: -120 },
      { ...valid, bpm: 0 },
      { chords: [null] },
      { chords: [[99, 99, 0, 0, false]] },
    ]) {
      assert.equal((await post('/chord-lab/start-progression', body)).status, 400);
      assert.equal((await post('/chord-lab/progression', body, 'PUT')).status, 400);
      assert.equal(player.status().runId, runId);
    }
    assert.equal((await post('/play', { keyNum: 60.5 })).status, 400);
    const malformed = await fetch(base + '/play', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await fetch(base + '/health')).status, 200);
    assert.equal((await fetch(base + '/unknown')).status, 404);
  } finally {
    player.panic();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
