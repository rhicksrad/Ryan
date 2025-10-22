import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    assetsInlineLimit: 512,
    target: 'es2020',
    sourcemap: true
  },
  server: {
    open: false
  }
});
