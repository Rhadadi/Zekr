import { defineConfig } from '@playwright/test'

// Uses the Chromium that ships with this repo's CI/dev container when CHROMIUM_PATH is set;
// otherwise Playwright's own browser (npx playwright install chromium).
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'allow',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
