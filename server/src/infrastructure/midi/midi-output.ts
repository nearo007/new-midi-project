export interface MidiOutput {
  listPorts(): string[];
  openPort(name: string): void;
  closePort(): void;
  sendNoteOn(note: number, velocity: number): void;
  sendNoteOff(note: number): void;
  currentPort(): string;
}
