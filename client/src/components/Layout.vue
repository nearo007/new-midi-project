<template>
  <div class="layout" @click="resumeAudio">
    <header class="header">
      <router-link to="/piano" class="brand">
        <span class="brand-mark">MT</span>
        <span class="brand-copy">
          <strong>MIDI TOOLBOX</strong>
          <small>PERFORMANCE WORKSPACE</small>
        </span>
      </router-link>
      <nav class="nav">
        <router-link to="/piano" class="nav-link"><span>01</span> Piano</router-link>
        <router-link to="/chord-lab" class="nav-link"><span>02</span> Chord Lab</router-link>
      </nav>
      <div class="header-right">
        <button class="sound-toggle" :class="{ on: soundOn }" @click="toggleSound">
          <span class="sound-dot" />
          {{ soundOn ? 'Sound on' : 'Sound off' }}
        </button>
        <PortSelector />
      </div>
    </header>
    <main class="main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import PortSelector from './PortSelector.vue';
import { resumeAudio } from '../api/audio';
import { useSound, setSoundEnabled } from '../api/sound-toggle';

const soundOn = useSound();

function toggleSound() {
  setSoundEnabled(!soundOn.value);
  if (soundOn.value) {
    resumeAudio();
  }
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--canvas);
}

.header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  padding: 1rem clamp(1rem, 3vw, 3rem);
  background: #15181c;
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--text);
  text-decoration: none;
  min-width: max-content;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  background: var(--acid);
  color: #12150f;
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: -0.06em;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.brand-copy strong {
  font-size: 0.75rem;
  letter-spacing: 0.1em;
}

.brand-copy small {
  color: var(--muted);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
}

.nav {
  display: flex;
  gap: 0.35rem;
  margin-right: auto;
}

.nav-link {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 650;
  padding: 0.65rem 0.85rem;
  border: 1px solid transparent;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}

.nav-link span {
  color: #606873;
  font-size: 0.65rem;
  margin-right: 0.5rem;
  letter-spacing: 0.08em;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: var(--text);
  background: var(--surface-raised);
  border-color: var(--line);
}

.nav-link.router-link-active span {
  color: var(--acid);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sound-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  font-size: 0.75rem;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.sound-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #68707b;
}

.sound-toggle.on {
  color: var(--acid);
  border-color: #65772b;
}

.sound-toggle:hover {
  background: var(--surface-raised);
}

.sound-toggle.on:hover {
  background: #242b1a;
}

.sound-toggle.on .sound-dot {
  background: var(--acid);
  box-shadow: 0 0 0 3px rgba(216, 255, 85, 0.12);
}

.main {
  flex: 1;
  width: min(100%, 1500px);
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 4rem) clamp(1rem, 3vw, 3rem);
  overflow-x: auto;
}

@media (max-width: 900px) {
  .header {
    flex-wrap: wrap;
  }

  .nav {
    order: 3;
    width: 100%;
  }

  .header-right {
    margin-left: auto;
  }
}

@media (max-width: 560px) {
  .brand-copy {
    display: none;
  }

  .header-right {
    gap: 0.4rem;
  }
}
</style>
