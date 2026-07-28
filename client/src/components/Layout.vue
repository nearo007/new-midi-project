<template>
  <div class="layout" @click="handleLayoutClick">
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
        <div class="theme-picker" @click.stop>
          <button
            class="theme-button"
            :aria-expanded="themeMenuOpen"
            aria-haspopup="true"
            aria-label="Choose theme"
            @click="themeMenuOpen = !themeMenuOpen"
          >
            <span class="theme-button-swatch" aria-hidden="true">
              <i :style="{ background: activeTheme.accent }" />
              <i :style="{ background: activeTheme.secondary }" />
            </span>
            <span class="hamburger" aria-hidden="true"><i /><i /><i /></span>
            <span>Theme</span>
          </button>
          <div v-if="themeMenuOpen" class="theme-menu" role="menu">
            <p class="theme-menu-title">APPEARANCE</p>
            <button
              v-for="option in THEME_OPTIONS"
              :key="option.id"
              class="theme-option"
              :class="{ active: theme === option.id }"
              role="menuitemradio"
              :aria-checked="theme === option.id"
              @click="selectTheme(option.id)"
            >
              <span class="theme-swatch" aria-hidden="true">
                <i :style="{ background: option.accent }" />
                <i :style="{ background: option.secondary }" />
              </span>
              <span class="theme-option-copy">
                <strong>{{ option.label }}</strong>
                <small>{{ option.description }}</small>
              </span>
              <span v-if="theme === option.id" class="theme-check" aria-hidden="true">✓</span>
            </button>
          </div>
        </div>
      </div>
    </header>
    <main class="main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import PortSelector from './PortSelector.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { resumeAudio } from '../api/audio';
import { useSound, setSoundEnabled } from '../api/sound-toggle';

const soundOn = useSound();
const themeMenuOpen = ref(false);
const theme = ref('default');

const THEME_OPTIONS = [
  { id: 'default', label: 'Default', description: 'Acid / coral', accent: '#d8ff55', secondary: '#ff765f' },
  { id: 'ocean', label: 'Ocean', description: 'Cyan / amber', accent: '#54e8ff', secondary: '#ffc46b' },
  { id: 'sunset', label: 'Sunset', description: 'Gold / pink', accent: '#ffd166', secondary: '#ff5d8f' },
  { id: 'forest', label: 'Forest', description: 'Mint / peach', accent: '#70f0c4', secondary: '#ff9c6e' },
  { id: 'violet', label: 'Violet', description: 'Lavender / pink', accent: '#caa2ff', secondary: '#78ffae' },
  { id: 'earth', label: 'Earth', description: 'Grass / dirt', accent: '#67c23a', secondary: '#9a6239' },
  { id: 'paper', label: 'Paper', description: 'Gold / terracotta', accent: '#e6b85c', secondary: '#e06f5f' },
] as const;

type ThemeId = (typeof THEME_OPTIONS)[number]['id'];
const activeTheme = computed(() => THEME_OPTIONS.find((option) => option.id === theme.value) ?? THEME_OPTIONS[0]);

function applyTheme(value: ThemeId) {
  document.documentElement.dataset.theme = value;
  localStorage.setItem('midi-toolbox-theme', value);
}

function selectTheme(value: ThemeId) {
  theme.value = value;
  applyTheme(value);
  themeMenuOpen.value = false;
}

function handleLayoutClick() {
  themeMenuOpen.value = false;
  resumeAudio();
}

function toggleSound() {
  setSoundEnabled(!soundOn.value);
  if (soundOn.value) {
    resumeAudio();
  }
}

onMounted(() => {
  const savedTheme = localStorage.getItem('midi-toolbox-theme') as ThemeId | null;
  const isTheme = savedTheme && THEME_OPTIONS.some((option) => option.id === savedTheme);
  const initialTheme = isTheme ? savedTheme : 'default';
  theme.value = initialTheme;
  applyTheme(initialTheme);
});

onUnmounted(() => {
  delete document.documentElement.dataset.theme;
});
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
  background: var(--header);
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
  color: var(--on-accent);
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
  color: var(--muted);
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
  background: var(--muted);
}

.sound-toggle.on {
  color: var(--acid);
  border-color: var(--accent-line);
}

.sound-toggle:hover {
  background: var(--surface-raised);
}

.sound-toggle.on:hover {
  background: var(--accent-soft);
}

.sound-toggle.on .sound-dot {
  background: var(--acid);
  box-shadow: 0 0 0 3px rgba(216, 255, 85, 0.12);
}

.theme-picker {
  position: relative;
}

.theme-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.7rem;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.75rem;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.theme-button:hover,
.theme-button[aria-expanded='true'] {
  color: var(--text);
  background: var(--surface-raised);
  border-color: var(--line-strong);
}

.hamburger {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 0.85rem;
}

.hamburger i {
  display: block;
  width: 100%;
  height: 1px;
  background: currentColor;
}

.theme-button-swatch {
  display: flex;
  width: 0.8rem;
  height: 0.8rem;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
}

.theme-button-swatch i {
  flex: 1;
}

.theme-menu {
  position: absolute;
  top: calc(100% + 0.65rem);
  right: 0;
  z-index: 120;
  width: 220px;
  padding: 0.55rem;
  background: var(--surface-raised);
  border: 1px solid var(--line-strong);
  border-radius: 5px;
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.25);
}

.theme-menu-title {
  padding: 0.35rem 0.5rem 0.5rem;
  color: var(--muted);
  font-size: 0.58rem;
  font-weight: 850;
  letter-spacing: 0.14em;
}

.theme-option {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0.65rem;
  padding: 0.55rem 0.5rem;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  text-align: left;
}

.theme-option:hover,
.theme-option.active {
  background: var(--surface-soft);
  border-color: var(--line);
}

.theme-swatch {
  display: flex;
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
}

.theme-swatch i {
  flex: 1;
}

.theme-option-copy {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.theme-option-copy strong {
  font-size: 0.72rem;
}

.theme-option-copy small {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.58rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-check {
  margin-left: auto;
  color: var(--acid);
  font-weight: 900;
}

.main {
  flex: 1;
  width: min(100%, 1700px);
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
