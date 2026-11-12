// Step through every project's close-up and save one screenshot each, so all
// forty can be checked side by side instead of only the big five.
//   node scripts/sweep.mjs <url> <out dir> [day|night] [desktop|phone]
import { chromium } from 'playwright';
import { mkdir, readFile } from 'fs/promises';

const [url = 'http://127.0.0.1:5173/', outDir = 'artifacts/sweep', mode = 'day', size = 'desktop'] = process.argv.slice(2);
const viewport = size === 'phone' ? { width: 412, height: 915 } : { width: 1200, height: 750 };
const data = JSON.parse(await readFile(new URL('../content/projects.json', import.meta.url), 'utf8'));
const bySize = [...data.projects].sort((a, b) => b.commits - a.commits);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'msedge', args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
await context.addInitScript((day) => localStorage.setItem('project-city-daytime', day), mode === 'day' ? '1' : '0');
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => document.documentElement.dataset.testReady === '1', null, { timeout: 120_000 });
await page.waitForTimeout(6500);
for (const [i, project] of bySize.entries()) {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(2300); // the camera move takes 1.4 s
  const n = String(i + 1).padStart(2, '0');
  await page.screenshot({ path: `${outDir}/${mode}-${size}-${n}-${project.id}.png` });
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
console.log(`saved ${bySize.length} close-ups to ${outDir}`);
