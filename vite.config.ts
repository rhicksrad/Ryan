import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const copyProfilePlugin = () => ({
  name: 'copy-profile-json',
  apply: 'build',
  generateBundle() {
    const profilePath = resolve(__dirname, 'content/profile.json');
    const source = readFileSync(profilePath);
    this.emitFile({
      type: 'asset',
      fileName: 'content/profile.json',
      source
    });
  }
});

export default defineConfig({
  plugins: [copyProfilePlugin()],
  server: {
    port: 5173,
    strictPort: false
  },
  preview: {
    port: 4173
  },
  build: {
    chunkSizeWarningLimit: 900,
    sourcemap: false
  }
});
