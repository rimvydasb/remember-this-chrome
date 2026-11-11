import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeChrome, type FakeChrome } from '../../test/fakeChrome';
import { DEFAULT_SETTINGS, getSettings, normalizeSettings, saveSettings, SETTINGS_KEY } from '../settings';

let chrome: FakeChrome;

beforeEach(() => {
  chrome = createFakeChrome();
  vi.stubGlobal('chrome', chrome);
});

afterEach(() => vi.unstubAllGlobals());

describe('settings', () => {
  it('uses LM Studio on 192.168.1.220:1234 and the default prompt', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.llm.baseUrl).toBe('http://192.168.1.220:1234');
    expect(DEFAULT_SETTINGS.llm.summaryPrompt).toBe(
      'Summarize this YouTube transcript. Start with main statement or idea in this transcript. ' +
        'Then write 3-8 sentences that summarizes transcript.',
    );
  });

  it('saves and loads settings', async () => {
    const custom = {
      llm: { baseUrl: 'http://localhost:1234', model: 'gemma', summaryPrompt: 'Short.', useForTags: false },
    };
    await saveSettings(custom);
    expect(chrome.storage.local.store.get(SETTINGS_KEY)).toEqual(custom);
    expect(await getSettings()).toEqual(custom);
  });

  it('uses the LLM for tagging by default', () => {
    expect(DEFAULT_SETTINGS.llm.useForTags).toBe(true);
    expect(normalizeSettings({ llm: { useForTags: 'no' } }).llm.useForTags).toBe(true);
    expect(normalizeSettings({ llm: { useForTags: false } }).llm.useForTags).toBe(false);
  });

  it('replaces missing or invalid values with defaults', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ llm: { baseUrl: ' ', model: 3, summaryPrompt: '' } })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ llm: { baseUrl: ' http://x:1 ', model: ' m ' } }).llm).toEqual({
      ...DEFAULT_SETTINGS.llm,
      baseUrl: 'http://x:1',
      model: 'm',
    });
  });
});
