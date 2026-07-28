import JZZ from 'jzz';
import type { MidiOutput } from './midi-output.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JzzEngine = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JzzPort = any;

export class JzzAdapter implements MidiOutput {
  private engine: JzzEngine | null = null;
  private port: JzzPort | null = null;
  private portName = '';
  private portNames: string[] = [];
  private engineName = 'none';
  private initializationError = '';

  async init(): Promise<void> {
    try {
      this.engine = await JZZ();
      const info = this.engine.info();
      this.engineName = info.engine ?? 'none';
      if (this.engineName === 'none') {
        this.engine = null;
        this.initializationError = process.platform === 'linux'
          ? 'Native MIDI is unavailable. Install ALSA (libasound2) or use the browser MIDI output.'
          : 'Native MIDI is unavailable. Use a browser MIDI output or install the platform MIDI backend.';
        return;
      }
      this.refreshPorts();
    } catch (err) {
      this.engine = null;
      this.initializationError = err instanceof Error ? err.message : String(err);
      console.warn(`JZZ MIDI engine not available: ${this.initializationError}`);
    }
  }

  status(): { engine: string; error?: string } {
    return { engine: this.engineName, ...(this.initializationError ? { error: this.initializationError } : {}) };
  }

  private refreshPorts(): void {
    if (!this.engine) return;
    const info = this.engine.info();
    this.portNames = (info.outputs ?? []).map((o: { name: string }) => o.name);
  }

  listPorts(): string[] {
    if (this.engine) this.refreshPorts();
    return [...this.portNames];
  }

  async openPort(name: string): Promise<void> {
    if (!this.engine) throw new Error('JZZ engine not initialized');
    this.refreshPorts();
    const index = this.portNames.indexOf(name);
    if (index === -1) {
      throw new Error(`Port "${name}" not found. Available: ${this.portNames.join(', ')}`);
    }
    this.port = await this.engine.openMidiOut(name);
    this.portName = name;
  }

  closePort(): void {
    if (this.port) {
      this.port.close();
      this.port = null;
    }
    this.portName = '';
  }

  sendNoteOn(note: number, velocity: number): void {
    if (!this.port) return;
    this.port.noteOn(0, note, velocity);
  }

  sendNoteOff(note: number): void {
    if (!this.port) return;
    this.port.noteOff(0, note);
  }

  currentPort(): string {
    return this.portName;
  }

  async autoSelectPort(): Promise<void> {
    const ports = this.listPorts();
    if (ports.length === 0) {
      throw new Error('No available MIDI ports.');
    }
    const preferred = ports.find(
      (p) => p.toLowerCase().includes('midi') || p.toLowerCase().includes('virtual')
    );
    await this.openPort(preferred ?? ports[0]);
  }
}
