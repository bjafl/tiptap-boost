import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '..',
  testMatch: '**/e2e/**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3111',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'pnpm vite --port 3111',
    port: 3111,
    reuseExistingServer: !process.env.CI,
    cwd: '.',
  },
})
