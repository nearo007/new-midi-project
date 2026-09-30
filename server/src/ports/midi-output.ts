export interface MidiOutput {
  listPorts(): string[];
  openPort(name: string): Promise<void>;
  closePort(): void;
  sendNoteOn(note: number, velocity: number, channel?: number): void;
  sendNoteOff(note: number, channel?: number): void;
  resetChannel(channel: number): void;
  currentPort(): string;
  status(): { engine: string; error?: string };
}
