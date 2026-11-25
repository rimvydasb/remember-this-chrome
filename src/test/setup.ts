import '@testing-library/jest-dom/vitest';
import { notifications } from '@mantine/notifications';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Only the jsdom tests (`// @vitest-environment jsdom`) need the DOM polyfills.
if (typeof window !== 'undefined') {
  afterEach(() => {
    cleanup();
    notifications.clean();
    localStorage.clear();
    window.location.hash = '';
  });

  // Mantine reads these; jsdom has neither.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub;
  // Autosizing textareas listen for web fonts to load.
  if (!document.fonts) {
    Object.defineProperty(document, 'fonts', {
      value: { addEventListener: () => {}, removeEventListener: () => {} },
    });
  }
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView ??= () => {};
}
