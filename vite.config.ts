import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = resolve(import.meta.dirname, 'src');

export default defineConfig({
  root,
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
        popup: resolve(root, 'popup.html'),
        dashboard: resolve(root, 'dashboard.html'),
        background: resolve(root, 'background/index.ts'),
      },
      output: {
        // The manifest references the service worker by a fixed name.
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    root,
    environment: 'node',
  },
});
