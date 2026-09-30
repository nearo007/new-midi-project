<template>
  <div ref="root" class="option-menu">
    <button
      ref="trigger"
      class="menu-trigger"
      :aria-label="label"
      :aria-expanded="openMenu === id"
      :aria-controls="id"
      aria-haspopup="menu"
      @click="toggle"
    >
      {{ caption }}
    </button>
    <div
      v-if="openMenu === id"
      :id="id"
      ref="panel"
      class="menu-panel"
      role="menu"
      :aria-label="label"
      @keydown="keydown"
    >
      <slot :close="close" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { openMenu } from './menu-state';
const props = defineProps<{ id: string; label: string; caption: string }>();
const root = ref<HTMLElement | null>(null),
  panel = ref<HTMLElement | null>(null),
  trigger = ref<HTMLButtonElement | null>(null);
function close() {
  openMenu.value = '';
  trigger.value?.focus();
}
async function toggle() {
  if (openMenu.value === props.id) {
    close();
    return;
  }
  openMenu.value = props.id;
  await nextTick();
  panel.value?.querySelector<HTMLButtonElement>('button')?.focus();
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  const items = [
    ...(panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
  ];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  if (event.key === 'Tab') close();
}
function outside(event: PointerEvent) {
  if (openMenu.value === props.id && !root.value?.contains(event.target as Node))
    openMenu.value = '';
}
onMounted(() => document.addEventListener('pointerdown', outside));
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside);
  if (openMenu.value === props.id) openMenu.value = '';
});
</script>
<style scoped>
.option-menu {
  position: relative;
}
.menu-trigger {
  padding: 0.55rem 0.7rem;
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8rem;
  white-space: nowrap;
}
.menu-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.5rem);
  z-index: 150;
  width: 220px;
  max-width: calc(100vw - 32px);
  padding: 0.5rem;
  background: var(--surface-raised);
  border: 1px solid var(--line-strong);
  box-shadow: 0 8px 24px #0006;
}
.menu-panel :deep(button) {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.7rem;
  border: 0;
  background: none;
  color: var(--text);
  cursor: pointer;
  font-size: 0.8rem;
}
.menu-panel :deep(button[aria-checked='true']) {
  color: var(--acid);
  background: var(--surface-soft);
}
.menu-panel :deep(button:hover) {
  background: var(--surface-soft);
}
</style>
