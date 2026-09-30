<template>
  <section class="transport-bar" aria-label="Project playback">
    <div class="transport-main">
      <span class="transport-status" role="status"
        >{{ transportState === 'idle' ? 'Ready' : transportState
        }}<small>{{ project.name }}</small></span
      >
      <button
        class="play"
        :disabled="isRunning || isBusy || Boolean(playUnavailable)"
        @click="startTransport()"
      >
        Play selected
      </button>
      <button :disabled="!isRunning" @click="stopTransport()">Stop</button
      ><button class="panic" @click="panic">Panic</button>
      <label class="tempo"
        >Tempo<input type="number" min="20" max="240" step="1" :value="project.bpm" @change="bpm" />
        BPM</label
      >
      <button @click="tap">Tap tempo</button>
      <label class="check"
        ><input
          type="checkbox"
          :checked="project.metronome"
          @change="toggle('metronome', $event)"
        />
        Metronome</label
      >
      <label class="check"
        ><input type="checkbox" :checked="project.countIn" @change="toggle('countIn', $event)" />
        Count in</label
      >
    </div>
    <p v-if="transportError" role="alert">{{ transportError }}</p>
    <p v-else-if="playUnavailable">{{ playUnavailable }}</p>
  </section>
</template>
<script setup lang="ts">
import { project, editProject } from '../features/chord-lab/editor';
import {
  transportState,
  transportError,
  isRunning,
  isBusy,
  playUnavailable,
  startTransport,
  stopTransport,
  panic,
} from './transport';
let taps: number[] = [];
function bpm(e: Event) {
  const value = Number((e.target as HTMLInputElement).value);
  editProject((p) => {
    p.bpm = value;
  }, 'bpm');
}
function toggle(field: 'metronome' | 'countIn', e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  editProject((p) => {
    p[field] = checked;
  });
}
function tap() {
  const now = performance.now();
  if (taps.length && now - taps.at(-1)! > 3000) taps = [];
  taps.push(now);
  taps = taps.slice(-5);
  if (taps.length > 1) {
    const value = Math.round((60000 * (taps.length - 1)) / (now - taps[0]));
    editProject((p) => {
      p.bpm = Math.min(240, Math.max(20, value));
    }, 'tap');
  }
}
</script>
<style scoped>
.transport-bar {
  position: sticky;
  top: 0;
  z-index: 90;
  display: grid;
  gap: 0.6rem;
  padding: 0.8rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  box-shadow: 0 4px 14px #0002;
}
.transport-main {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  max-width: 1600px;
  width: 100%;
  margin: auto;
}
.transport-status {
  color: var(--acid);
  font-size: 0.8rem;
  text-transform: capitalize;
  min-width: 5rem;
}
.transport-status small {
  display: block;
  color: var(--muted);
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.65rem;
}
button,
input {
  padding: 0.45rem 0.6rem;
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  font-size: 0.75rem;
}
button {
  cursor: pointer;
}
.play {
  background: var(--coral);
  color: var(--on-accent);
  font-weight: 700;
}
.panic {
  color: var(--coral);
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tempo,
.check {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  font-size: 0.75rem;
  color: var(--muted);
}
.tempo input {
  width: 4.8rem;
}
.check input {
  accent-color: var(--acid);
}
p {
  color: var(--coral);
  font-size: 0.8rem;
  max-width: 1600px;
  width: 100%;
  margin: auto;
}
@media (max-width: 560px) {
  .transport-bar {
    position: static;
  }
  .transport-status {
    width: 100%;
  }
}
</style>
