import { chromium, expect, test as base, type BrowserContext, type Page, type Request } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../src/shared/settings';
import type { SavedItem } from '../src/shared/types';
import { ITEMS } from './data';
import { EXTENSION_DIR } from './paths';

/** The fake address of the LLM server. It does not resolve; every request to it is answered by `mockLlm`. */
export const LLM_URL = 'http://llm.test:1234';

export interface LlmMock {
  /** The text of the next chat completions. */
  answer: string;
  models: string[];
  /** The bodies of the chat completion requests received. */
  completions: { messages: { role: string; content: string }[] }[];
}

interface Fixtures {
  context: BrowserContext;
  llm: LlmMock;
  /** The dashboard, opened on a fake library. */
  dashboard: Page;
  extensionId: string;
}

/**
 * Safety: the browser gets a new, empty profile in a temporary folder, so `chrome.storage.local`
 * is not the one of your real browser. The library is fake. Only requests to the extension itself,
 * and to the fake LLM server, are allowed; anything else fails the test.
 */
export const test = base.extend<Fixtures>({
  // Playwright requires the destructuring pattern, even when no fixture is used.
  // oxlint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'remember-this-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', // The new headless mode, which supports extensions.
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await use(context);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },

  llm: async ({ context }, use) => {
    const llm: LlmMock = { answer: 'A mocked summary.', models: ['mock-model-a', 'mock-model-b'], completions: [] };
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    await context.route(`${LLM_URL}/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (path === '/v1/models') {
        return route.fulfill({
          headers: cors,
          json: { data: llm.models.map((id) => ({ id })) },
        });
      }
      if (path === '/v1/chat/completions') {
        llm.completions.push(request.postDataJSON());
        return route.fulfill({
          headers: cors,
          json: { model: 'mock-model-a', choices: [{ message: { role: 'assistant', content: llm.answer } }] },
        });
      }
      return route.fulfill({ status: 404, headers: cors, body: 'not mocked' });
    });
    await use(llm);
  },

  dashboard: async ({ context, extensionId, llm }, use) => {
    void llm;
    // Chrome would show a permission prompt for the server address, which a test cannot answer.
    await context.addInitScript(() => {
      if (typeof chrome === 'undefined' || !chrome.permissions) return;
      chrome.permissions.request = (() => Promise.resolve(true)) as typeof chrome.permissions.request;
      chrome.permissions.contains = (() => Promise.resolve(true)) as typeof chrome.permissions.contains;
    });

    const page = await context.newPage();
    const unexpected: string[] = [];
    page.on('request', (request: Request) => {
      const { protocol, host } = new URL(request.url());
      if (['data:', 'blob:', 'chrome-extension:'].includes(protocol) || host === new URL(LLM_URL).host) return;
      unexpected.push(request.url());
    });

    await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
    await seedStorage(page, ITEMS);
    await page.reload();
    await use(page);
    expect(unexpected, 'requests that left the extension and the fake LLM').toEqual([]);
  },
});

export { expect };

/** Replaces everything in this (test) profile's extension storage with the given items and settings. */
async function seedStorage(page: Page, items: readonly SavedItem[]) {
  const settings = { llm: { ...DEFAULT_SETTINGS.llm, baseUrl: LLM_URL, useForTags: false } };
  const entries = {
    [SETTINGS_KEY]: settings,
    ...Object.fromEntries(items.map((item) => [`item:${item.id}`, item])),
  };
  await page.evaluate(async (data) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(data);
  }, entries);
}
