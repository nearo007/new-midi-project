import type { MidiOutput } from '../../ports/midi-output.js';
/** Allows local-audio/browser-MIDI deployments and CI to run without native bindings. */
export class DisabledMidiAdapter implements MidiOutput {
  listPorts(): string[] {
    return [];
  }
  async openPort(): Promise<void> {
    throw new Error('Native MIDI is disabled by MIDI_BACKEND=none');
  }
  closePort(): void {}
  sendNoteOn(): void {}
  sendNoteOff(): void {}
  resetChannel(): void {}
  currentPort(): string {
    return '';
  }
  status() {
    return {
      engine: 'none',
      error: 'Native MIDI is disabled. Browser MIDI and local audio remain available.',
    };
  }
}
