// Development probe: open the dev server, optionally run a snippet against the
// live world, and save a screenshot. The snippet sees `world` (the CityWorld)
// and `debug` (window.__cityDebug); whatever it returns is printed.
//   node scripts/probe.mjs <url> <out.png> [day|night] [desktop|phone|WxH] [snippet.js | "inline js"] [settle ms]
import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

const [url, out, mode = 'day', size = 'desktop', snippetArg = '', settle = '7000'] = process.argv.slice(2);
const viewport =
  size === 'desktop'
    ? { width: 1440, height: 900 }
    : size === 'phone'
      ? { width: 412, height: 915 }
      : { width: Number(size.split('x')[0]), height: Number(size.split('x')[1]) };
const snippet = snippetArg && existsSync(snippetArg) ? await readFile(snippetArg, 'utf8') : snippetArg;

const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'msedge', args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
await context.addInitScript((day) => localStorage.setItem('project-city-daytime', day), mode === 'day' ? '1' : '0');
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => document.documentElement.dataset.testReady === '1', null, { timeout: 120_000 });
await page.waitForTimeout(Number(settle));
if (snippet) {
  const result = await page.evaluate(
    (code) => new Function('world', 'debug', code)(window.__cityDebug?.world, window.__cityDebug),
    snippet
  );
  if (result !== undefined) console.log(JSON.stringify(result));
  await page.waitForTimeout(1500);
}
await page.screenshot(out.endsWith('.jpg') ? { path: out, type: 'jpeg', quality: 86 } : { path: out });
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
