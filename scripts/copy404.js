import { access, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const distDir = resolve(projectRoot, 'dist');
const indexPath = resolve(distDir, 'index.html');
const notFoundPath = resolve(distDir, '404.html');

async function ensureIndexExists() {
  try {
    await access(indexPath, constants.F_OK);
    return true;
  } catch (error) {
    console.warn(
      '[copy404] dist/index.html not found. Skipping creation of 404.html.',
    );
    return false;
  }
}

async function createNotFoundPage() {
  const hasIndex = await ensureIndexExists();
  if (!hasIndex) {
    return;
  }

  await copyFile(indexPath, notFoundPath);
  console.log('[copy404] Created dist/404.html to support direct route loading.');
}

createNotFoundPage().catch((error) => {
  console.error('[copy404] Unable to create dist/404.html:', error);
  process.exitCode = 1;
});
