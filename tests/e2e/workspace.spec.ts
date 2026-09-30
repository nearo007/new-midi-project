import { test, expect, type Page } from '@playwright/test';
import { defaultProject, type Project } from '@midi-toolbox/core';
import { readFile } from 'node:fs/promises';

async function setup(page: Page, project: Project = defaultProject('test', 123), sound = '8bit') {
  await page.addInitScript(
    ({ project, sound }) => {
      localStorage.setItem(
        'midi-toolbox-projects-v1',
        JSON.stringify({ current: project, library: [] }),
      );
      localStorage.setItem('midi-toolbox-settings', JSON.stringify({ soundMode: sound }));
      const w = window as any;
      w.__audit = { voices: [], midi: [] };
      const Original = window.AudioContext;
      w.AudioContext = class extends Original {
        constructor(...args: any[]) {
          super(...args);
          w.__audit.ctx = this;
        }
        createOscillator() {
          return wrap(super.createOscillator(), this);
        }
        createBufferSource() {
          return wrap(super.createBufferSource(), this);
        }
      };
      function wrap(source: any, ctx: AudioContext) {
        const item = {
          start: 0,
          stop: Infinity,
          created: ctx.currentTime,
          kind: source.constructor.name,
        };
        const start = source.start.bind(source),
          stop = source.stop.bind(source);
        source.start = (at = 0) => {
          item.start = at;
          w.__audit.voices.push(item);
          return start(at);
        };
        source.stop = (at = 0) => {
          item.stop = at;
          return stop(at);
        };
        return source;
      }
      const input: any = {
        id: 'input',
        name: 'Test controller',
        state: 'connected',
        connection: 'open',
        onmidimessage: null,
      };
      const output: any = {
        id: 'output',
        name: 'Test synth',
        state: 'connected',
        connection: 'open',
        send(data: number[], at?: number) {
          w.__audit.midi.push({ data, at });
        },
      };
      w.__input = input;
      w.__output = output;
      w.__access = { inputs: new Map([['input', input]]), outputs: new Map([['output', output]]) };
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: async () => w.__access,
      });
    },
    { project, sound },
  );
}
const countVoices = (page: Page) => page.evaluate(() => (window as any).__audit.voices.length);

test("closing an untouched stale tab preserves another tab's project and library", async ({
  page,
  context,
}) => {
  await setup(page);
  await page.goto('/chord-lab');
  const stale = await context.newPage();
  await stale.goto('/chord-lab');
  await stale.getByRole('button', { name: 'Save to library', exact: true }).waitFor();
  await page.getByLabel('Project name', { exact: true }).fill('Keep this composition');
  await page.getByLabel('Project name', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await stale.goto('about:blank');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('midi-toolbox-projects-v1')!),
  );
  expect(saved.current.name).toBe('Keep this composition');
  expect(saved.library.map((p: Project) => p.name)).toEqual(['Keep this composition']);
});

test('conflicting tab edits stay available and duplication preserves both library entries', async ({
  page,
  context,
}) => {
  await setup(page);
  await page.goto('/chord-lab');
  const stale = await context.newPage();
  await stale.goto('/chord-lab');
  await stale.getByRole('button', { name: 'Save to library', exact: true }).waitFor();
  await page.getByLabel('Project name', { exact: true }).fill('First idea');
  await page.getByLabel('Project name', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await stale.getByRole('button', { name: 'Add chord', exact: true }).click();
  await expect(stale.getByRole('alert').filter({ hasText: 'Another tab changed' })).toBeVisible();
  await expect(stale.getByRole('article')).toHaveCount(5);
  await stale.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(
    stale.getByRole('alert').filter({ hasText: 'Another tab changed this library entry' }),
  ).toBeVisible();
  await stale.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('midi-toolbox-projects-v1')!),
  );
  expect(saved.current.name).toBe('First idea');
  expect(saved.library.map((p: Project) => p.chords.length).sort()).toEqual([4, 5]);
  expect(new Set(saved.library.map((p: Project) => p.id)).size).toBe(2);
  await stale.goto('about:blank');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('midi-toolbox-projects-v1')!).library.length,
    ),
  ).toBe(2);
});

test('autosave from another tab cannot resurrect a deleted library entry', async ({
  page,
  context,
}) => {
  await setup(page);
  await page.goto('/chord-lab');
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  const second = await context.newPage();
  await second.goto('/chord-lab');
  await second.getByRole('button', { name: 'Save to library', exact: true }).waitFor();
  await page.getByLabel('Library', { exact: false }).selectOption('test');
  await page.getByRole('button', { name: 'Delete saved copy', exact: true }).click();
  await second.getByRole('button', { name: 'Add chord', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('midi-toolbox-projects-v1')!).current.chords.length,
      ),
    )
    .toBe(5);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('midi-toolbox-projects-v1')!).library,
    ),
  ).toEqual([]);
});

test('custom melody explains individual velocity and retains track volume control', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/chord-lab');
  const mixer = page.getByRole('region', { name: 'Track mixer' });
  const melodyVelocity = mixer.getByRole('slider').nth(2);
  await expect(melodyVelocity).toBeEnabled();
  await page.getByRole('button', { name: 'Edit generated notes', exact: true }).click();
  await expect(melodyVelocity).toBeDisabled();
  await expect(mixer.getByText(/individual note velocities/i)).toBeVisible();
  await expect(mixer.getByRole('slider').nth(3)).toBeEnabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(melodyVelocity).toBeEnabled();
});

test('dense sequential melody retains every attack without exceeding simultaneous polyphony', async ({
  page,
}) => {
  const project = defaultProject();
  project.bpm = 240;
  project.chords = project.chords.slice(0, 1);
  project.chords[0].durationBeats = 16;
  project.playback.chords = false;
  project.playback.melody = project.melody.enabled = true;
  project.melodyNotes = Array.from({ length: 200 }, (_, i) => ({
    id: `note-${i}`,
    note: 60,
    startBeat: i * 0.075,
    durationBeats: 0.04,
    velocity: 100,
    sourceChannel: 1,
  }));
  await setup(page, project);
  await page.goto('/chord-lab');
  await page.getByRole('button', { name: 'Play selected', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { ctx, voices } = (window as any).__audit;
        return voices.filter((v: any) => v.start <= ctx.currentTime && v.stop > v.start).length;
      }),
    )
    .toBeGreaterThanOrEqual(200);
  const dropped = await page.evaluate(
    () => (window as any).__audit.voices.slice(0, 200).filter((v: any) => v.stop <= v.start).length,
  );
  expect(dropped).toBe(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const count = await countVoices(page);
  await page.waitForTimeout(200);
  expect(await countVoices(page)).toBe(count);
});

test('local audio still caps a simultaneous chord at 128 voices', async ({ page }) => {
  const project = defaultProject();
  project.chords = project.chords.slice(0, 1);
  project.chords[0].durationBeats = 8;
  project.playback.melody = project.melody.enabled = true;
  project.melodyNotes = Array.from({ length: 128 }, (_, note) => ({
    id: `note-${note}`,
    note,
    startBeat: 0,
    durationBeats: 8,
    velocity: 80,
    sourceChannel: 1,
  }));
  await setup(page, project);
  await page.goto('/chord-lab');
  await page.getByRole('button', { name: 'Play selected', exact: true }).click();
  await expect.poll(() => countVoices(page)).toBe(131);
  const sounding = await page.evaluate(
    () => (window as any).__audit.voices.filter((v: any) => v.stop > v.start).length,
  );
  expect(sounding).toBe(128);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('one-chord loop repeats without HTTP polling and survives view navigation', async ({
  page,
}) => {
  const project = defaultProject('single');
  project.chords = project.chords.slice(0, 1);
  project.bpm = 240;
  await setup(page, project);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/chord-lab')) requests.push(request.url());
  });
  await page.goto('/chord-lab');
  await page.getByRole('button', { name: 'Play selected', exact: true }).click();
  await expect.poll(() => countVoices(page)).toBeGreaterThanOrEqual(9);
  await page.getByRole('link', { name: '01 Piano', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  const before = await countVoices(page);
  await expect.poll(() => countVoices(page)).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play selected', exact: true })).toBeEnabled();
  expect(requests).toEqual([]);
});

test('Stop cancels voices whose start time is still in the future', async ({ page }) => {
  const project = defaultProject();
  project.bpm = 20;
  project.melody.enabled = project.playback.melody = true;
  project.melody.notesPerChord = 4;
  await setup(page, project);
  await page.goto('/chord-lab');
  await page.getByRole('button', { name: 'Play selected' }).click();
  await expect.poll(() => countVoices(page)).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const state = await page.evaluate(() => {
    const a = (window as any).__audit;
    return { now: a.ctx.currentTime, voices: a.voices };
  });
  expect(state.voices.every((voice: any) => voice.stop <= state.now + 0.06)).toBeTruthy();
  expect(
    state.voices
      .filter((voice: any) => voice.start > state.now)
      .every((voice: any) => voice.stop < voice.start),
  ).toBeTruthy();
  const stopped = await countVoices(page);
  await page.waitForTimeout(1700); // The next deferred melody attack would be at 1.5s.
  expect(await countVoices(page)).toBe(stopped);
});

test('native restart rejects an old in-flight edit while the new run keeps playing', async ({
  page,
  request,
}) => {
  await setup(page);
  await page.route('**/api/ports', (route) =>
    route.fulfill({ json: { ports: ['Test'], current: 'Test' } }),
  );
  await page.route('**/api/set-port', (route) =>
    route.fulfill({ json: { ok: true, current: 'Test' } }),
  );
  await page.goto('/chord-lab');
  await page.getByLabel('MIDI OUT', { exact: true }).selectOption('server:Test');
  await page.getByRole('button', { name: 'Play selected', exact: true }).click();
  await expect(page.locator('.transport-status')).toContainText('playing');
  const first = await (await request.get('/api/chord-lab/status')).json();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured!: () => void;
  const received = new Promise<void>((resolve) => {
    captured = resolve;
  });
  let oldRunId: number | undefined;
  await page.route('**/api/chord-lab/progression', async (route) => {
    oldRunId = route.request().postDataJSON().runId;
    captured();
    await gate;
    await route.continue();
  });
  await page.getByLabel('Tempo', { exact: false }).fill('100');
  await page.getByLabel('Tempo', { exact: false }).press('Tab');
  await received;
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play selected', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play selected', exact: true }).click();
  await expect(page.locator('.transport-status')).toContainText('playing');
  const second = await (await request.get('/api/chord-lab/status')).json();
  expect(oldRunId).toBe(first.runId);
  expect(second.runId).not.toBe(first.runId);
  const rejected = page.waitForResponse((response) =>
    response.url().endsWith('/api/chord-lab/progression'),
  );
  release();
  expect((await rejected).status()).toBe(409);
  const heartbeat = await page.waitForResponse((response) =>
    response.url().endsWith('/api/chord-lab/heartbeat'),
  );
  expect(heartbeat.status()).toBe(200);
  expect(heartbeat.request().postDataJSON().runId).toBe(second.runId);
  const status = await (await request.get('/api/chord-lab/status')).json();
  expect(status.playing).toBe(true);
  expect(status.runId).toBe(second.runId);
  expect(status.revision).toBe(0);
  await expect(page.locator('.transport-status')).toContainText('playing');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('Stop during a pending native start releases only that returned run', async ({
  page,
  request,
}) => {
  await setup(page);
  await page.route('**/api/ports', (route) =>
    route.fulfill({ json: { ports: ['Test'], current: 'Test' } }),
  );
  await page.route('**/api/set-port', (route) =>
    route.fulfill({ json: { ok: true, current: 'Test' } }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured!: () => void;
  const received = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route('**/api/chord-lab/start-progression', async (route) => {
    const response = await route.fetch();
    captured();
    await gate;
    await route.fulfill({ response });
  });
  await page.goto('/chord-lab');
  await page.getByLabel('MIDI OUT', { exact: true }).selectOption('server:Test');
  await page.getByRole('button', { name: 'Play selected', exact: true }).click();
  await received;
  const started = await (await request.get('/api/chord-lab/status')).json();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const stop = page.waitForRequest('**/api/chord-lab/stop-progression');
  release();
  expect((await stop).postDataJSON().runId).toBe(started.runId);
  await expect(page.getByRole('button', { name: 'Play selected', exact: true })).toBeEnabled();
  expect((await (await request.get('/api/chord-lab/status')).json()).playing).toBe(false);
});

test('piano supports keyboard, pointer cancellation and MIDI cleanup on navigation', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/piano');
  const key = page.getByRole('button', { name: 'C4, MIDI 60', exact: true });
  await key.focus();
  await page.keyboard.down('Enter');
  await expect.poll(() => countVoices(page)).toBe(1);
  await page.keyboard.up('Enter');
  await expect(key).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('MIDI OUT', { exact: true }).selectOption('browser:output');
  await key.dispatchEvent('pointerdown', { button: 0, pointerId: 9, clientY: 100 });
  await key.dispatchEvent('pointercancel', { pointerId: 9 });
  await expect(key).toHaveAttribute('aria-pressed', 'false');
  await key.dispatchEvent('pointerdown', { button: 0, pointerId: 1, clientY: 100 });
  await page
    .getByRole('link', { name: '02 Chord Lab', exact: true })
    .evaluate((link: HTMLAnchorElement) => link.click());
  const events = await page.evaluate(() => (window as any).__audit.midi.map((m: any) => m.data));
  expect(events.some((e: number[]) => e[0] === 0x92 && e[1] === 60)).toBeTruthy();
  expect(events.some((e: number[]) => e[0] === 0x82 && e[1] === 60)).toBeTruthy();
});

test('releasing while a piano sample loads prevents a late attack', async ({ page }) => {
  await setup(page, defaultProject(), 'piano');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.wav', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/piano');
  const key = page.getByRole('button', { name: 'C4, MIDI 60', exact: true });
  await key.focus();
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  release();
  await expect(page.getByText('Loading piano samples…')).toHaveCount(0);
  expect(await countVoices(page)).toBe(0);
});

test('project identity, seed, undo and file exports are available', async ({ page }) => {
  const project = defaultProject('saved', 123456);
  project.melody.enabled = project.playback.melody = true;
  await setup(page, project);
  await page.goto('/chord-lab');
  await expect(page.getByText(/Seed 123456/)).toBeVisible();
  await page.getByRole('button', { name: 'Add chord', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  for (const [name, extension] of [
    ['Export JSON', '.json'],
    ['Export MIDI', '.mid'],
    ['Export WAV', '.wav'],
  ]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`${extension.replace('.', '\\.')}$`));
    const data = await readFile((await file.path())!);
    if (extension === '.json') {
      const saved = JSON.parse(data.toString());
      expect(saved.melody.seed).toBe(123456);
      expect(saved.chords).toHaveLength(5);
      expect(saved.schemaVersion).toBe(1);
    } else if (extension === '.mid') {
      expect(data.toString('ascii', 0, 4)).toBe('MThd');
      expect(data.readUInt16BE(10)).toBe(3);
    } else {
      expect(data.toString('ascii', 0, 4)).toBe('RIFF');
      expect(data.toString('ascii', 8, 12)).toBe('WAVE');
      expect(data.readUInt32LE(24)).toBe(44100);
      const seconds =
        ((project.chords.reduce((sum, chord) => sum + chord.durationBeats, 0) + 2) * 60) /
          project.bpm +
        0.2;
      expect((data.length - 44) / (44100 * 4)).toBeCloseTo(seconds, 3);
      expect(data.subarray(44).some((byte) => byte !== 0)).toBeTruthy();
    }
  }
  // Remove the setup script's storage reset before reload by checking a new tab in this context.
  const second = await page.context().newPage();
  await second.goto('/chord-lab');
  await expect(second.getByText(/Seed 123456/)).toBeVisible();
  await expect(second.getByRole('article')).toHaveCount(5);
  await second.close();
});

test('custom melody editing, quantization and MIDI recording are reversible', async ({ page }) => {
  const project = defaultProject('record');
  project.bpm = 240;
  project.chords = project.chords.slice(0, 1);
  await setup(page, project);
  await page.goto('/chord-lab');
  await page.getByRole('button', { name: 'Add note at start', exact: true }).click();
  await page.getByLabel('MIDI note', { exact: true }).fill('74');
  await page.getByLabel('MIDI note', { exact: true }).press('Tab');
  await expect(page.getByLabel('MIDI note', { exact: true })).toHaveValue('74');
  await page.getByRole('button', { name: 'Apply quantization', exact: true }).click();
  await page.getByLabel('MIDI IN', { exact: true }).selectOption('input');
  await page.getByRole('button', { name: 'Record MIDI · replace', exact: true }).click();
  await expect(page.locator('.transport-status')).toContainText('playing');
  await page.evaluate(() => {
    (window as any).__input.onmidimessage({
      data: new Uint8Array([0x93, 76, 90]),
      timeStamp: performance.now(),
    });
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    (window as any).__input.onmidimessage({
      data: new Uint8Array([0x83, 76, 0]),
      timeStamp: performance.now(),
    });
  });
  await expect(page.getByText(/1 notes recorded/)).toBeVisible();
  await expect(page.getByRole('button', { name: /E5, beat/ })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /D5, beat/ })).toBeVisible();
});

for (const width of [320, 390, 768, 1024, 1440])
  test(`layout fits ${width}px and menus close with Escape`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/piano', '/chord-lab']) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
    const trigger = page.getByRole('button', { name: 'Choose theme', exact: true });
    await trigger.click();
    await expect(page.getByRole('menu', { name: 'Choose theme' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

test('browser MIDI Stop cancels future messages even without MIDIOutput.clear', async ({
  page,
}) => {
  const project = defaultProject();
  project.bpm = 20;
  project.melody.enabled = project.playback.melody = true;
  project.melody.notesPerChord = 4;
  await setup(page, project, 'none');
  await page.goto('/chord-lab');
  await page.getByLabel('MIDI OUT', { exact: true }).selectOption('browser:output');
  await page.getByRole('button', { name: 'Play selected', exact: true }).click();
  const attacks = () =>
    page.evaluate(
      () => (window as any).__audit.midi.filter((m: any) => (m.data[0] & 0xf0) === 0x90).length,
    );
  await expect.poll(attacks).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const before = await attacks();
  await page.waitForTimeout(1700); // Cross the next melody attack, scheduled at 1.5s.
  expect(await attacks()).toBe(before);
  await page.getByRole('button', { name: 'Panic', exact: true }).click();
  const resets = await page.evaluate(() => (window as any).__audit.midi.map((m: any) => m.data));
  expect(resets).toContainEqual([0xb0, 120, 0]);
  expect(resets).toContainEqual([0xb1, 120, 0]);
  await page.evaluate(() => {
    const w = window as any;
    w.__output.state = 'disconnected';
    w.__access.onstatechange();
  });
  await expect(page.getByRole('button', { name: 'Play selected', exact: true })).toBeDisabled();
});

test('MIDI Thru preserves channels and releases sustain when switched off', async ({ page }) => {
  await setup(page);
  await page.goto('/piano');
  await page.getByLabel('MIDI IN', { exact: true }).selectOption('input');
  await page.getByLabel('MIDI OUT', { exact: true }).selectOption('browser:output');
  await page.getByText('MIDI details', { exact: true }).click();
  await page.getByLabel('MIDI Thru to browser output', { exact: true }).check();
  await page.evaluate(() => {
    const input = (window as any).__input;
    for (const data of [
      [0xb5, 64, 127],
      [0x95, 60, 100],
      [0x85, 60, 0],
    ])
      input.onmidimessage({ data: new Uint8Array(data), timeStamp: performance.now() });
  });
  await page.getByLabel('MIDI Thru to browser output', { exact: true }).uncheck();
  const events = await page.evaluate(() => (window as any).__audit.midi.map((m: any) => m.data));
  expect(events).toContainEqual([0x95, 60, 100]);
  expect(events).toContainEqual([0x85, 60, 0]);
  expect(events).toContainEqual([0xb5, 64, 0]);
});

test('invalid import preserves the project and timing edits cancel recording safely', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/chord-lab');
  await page.getByLabel('Import project file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await expect(page.getByText(/unsupported|schemaVersion/i).last()).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByLabel('MIDI IN', { exact: true }).selectOption('input');
  await page.getByRole('button', { name: 'Record MIDI · replace', exact: true }).click();
  await expect(page.locator('.transport-status')).toContainText('playing');
  await page.getByLabel('Tempo', { exact: false }).fill('100');
  await page.getByLabel('Tempo', { exact: false }).press('Tab');
  await expect(
    page.getByText(/Recording cancelled because the project timing changed/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
});

test('a corrupt current project retains valid library entries', async ({ page }) => {
  await setup(page);
  await page.addInitScript(
    (project) => {
      localStorage.setItem(
        'midi-toolbox-projects-v1',
        JSON.stringify({ current: { broken: true }, library: [project] }),
      );
    },
    defaultProject('library-recovery', 789),
  );
  await page.goto('/chord-lab');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Your valid library projects are still available' }),
  ).toBeVisible();
  await page.getByLabel('Library', { exact: false }).selectOption('library-recovery');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByText(/Seed 789/)).toBeVisible();
});

test('a failed piano sample can be retried without changing the sound preference', async ({
  page,
}) => {
  await setup(page, defaultProject(), 'piano');
  let fail = true;
  await page.route('**/*.wav', async (route) => {
    if (fail) await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
    else await route.continue();
  });
  await page.goto('/piano');
  const retry = page.getByRole('button', { name: 'Retry samples', exact: true });
  await expect(retry).toBeVisible();
  fail = false;
  await retry.click();
  await expect(page.getByText('Loading piano samples…')).toHaveCount(0);
  await expect(retry).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('midi-toolbox-settings')!).soundMode),
  ).toBe('piano');
  await page.getByRole('button', { name: 'C4, MIDI 60', exact: true }).focus();
  await page.keyboard.down('Enter');
  await expect.poll(() => countVoices(page)).toBe(1);
  await page.keyboard.up('Enter');
});
