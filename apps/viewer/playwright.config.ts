import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3456',
    storageState: 'tests/fixtures/auth-state.json',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    command: 'node build/index.js',
    url: 'http://localhost:3456',
    reuseExistingServer: true,
    env: {
      PORT: '3456',
      DONNA_VAULT_PATH: '/home/ubuntu/.donna/vault/.okf',
    },
  },
});
