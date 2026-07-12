import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4300',
    headless: true,
  },
  webServer: {
    command: 'npm run build && PORT=4300 JWT_SECRET=playwright-secret npm start',
    url: 'http://127.0.0.1:4300/api/health',
    reuseExistingServer: false,
    timeout: 180000,
  },
});
