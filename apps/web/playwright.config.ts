// Browser tests against the production build. Run with `pnpm test:e2e`: in Playwright's Chromium
// (`npx playwright install chromium` once), or in a Chrome of your own with CHROME_PATH set to its executable.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const browser = process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : {};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  // First-run units are guessed from the time zone, so one is pinned (London: kilograms and kilometres) and the
  // results don't depend on the machine running the tests
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', timezoneId: 'Europe/London', ...browser },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/app`,
    timeout: 180000,
    reuseExistingServer: false,
    // A build that talks to no outside service
    env: { SUPABASE_URL: '', SUPABASE_KEY: '', SENTRY_DSN: '', POSTHOG_KEY: '' }
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], ...browser } }
  ]
});
