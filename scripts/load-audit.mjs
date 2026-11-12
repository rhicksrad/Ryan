// Cold-load audit of the built site: what is transferred, and how long until the
// town is on screen, on a fast line and on a throttled one.
//   npm run build && npx vite preview --port 4319   (in another shell)
//   node scripts/load-audit.mjs http://127.0.0.1:4319/
import { chromium } from 'playwright';

const [url = 'http://127.0.0.1:4173/'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'msedge', args: ['--ignore-gpu-blocklist', '--enable-gpu'] });

const profiles = {
  'fast line': null,
  // Chrome DevTools' "Fast 3G" preset: 1.6 Mbit/s down, 750 kbit/s up, 150 ms latency.
  'fast 3G': { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 }
};

for (const [name, throttle] of Object.entries(profiles)) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) await cdp.send('Network.emulateNetworkConditions', throttle);

  const sizes = new Map();
  cdp.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));
  const kinds = new Map();
  cdp.on('Network.responseReceived', (e) => kinds.set(e.requestId, e.type));

  // Long tasks: how long the page was frozen while loading.
  await page.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__long.push(Math.round(entry.duration));
    }).observe({ type: 'longtask', buffered: true });
  });
  const start = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  const loaderUp = await page
    .waitForSelector('#loader', { timeout: 60_000 })
    .then(() => Date.now() - start)
    .catch(() => null);
  await page.waitForFunction(() => document.documentElement.dataset.testReady === '1', null, { timeout: 180_000 });
  const ready = Date.now() - start;
  const marks = await page.evaluate(() =>
    Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)]))
  );
  await page.waitForTimeout(4000); // posters, sky, and emblems arrive after the first frame

  const byKind = {};
  let total = 0;
  for (const [id, bytes] of sizes) {
    const kind = kinds.get(id) ?? 'Other';
    byKind[kind] = (byKind[kind] ?? 0) + bytes;
    total += bytes;
  }
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(
    `${name}: loader visible ${loaderUp} ms, town on screen ${ready} ms, ${sizes.size} requests, ${kb(total)} transferred (` +
      Object.entries(byKind)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${kb(v)}`)
        .join(', ') +
      ')'
  );
  const long = await page.evaluate(() => window.__long);
  console.log(`  longest freeze ${Math.max(0, ...long)} ms, frozen ${long.reduce((x, y) => x + y, 0)} ms in total`);
  console.log(
    `  shaders compiling ${marks['city-first-render'] - marks['city-compile-start']} ms, first draw ${marks['city-first-frame'] - marks['city-first-render']} ms`
  );
  console.log(
    `  script running at ${marks['city-build-start']} ms, town built in ${marks['city-build-end'] - marks['city-build-start']} ms, ` +
      `first frame ${marks['city-first-frame'] - marks['city-build-end']} ms after that`
  );
  await context.close();
}
await browser.close();
