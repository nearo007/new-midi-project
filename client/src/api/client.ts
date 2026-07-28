import type { MelodySettings } from './melody';

export interface PlaybackSettings {
  chords: boolean;
  melody: boolean;
}

const BASE = '/api';

async function fetchJSON<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function playNote(keyNum: number): Promise<void> {
  await fetchJSON('/play', {
    method: 'POST',
    body: JSON.stringify({ keyNum }),
  });
}

export async function getPorts(): Promise<{ ports: string[]; current: string }> {
  return fetchJSON('/ports');
}

export async function setPort(port: string): Promise<void> {
  await fetchJSON('/set-port', {
    method: 'POST',
    body: JSON.stringify({ port }),
  });
}

export type ChordTuple = [number, number, number, number, boolean];

export async function startProgression(
  chords: ChordTuple[],
  bpm?: number,
  melody?: MelodySettings,
  playback?: PlaybackSettings,
): Promise<void> {
  await fetchJSON('/chord-lab/start-progression', {
    method: 'POST',
    body: JSON.stringify({ chords, bpm, melody, playback }),
  });
}

export async function stopProgression(): Promise<void> {
  await fetchJSON('/chord-lab/stop-progression', {
    method: 'POST',
  });
}

export async function updateProgression(
  chords: ChordTuple[],
  melody?: MelodySettings,
  playback?: PlaybackSettings,
  bpm?: number,
): Promise<void> {
  await fetchJSON('/chord-lab/progression', {
    method: 'PUT',
    body: JSON.stringify({ chords, bpm, melody, playback }),
  });
}

export async function getProgressionStatus(): Promise<{ playing: boolean; currentChord: number }> {
  return fetchJSON('/chord-lab/status');
}
