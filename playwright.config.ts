import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 20000,
  use: { baseURL: 'http://127.0.0.1:3107', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'node server/dist/index.js',
    url: 'http://127.0.0.1:3107/api/health',
    env: { PORT: '3107', HOST: '127.0.0.1', MIDI_BACKEND: 'none' },
    reuseExistingServer: false,
  },
});
