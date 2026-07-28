<template>
  <div class="piano-view">
    <section class="page-heading">
      <div>
        <p class="eyebrow">01 / PERFORMANCE</p>
        <h1 class="title">Playable <em>space.</em></h1>
        <p class="subtitle">A full-range MIDI surface for finding the note that feels right.</p>
      </div>
      <div class="range-card">
        <span class="range-label">RANGE</span>
        <strong>A0 <span>—</span> C8</strong>
        <small><i /> 88 KEYS ONLINE</small>
      </div>
    </section>

    <section class="piano-panel">
      <div class="panel-heading">
        <div>
          <span class="panel-kicker">KEYBOARD / 88</span>
          <h2>Touch a note</h2>
        </div>
        <span class="panel-hint">Click, hold, and play.</span>
      </div>
      <PianoKeyboard />
      <div class="panel-footer">
        <span>LOW <b>A0</b></span>
        <span>HIGH <b>C8</b></span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import PianoKeyboard from '../components/PianoKeyboard.vue';
</script>

<style scoped>
.piano-view {
  display: flex;
  flex-direction: column;
  gap: clamp(2rem, 5vw, 4.5rem);
  width: 100%;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 2rem;
  width: 100%;
}

.eyebrow,
.panel-kicker,
.range-label {
  color: var(--acid);
  font-size: 0.65rem;
  font-weight: 850;
  letter-spacing: 0.16em;
}

.title {
  color: var(--text);
  font-size: clamp(2.7rem, 7vw, 6.5rem);
  line-height: 0.95;
  letter-spacing: -0.08em;
  margin: 0.65rem 0 1rem;
}

.title em {
  color: var(--acid);
  font-style: normal;
}

.subtitle {
  color: var(--muted);
  font-size: 0.95rem;
  max-width: 28rem;
  line-height: 1.6;
}

.range-card {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 10rem;
  padding: 1rem 1.1rem;
  border-left: 1px solid var(--line-strong);
}

.range-card strong {
  font-size: 1.6rem;
  letter-spacing: -0.05em;
}

.range-card strong span {
  color: var(--muted);
  font-weight: 400;
}

.range-card small,
.panel-footer {
  color: var(--muted);
  font-size: 0.6rem;
  font-weight: 750;
  letter-spacing: 0.13em;
}

.range-card i {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  margin-right: 0.35rem;
  border-radius: 50%;
  background: var(--acid);
}

.piano-panel {
  width: 100%;
  padding: clamp(1rem, 2.5vw, 2rem);
  background: var(--surface);
  border: 1px solid var(--line);
  border-top: 3px solid var(--acid);
  box-shadow: 12px 12px 0 #090a0c;
}

.panel-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.2rem;
}

.panel-heading h2 {
  margin-top: 0.4rem;
  font-size: 1.35rem;
  letter-spacing: -0.04em;
}

.panel-hint {
  color: var(--muted);
  font-size: 0.75rem;
}

.panel-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 0.85rem;
}

.panel-footer b {
  color: var(--text);
  margin-left: 0.35rem;
}

@media (max-width: 620px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .range-card {
    border-left: 0;
    border-top: 1px solid var(--line-strong);
    width: 100%;
    padding: 1rem 0 0;
  }

  .panel-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
