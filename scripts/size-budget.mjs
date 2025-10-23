import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';

const DIST_DIR = 'dist';
const MAX_FILE_KB = 400;
const MAX_TOTAL_KB = 2000;

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

async function main() {
  const distExists = await fs.stat(DIST_DIR).catch(() => null);
  if (!distExists) {
    console.error('Build not found. Run `npm run build` before checking size.');
    process.exit(1);
    return;
  }

  const files = await collectFiles(DIST_DIR);
  if (files.length === 0) {
    console.error('No build assets found to inspect.');
    process.exit(1);
    return;
  }

  let totalKb = 0;
  console.log('Gzipped asset sizes:');
  for (const file of files) {
    const data = await fs.readFile(file);
    const gzipped = gzipSync(data);
    const sizeKb = gzipped.length / 1024;
    totalKb += sizeKb;
    const relative = path.relative(DIST_DIR, file);
    console.log(` - ${relative}: ${sizeKb.toFixed(2)} KB`);
    if (sizeKb > MAX_FILE_KB) {
      console.error(`❌ ${relative} exceeds ${MAX_FILE_KB} KB (got ${sizeKb.toFixed(2)} KB)`);
      process.exit(1);
      return;
    }
  }

  console.log(`Total gzipped size: ${totalKb.toFixed(2)} KB`);
  if (totalKb > MAX_TOTAL_KB) {
    console.error(`❌ Bundle exceeds ${MAX_TOTAL_KB} KB (got ${totalKb.toFixed(2)} KB)`);
    process.exit(1);
    return;
  }

  console.log('✅ Size budget satisfied');
}

await main();
