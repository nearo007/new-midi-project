<template>
  <section class="mixer" aria-label="Track mixer">
    <div v-for="track in tracks" :key="track.id" class="track">
      <label class="enable"
        ><input
          type="checkbox"
          :checked="track.id === 'harmony' ? project.playback.chords : project.playback.melody"
          @change="toggle(track.id, $event)"
        />
        Play {{ track.name }}</label
      >
      <label
        >Velocity
        {{
          track.id === 'harmony'
            ? project.playback.harmonyVelocity
            : project.playback.melodyVelocity
        }}<input
          type="range"
          min="1"
          max="127"
          :disabled="track.id === 'melody' && project.melodyNotes !== null"
          :aria-describedby="
            track.id === 'melody' && project.melodyNotes !== null
              ? 'individual-velocities'
              : undefined
          "
          :value="
            track.id === 'harmony'
              ? project.playback.harmonyVelocity
              : project.playback.melodyVelocity
          "
          @input="velocity(track.id, $event)"
      /></label>
      <small
        v-if="track.id === 'melody' && project.melodyNotes !== null"
        id="individual-velocities"
      >
        Custom melody uses individual note velocities. Edit a note in the piano roll, or use track
        volume to adjust the whole melody.
      </small>
      <label
        >Volume {{ Math.round(project.tracks[track.id].volume * 100) }}%<input
          type="range"
          min="0"
          max="100"
          :value="project.tracks[track.id].volume * 100"
          @input="volume(track.id, $event)"
      /></label>
      <label
        >MIDI channel<select
          :value="project.tracks[track.id].channel"
          @change="channel(track.id, $event)"
        >
          <option
            v-for="n in 16"
            :key="n"
            :value="n - 1"
            :disabled="
              n - 1 === project.tracks[track.id === 'harmony' ? 'melody' : 'harmony'].channel
            "
          >
            {{ n }}
          </option>
        </select></label
      >
    </div>
  </section>
</template>
<script setup lang="ts">
import { project, editProject } from './editor';
type Track = 'harmony' | 'melody';
const tracks = [
  { id: 'harmony' as const, name: 'chords' },
  { id: 'melody' as const, name: 'melody' },
];
const value = (e: Event) => Number((e.target as HTMLInputElement).value);
function toggle(track: Track, e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  editProject((p) => {
    if (track === 'harmony') p.playback.chords = checked;
    else p.playback.melody = p.melody.enabled = checked;
  });
}
function velocity(track: Track, e: Event) {
  const n = value(e);
  editProject((p) => {
    if (track === 'harmony') p.playback.harmonyVelocity = n;
    else p.playback.melodyVelocity = n;
  }, `velocity:${track}`);
}
function volume(track: Track, e: Event) {
  const n = value(e);
  editProject((p) => {
    p.tracks[track].volume = n / 100;
  }, `volume:${track}`);
}
function channel(track: Track, e: Event) {
  const n = value(e);
  editProject((p) => {
    p.tracks[track].channel = n;
  });
}
</script>
<style scoped>
.mixer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.track {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--line);
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.75rem;
}
.enable {
  flex-direction: row;
  color: var(--text);
  align-items: center;
}
small {
  flex-basis: 100%;
  color: var(--muted);
  line-height: 1.5;
}
input {
  accent-color: var(--acid);
  max-width: 100%;
}
select {
  padding: 0.4rem;
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--line);
}
@media (max-width: 950px) {
  .mixer {
    grid-template-columns: 1fr;
  }
}
</style>
