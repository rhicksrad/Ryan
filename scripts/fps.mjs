// Measure real frame rate in a visible browser window on this machine's GPU.
//   node scripts/fps.mjs <url> [day,night] ["inline js run against `world` first"]
import { chromium } from 'playwright';

const [url = 'http://127.0.0.1:5173/', modes = 'day,night', snippet = ''] = process.argv.slice(2);
const channel = process.env.SHOT_CHANNEL || 'msedge';
const browser = await chromium.launch({ channel, headless: false, args: ['--window-size=1500,1000'] });

for (const mode of modes.split(',')) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((day) => localStorage.setItem('project-city-daytime', day), mode === 'day' ? '1' : '0');
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  await page.waitForFunction(() => document.documentElement.dataset.testReady === '1', null, { timeout: 120_000 });
  await page.waitForTimeout(5000);
  if (snippet) {
    await page.evaluate((code) => new Function('world', code)(window.__cityDebug?.world), snippet);
    await page.waitForTimeout(1000);
  }
  const measure = () => page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const start = last;
        const tick = (now) => {
          times.push(now - last);
          last = now;
          if (now - start < 6000) requestAnimationFrame(tick);
          else {
            times.sort((a, b) => a - b);
            const gl = document.createElement('canvas').getContext('webgl2');
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            const canvas = document.querySelector('canvas[data-test="world-canvas"]');
            resolve({
              fps: Math.round((times.length / (now - start)) * 1000),
              p95FrameMs: Math.round(times[Math.floor(times.length * 0.95)]),
              gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
              drawBuffer: `${canvas.width}x${canvas.height}`,
              quality: window.__cityDebug ? window.__cityDebug.quality() : null,
              render: window.__cityDebug ? window.__cityDebug.renderInfo() : null
            });
          }
        };
        requestAnimationFrame(tick);
      })
  );
  // A window that opens behind another is throttled to about one frame a second
  // by the browser. That is not a measurement, so bring it forward and go again.
  let result = await measure();
  for (let attempt = 0; attempt < 2 && result.fps < 5; attempt += 1) {
    await page.bringToFront();
    await page.waitForTimeout(1500);
    result = await measure();
  }
  console.log(mode, JSON.stringify(result));
  await context.close();
}
await browser.close();
