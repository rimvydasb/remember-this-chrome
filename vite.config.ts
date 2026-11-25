import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const src = resolve(import.meta.dirname, 'src');
/** The GUI: the HTML entry pages and their React code. Everything else in `src` is supporting code. */
const appRoot = resolve(src, 'app');

export default defineConfig({
  root: appRoot,
  // Not under `root`: keeps the cache in the one node_modules of the project.
  cacheDir: resolve(import.meta.dirname, 'node_modules/.vite'),
  publicDir: resolve(import.meta.dirname, 'public'),
  base: '',
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome130',
    modulePreload: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(appRoot, 'popup.html'),
        dashboard: resolve(appRoot, 'dashboard.html'),
        background: resolve(src, 'background/index.ts'),
      },
      output: {
        // The manifest references the service worker by a fixed name.
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    root: src,
    environment: 'node',
    setupFiles: [resolve(src, 'test/setup.ts')],
  },
});
