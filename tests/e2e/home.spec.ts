import { test, expect } from '@playwright/test';
import fs from 'fs/promises';

const SCREENSHOT_PATH = 'artifacts/dev-home.png';

test('home screen renders and captures screenshot', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.dataset.testReady === '1', null, {
    timeout: 60000
  });

  await expect(page.locator('canvas[data-test="world-canvas"]').first()).toBeVisible();
  await expect(page.locator('[data-test="hud"]').first()).toBeVisible();
  await expect(page).toHaveTitle(/Ryan/i);

  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  console.log(`Saved screenshot to ${SCREENSHOT_PATH}`);
});
