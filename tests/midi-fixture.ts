export function fakeMidi() {
  const events: number[][] = [];
  let current = 'Test';
  return {
    events,
    listPorts: () => ['Test'],
    openPort: async (name: string) => {
      current = name;
    },
    closePort: () => {
      current = '';
    },
    currentPort: () => current,
    status: () => ({ engine: 'test' }),
    sendNoteOn: (note: number, velocity: number, channel = 0) => {
      events.push([0x90 + channel, note, velocity]);
    },
    sendNoteOff: (note: number, channel = 0) => {
      events.push([0x80 + channel, note, 0]);
    },
    resetChannel: (channel: number) => {
      for (const controller of [64, 123, 120]) events.push([0xb0 + channel, controller, 0]);
    },
  };
}
