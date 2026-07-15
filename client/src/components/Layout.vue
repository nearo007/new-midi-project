<template>
  <div class="layout" @click="resumeAudio">
    <header class="header">
      <nav class="nav">
        <router-link to="/piano" class="nav-link">Piano</router-link>
        <router-link to="/chord-lab" class="nav-link">Chord Lab</router-link>
      </nav>
      <PortSelector />
    </header>
    <main class="main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import PortSelector from './PortSelector.vue';
import { resumeAudio } from '../api/audio';
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

.main {
  flex: 1;
  padding: 1.5rem;
  overflow-x: auto;
}
</style>
