import type { Clock } from '@midi-toolbox/core';
export class FakeClock implements Clock {
  time = 0;
  private serial = 0;
  tasks = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  setTimer = (callback: () => void, delay: number) => {
    const id = ++this.serial;
    this.tasks.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimer = (id: unknown) => {
    this.tasks.delete(id as number);
  };
  advance(ms: number) {
    const end = this.time + ms;
    let budget = 10000;
    while (budget--) {
      const entry = [...this.tasks]
        .filter(([, task]) => task.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      this.time = entry[1].at;
      this.tasks.delete(entry[0]);
      entry[1].callback();
    }
    if (budget <= 0) throw new Error('Timer loop did not yield');
    this.time = end;
  }
}
