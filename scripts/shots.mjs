// Capture the opening view by day and by night, for before/after comparisons.
//   node scripts/shots.mjs <url> <out dir> <prefix> [extra hash, e.g. #/p/nba]
// Uses the system Edge or Chrome so nothing has to be downloaded.
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const [url = 'http://127.0.0.1:5173/', outDir = 'artifacts/look', prefix = 'shot', hash = ''] = process.argv.slice(2);
const channel = process.env.SHOT_CHANNEL || 'msedge';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel, args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
for (const mode of ['day', 'night']) {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['phone', { width: 412, height: 915 }]
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript((day) => localStorage.setItem('project-city-daytime', day), mode === 'day' ? '1' : '0');
    const page = await context.newPage();
    await page.goto(url + hash);
    await page.waitForFunction(() => document.documentElement.dataset.testReady === '1', null, { timeout: 120_000 });
    await page.waitForTimeout(5500); // let the opening camera move settle
    await page.screenshot({ path: `${outDir}/${prefix}-${mode}-${name}.png` });
    await context.close();
  }
}
await browser.close();
console.log('saved to', outDir);
