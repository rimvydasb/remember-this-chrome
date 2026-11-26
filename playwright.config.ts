import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Builds the extension into `.e2e/extension` (not `dist`, which may be loaded in the real browser).
  globalSetup: './e2e/build.ts',
  // Each test launches its own browser with its own empty profile; a persistent context per test is heavy.
  workers: 2,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  outputDir: '.e2e/results',
});
