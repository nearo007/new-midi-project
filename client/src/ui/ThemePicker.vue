<template>
  <OptionMenu id="theme-menu" label="Choose theme" caption="Theme" v-slot="{ close }"
    ><button
      v-for="option in themes"
      :key="option"
      role="menuitemradio"
      :aria-checked="theme === option"
      @click="
        select(option);
        close();
      "
    >
      {{ option[0].toUpperCase() + option.slice(1) }}
    </button></OptionMenu
  >
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import OptionMenu from './OptionMenu.vue';
import { readStoredSettings, updateStoredSettings } from '../infrastructure/persistence/settings';
const themes = ['default', 'ocean', 'sunset', 'forest', 'violet', 'earth', 'paper'];
const theme = ref('default');
function select(value: string) {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  updateStoredSettings({ theme: value });
}
onMounted(() => {
  let saved = readStoredSettings().theme;
  try {
    saved ??= localStorage.getItem('midi-toolbox-theme') ?? undefined;
    localStorage.removeItem('midi-toolbox-theme');
  } catch {
    /* Preferences remain usable without storage. */
  }
  select(saved && themes.includes(saved) ? saved : 'default');
});
</script>
