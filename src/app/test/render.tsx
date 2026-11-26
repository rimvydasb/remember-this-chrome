import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { itemTerms } from '../../shared/terms';
import type { SavedItem } from '../../shared/types';
import { theme } from '../ui/theme';
import { createFakeChrome } from '../../test/fakeChrome';

/** Renders with the providers that `dashboard/main.tsx` sets up. */
export function renderApp(ui: ReactElement) {
  const user = userEvent.setup();
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} env="test">
        <ModalsProvider>
          <Notifications />
          {node}
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
  const result = render(wrap(ui));
  return { user, ...result, rerender: (node: ReactElement) => result.rerender(wrap(node)) };
}

/** Runs keyword extraction like `termWorker.ts`, but on the main thread. */
class FakeTermWorker {
  private listeners = new Set<(event: MessageEvent) => void>();
  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }
  terminate() {}
  postMessage({ request, jobs }: { request: number; jobs: { key: string; item: SavedItem }[] }) {
    setTimeout(() => {
      const send = (data: unknown) => this.listeners.forEach((listener) => listener({ data } as MessageEvent));
      for (const job of jobs) send({ request, key: job.key, terms: itemTerms(job.item) });
      send({ request, done: true });
    }, 0);
  }
}

/**
 * Installs the fake `chrome` and the fake worker. Unlike the unit-test fake, `storage.onChanged`
 * works: writes notify the listeners, so the dashboard updates like it does in the browser.
 */
export function installDashboardEnvironment() {
  const base = createFakeChrome();
  const { store } = base.storage.local;
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  const notify = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (Object.keys(changes).length > 0) listeners.forEach((listener) => listener(changes, 'local'));
  };

  const set = vi.fn(async (items: Record<string, unknown>) => {
    const changes: Record<string, chrome.storage.StorageChange> = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: store.get(key), newValue: structuredClone(value) };
      store.set(key, structuredClone(value));
    }
    notify(changes);
  });
  const remove = vi.fn(async (keys: string | string[]) => {
    const changes: Record<string, chrome.storage.StorageChange> = {};
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (store.has(key)) changes[key] = { oldValue: store.get(key) };
      store.delete(key);
    }
    notify(changes);
  });

  const fake = {
    ...base,
    storage: {
      local: { ...base.storage.local, set, remove, getBytesInUse: vi.fn(async () => 2 * 1024 * 1024) },
      onChanged: {
        addListener: vi.fn((listener) => listeners.add(listener)),
        removeListener: vi.fn((listener) => listeners.delete(listener)),
      },
    },
  };
  vi.stubGlobal('chrome', fake);
  vi.stubGlobal('Worker', FakeTermWorker);
  return fake;
}

export { makeItem, sentimentTags, topicTags } from '../../test/items';
