import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../server/src/app.js';
import { fakeMidi } from './midi-fixture.js';
import { defaultProject, parseProject } from '@midi-toolbox/core';

async function withApi(
  run: (post: (path: string, body: unknown, method?: string) => Promise<Response>) => Promise<void>,
) {
  const { app, player } = createApp(fakeMidi());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  try {
    await run((path, body, method = 'POST') =>
      fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(1500),
      }),
    );
  } finally {
    player.panic();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('old and missing run IDs cannot update, stop or renew a restarted session', async () => {
  await withApi(async (post) => {
    const body = { project: defaultProject(), session: 'same-tab', revision: 0 };
    const first = await (await post('/chord-lab/start-progression', body)).json();
    assert.equal(
      (await post('/chord-lab/stop-progression', { session: body.session, runId: first.runId }))
        .status,
      200,
    );
    const second = await (await post('/chord-lab/start-progression', body)).json();
    assert.notEqual(first.runId, second.runId);
    for (const runId of [first.runId, undefined]) {
      for (const [path, method] of [
        ['/chord-lab/progression', 'PUT'],
        ['/chord-lab/stop-progression', 'POST'],
        ['/chord-lab/heartbeat', 'POST'],
      ]) {
        const response = await post(path, { ...body, revision: 1, runId }, method);
        assert.equal(response.status, runId === undefined ? 400 : 409, `${method} ${path}`);
      }
    }
    const status = await (
      await post('/chord-lab/heartbeat', { session: body.session, runId: second.runId })
    ).json();
    assert.equal(status.playing, true);
    assert.equal(status.runId, second.runId);
    assert.equal(status.revision, 0);
    assert.equal(
      (await post('/chord-lab/progression', { ...body, revision: 1, runId: second.runId }, 'PUT'))
        .status,
      200,
    );
  });
});

test('native playback accepts a maximum-note project and still bounds request size', async () => {
  await withApi(async (post) => {
    const project = defaultProject();
    project.melodyNotes = Array.from({ length: 2048 }, (_, i) => ({
      id: crypto.randomUUID(),
      note: 60,
      startBeat: i / 512,
      durationBeats: 0.001,
      velocity: 96,
      sourceChannel: 1,
    }));
    const body = { project: parseProject(project), session: 'dense', revision: 0 };
    assert.ok(Buffer.byteLength(JSON.stringify(body)) > 256 * 1024);
    const response = await post('/chord-lab/start-progression', body);
    assert.equal(response.status, 200);
    const { runId } = await response.json();
    assert.equal(
      (await post('/chord-lab/progression', { ...body, runId, revision: 1 }, 'PUT')).status,
      200,
    );
    assert.equal(
      (await post('/chord-lab/start-progression', { padding: 'x'.repeat(2 * 1024 * 1024) })).status,
      413,
    );
  });
});

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
