<template>
  <OptionMenu
    id="sound-menu"
    label="Choose sound"
    :caption="mode === '8bit' ? '8-bit' : mode === 'piano' ? 'Piano' : 'No sound'"
    v-slot="{ close }"
    ><button
      v-for="option in modes"
      :key="option.id"
      role="menuitemradio"
      :aria-checked="mode === option.id"
      @click="
        choose(option.id);
        close();
      "
    >
      {{ option.label }}</button
    ><button
      role="menuitemcheckbox"
      :aria-checked="reverbEnabled"
      @click="setReverbEnabled(!reverbEnabled)"
    >
      Reverb {{ reverbEnabled ? 'on' : 'off' }}
    </button></OptionMenu
  >
</template>
<script setup lang="ts">
import OptionMenu from './OptionMenu.vue';
import { useSoundMode, setSoundMode } from '../audio/sound-mode';
import { resumeAudio, reverbEnabled, setReverbEnabled } from '../audio/engine';
import type { SoundMode } from '../infrastructure/persistence/settings';
const mode = useSoundMode(),
  modes: { id: SoundMode; label: string }[] = [
    { id: 'piano', label: 'Piano · sampled' },
    { id: '8bit', label: '8-bit · triangle' },
    { id: 'none', label: 'None · mute local audio' },
  ];
function choose(value: SoundMode) {
  setSoundMode(value);
  void resumeAudio();
}
</script>
