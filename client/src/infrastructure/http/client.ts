import type { Project } from '@midi-toolbox/core';
export const sessionId = crypto.randomUUID();
export interface PlaybackStatus {
  playing: boolean;
  currentChordId: string | null;
  currentChord: number;
  stepId: number;
  runId: number;
  revision: number;
  owner: string | null;
  error: string | null;
  serverTime: number;
}
export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    signal: options?.signal ?? AbortSignal.timeout(4000),
  });
  const body = await response
    .json()
    .catch(() => ({ error: response.statusText || 'Invalid server response' }));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}
const post = <T>(url: string, body: unknown = {}) =>
  fetchJSON<T>(url, { method: 'POST', body: JSON.stringify(body) });
export const getPorts = () =>
  fetchJSON<{ ports: string[]; current: string; engine?: string; error?: string }>('/ports');
export const setPort = (port: string) => post('/set-port', { port, session: sessionId });
export const clearPort = () => post('/clear-port', { session: sessionId });
export const setServerMidiOutputEnabled = (enabled: boolean) =>
  post('/midi-output', { enabled, session: sessionId });
export const startProgression = (project: Project, revision: number, delayMs: number) =>
  post<PlaybackStatus & { startAt: number }>('/chord-lab/start-progression', {
    project,
    session: sessionId,
    revision,
    delayMs,
  });
export const updateProgression = (project: Project, revision: number, applyAt: number) =>
  fetchJSON('/chord-lab/progression', {
    method: 'PUT',
    body: JSON.stringify({ project, session: sessionId, revision, applyAt }),
  });
export const stopProgression = () => post('/chord-lab/stop-progression', { session: sessionId });
export const getProgressionStatus = () => fetchJSON<PlaybackStatus>('/chord-lab/status');
export const panicServer = () => post('/panic');
export const noteOn = (id: string, note: number, velocity: number, channel: number) =>
  post('/note-on', { session: sessionId, id, note, velocity, channel });
export const noteOff = (id: string) => post('/note-off', { session: sessionId, id });
export const heartbeatNotes = (ids: string[]) =>
  post('/note-heartbeat', { session: sessionId, ids });
export const releaseSession = () => post('/release-session', { session: sessionId });

export const heartbeatPlayback = () =>
  post<PlaybackStatus>('/chord-lab/heartbeat', { session: sessionId });
