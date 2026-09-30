<template>
  <div class="layout">
    <a href="#main-content" class="skip-link">Skip to workspace</a>
    <header class="header">
      <router-link to="/piano" class="brand"
        ><span class="brand-mark">MT</span
        ><span>MIDI TOOLBOX<small>PERFORMANCE WORKSPACE</small></span></router-link
      >
      <nav class="nav" aria-label="Workspace">
        <router-link to="/piano">01 Piano</router-link
        ><router-link to="/chord-lab">02 Chord Lab</router-link>
      </nav>
      <div class="header-right"><SoundPicker /><ThemePicker /></div>
      <PortSelector />
    </header>
    <TransportBar />
    <div
      class="system-status"
      v-if="loadingSamples || audioError || storageError || performanceError || midiError"
    >
      <span v-if="loadingSamples" role="status">Loading piano samples…</span>
      <p v-if="audioError" role="alert">
        {{ audioError }} <button @click="preloadPianoSamples">Retry samples</button>
      </p>
      <p v-if="storageError" role="alert">{{ storageError }}</p>
      <p v-if="performanceError" role="alert">{{ performanceError }}</p>
      <p v-if="midiError" role="alert">{{ midiError }}</p>
    </div>
    <main id="main-content" class="main" tabindex="-1"><slot /></main>
  </div>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import PortSelector from '../midi/PortSelector.vue';
import ThemePicker from './ThemePicker.vue';
import SoundPicker from './SoundPicker.vue';
import TransportBar from '../playback/TransportBar.vue';
import { resumeAudio, audioError, loadingSamples, preloadPianoSamples } from '../audio/engine';
import { storageError } from '../infrastructure/persistence/settings';
import { midiError } from '../midi/devices';
import { performanceError } from '../features/piano/performance';
function unlock() {
  void resumeAudio().catch(() => {});
}
onMounted(() => {
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
});
onUnmounted(() => {
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
});
</script>
<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--canvas);
  min-width: 0;
}
.header {
  display: flex;
  align-items: center;
  gap: 1rem 1.5rem;
  flex-wrap: wrap;
  padding: 1rem clamp(1rem, 3vw, 3rem);
  background: var(--header);
  border-bottom: 1px solid var(--line);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--text);
  text-decoration: none;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.brand small {
  display: block;
  font-size: 0.52rem;
  color: var(--muted);
  margin-top: 0.2rem;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  background: var(--acid);
  color: var(--on-accent);
  font-size: 0.8rem;
}
.nav {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.nav a {
  padding: 0.7rem;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.82rem;
  border: 1px solid transparent;
}
.nav a.router-link-active {
  color: var(--acid);
  background: var(--surface-raised);
  border-color: var(--line);
}
.header-right {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
.main {
  flex: 1;
  width: min(100%, 1700px);
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 3rem);
  min-width: 0;
  outline: none;
}
.system-status {
  padding: 0.7rem 1rem;
  color: var(--coral);
  font-size: 0.8rem;
  display: grid;
  gap: 0.5rem;
}
.system-status button {
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 0.4rem;
  cursor: pointer;
}
.skip-link {
  position: absolute;
  left: 1rem;
  top: -5rem;
  z-index: 200;
  color: var(--text);
  background: var(--surface);
  padding: 1rem;
}
.skip-link:focus {
  top: 1rem;
}
@media (max-width: 600px) {
  .header {
    gap: 0.6rem;
  }
  .brand {
    flex: 1;
  }
  .nav {
    order: 3;
    width: 100%;
  }
  .header-right {
    margin-left: 0;
  }
}
</style>
