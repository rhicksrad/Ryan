import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';

const DIST_DIR = 'dist';
const MAX_FILE_KB = 400;
// Everything a cold visit can fetch: the page, its code, the textures, and the
// posters on tower billboards. Panel art is the one thing held apart from this.
const MAX_TOTAL_KB = 2000;
// Panel art: the poster of every project that is not a tower. It is only
// requested when somebody opens that project's panel, so it never adds to a cold
// visit. It gets its own caps, per poster and in total.
const MAX_POSTER_KB = 80;
const MAX_PANEL_ART_KB = 2400;
// Same line as tierOf() in src/data.ts: towers carry billboards.
const TOWER_COMMITS = 150;

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function main() {
  const distExists = await fs.stat(DIST_DIR).catch(() => null);
  if (!distExists) fail('Build not found. Run `npm run build` before checking size.');

  const files = await collectFiles(DIST_DIR);
  if (files.length === 0) fail('No build assets found to inspect.');

  const { projects } = JSON.parse(await fs.readFile('content/projects.json', 'utf8'));
  const ids = new Set(projects.map((p) => p.id));
  const towers = new Set(projects.filter((p) => p.commits >= TOWER_COMMITS).map((p) => p.id));

  let initialKb = 0;
  let panelKb = 0;
  let panelCount = 0;
  console.log('Gzipped asset sizes:');
  for (const file of files) {
    const data = await fs.readFile(file);
    const sizeKb = gzipSync(data).length / 1024;
    const relative = path.relative(DIST_DIR, file);
    // Vite names it poster-<project id>-<8 character hash>.webp.
    const poster = /^poster-(.+)-[\w-]{8}\.webp$/.exec(path.basename(file));
    const id = poster && ids.has(poster[1]) ? poster[1] : null;
    const lazy = id !== null && !towers.has(id);
    console.log(` - ${relative}: ${sizeKb.toFixed(2)} KB${lazy ? ' (panel art)' : ''}`);
    if (sizeKb > MAX_FILE_KB) fail(`${relative} exceeds ${MAX_FILE_KB} KB (got ${sizeKb.toFixed(2)} KB)`);
    if (id !== null && sizeKb > MAX_POSTER_KB) {
      fail(`${relative} exceeds the ${MAX_POSTER_KB} KB poster cap (got ${sizeKb.toFixed(2)} KB)`);
    }
    if (lazy) {
      panelKb += sizeKb;
      panelCount += 1;
    } else {
      initialKb += sizeKb;
    }
  }

  console.log(`Initial load (everything but panel art): ${initialKb.toFixed(2)} KB of ${MAX_TOTAL_KB} KB`);
  console.log(`Panel art, loaded when a panel opens: ${panelCount} posters, ${panelKb.toFixed(2)} KB of ${MAX_PANEL_ART_KB} KB`);
  if (initialKb > MAX_TOTAL_KB) fail(`Initial load exceeds ${MAX_TOTAL_KB} KB (got ${initialKb.toFixed(2)} KB)`);
  if (panelKb > MAX_PANEL_ART_KB) fail(`Panel art exceeds ${MAX_PANEL_ART_KB} KB (got ${panelKb.toFixed(2)} KB)`);

  console.log('✅ Size budget satisfied');
}

await main();
