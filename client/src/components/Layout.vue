<template>
  <div class="layout" @click="resumeAudio">
    <header class="header">
      <nav class="nav">
        <router-link to="/piano" class="nav-link">Piano</router-link>
        <router-link to="/chord-lab" class="nav-link">Chord Lab</router-link>
      </nav>
      <div class="header-right">
        <button class="sound-toggle" :class="{ on: soundOn }" @click="toggleSound">
          {{ soundOn ? '🔊 Sound On' : '🔇 Sound Off' }}
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
}

.header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: rgba(15, 0, 30, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.nav {
  display: flex;
  gap: 1.5rem;
}

.nav-link {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.95rem;
  transition: color 0.2s;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: #fff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sound-toggle {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s, color 0.2s;
}

.sound-toggle.on {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border-color: rgba(168, 85, 247, 0.3);
}

.sound-toggle:hover {
  background: rgba(255, 255, 255, 0.15);
}

.sound-toggle.on:hover {
  background: rgba(168, 85, 247, 0.3);
}

.main {
  flex: 1;
  padding: 1.5rem;
  overflow-x: auto;
}
</style>
