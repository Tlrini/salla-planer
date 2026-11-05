import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 3100;
// Fresh database for every run.
const dataDir = path.join(os.tmpdir(), `salla-e2e-${Date.now()}`);

export const E2E_ADMIN = { user: 'e2e-admin', password: 'e2e-password-123' };

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the Microsoft Edge already installed on Windows (no browser download needed).
    channel: process.env.PW_CHANNEL ?? 'msedge',
    acceptDownloads: true,
    viewport: { width: 1366, height: 900 },
  },
  webServer: {
    command: 'node server/dist/index.js --production',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SALLA_PORT: String(PORT),
      DATA_DIR: dataDir,
      ADMIN_USER: E2E_ADMIN.user,
      ADMIN_PASSWORD: E2E_ADMIN.password,
    },
  },
});
