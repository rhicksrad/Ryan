import { defineConfig, devices } from '@playwright/test';

// Headless machines have no GPU; SwiftShader gives WebGL a software fallback so
// the real scene (not the no-WebGL fallback) is what gets tested.
const launchOptions = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  // Point at an already-installed Chromium instead of downloading one.
  executablePath: process.env.PW_CHROMIUM || undefined
};

// CI on a shared PC picks a free port; everywhere else the preview default is fine.
const port = Number(process.env.E2E_PORT) || 4173;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120 * 1000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions
  },
  // Test the production bundle, the same files that get deployed.
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } }
  ]
});
