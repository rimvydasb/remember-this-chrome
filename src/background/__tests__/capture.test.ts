import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionResult } from '../../content/youtubeExtractor';
import { getAllItems } from '../../shared/storage';
import { createFakeChrome, type FakeChrome } from '../../test/fakeChrome';
import { captureTab } from '../capture';

const WATCH_URL = 'https://www.youtube.com/watch?v=mQZB0l-rhxE';

const success: ExtractionResult = {
  ok: true,
  videoId: 'mQZB0l-rhxE',
  title: 'Give Claude Code ways to verify its work',
  channel: 'Anthropic',
  durationSec: 150,
  language: 'English',
  description: 'Intro text.\n\nDocs: https://code.claude.com/docs/en/skills\n\n0:00 Start\n1:01 Middle',
  viewCount: '407883',
  source: 'timedtext',
  segments: [
    { startMs: 0, durationMs: 1000, text: 'Hello and welcome.' },
    { startMs: 1000, durationMs: 1000, text: 'Let us begin.' },
  ],
  elapsedMs: 12,
};

let chrome: FakeChrome;

function givenTab(url: string, result: ExtractionResult | undefined) {
  chrome.tabs.get.mockResolvedValue({ id: 1, url });
  chrome.scripting.executeScript.mockResolvedValue([{ result }]);
}

beforeEach(() => {
  chrome = createFakeChrome();
  vi.stubGlobal('chrome', chrome);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('captureTab', () => {
  it('saves a transcript with description, view count, chapters, and links', async () => {
    givenTab(WATCH_URL, success);
    const response = await captureTab(1);

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 }, world: 'MAIN' }),
    );
    expect(response).toMatchObject({
      ok: true,
      created: true,
      stats: { words: 6, paragraphs: 1, source: 'timedtext' },
    });
    const [saved] = await getAllItems();
    expect(saved).toMatchObject({
      title: success.title,
      url: WATCH_URL,
      type: 'youtube_transcript',
      content: 'Hello and welcome. Let us begin.',
      meta: {
        videoId: 'mQZB0l-rhxE',
        channel: 'Anthropic',
        viewCount: 407883,
        description: success.description,
        chapters: [
          { startSec: 0, title: 'Start' },
          { startSec: 61, title: 'Middle' },
        ],
        links: [{ url: 'https://code.claude.com/docs/en/skills', label: 'Docs' }],
      },
    });
  });

  it('stores the canonical watch URL, so a second capture updates the same item', async () => {
    givenTab(`${WATCH_URL}&t=42s&list=PL1`, success);
    await captureTab(1);
    givenTab(WATCH_URL, { ...success, viewCount: '500000' });
    const response = await captureTab(1);
    expect(response).toMatchObject({ ok: true, created: false });
    const items = await getAllItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.meta?.viewCount).toBe(500000);
  });

  it('reports non-YouTube pages as not implemented without injecting', async () => {
    givenTab('https://example.com/article', success);
    expect(await captureTab(1)).toMatchObject({ ok: false, code: 'not_implemented' });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('reports injection errors', async () => {
    givenTab(WATCH_URL, success);
    chrome.scripting.executeScript.mockRejectedValue(new Error('Cannot access contents of the page'));
    const response = await captureTab(1);
    expect(response).toMatchObject({ ok: false, code: 'injection_failed' });
    expect(!response.ok && response.error).toContain('Cannot access contents of the page');
  });

  it('reports an empty injection result as an injection error', async () => {
    givenTab(WATCH_URL, undefined);
    expect(await captureTab(1)).toMatchObject({ ok: false, code: 'injection_failed' });
  });

  it('passes extractor failures through', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    givenTab(WATCH_URL, { ok: false, code: 'no_captions', error: 'No captions', details: ['x'] });
    expect(await captureTab(1)).toEqual({ ok: false, code: 'no_captions', error: 'No captions' });
  });

  it('rejects a transcript that is empty after cleanup', async () => {
    givenTab(WATCH_URL, { ...success, segments: [{ startMs: 0, durationMs: 0, text: ' &nbsp; ' }] });
    expect(await captureTab(1)).toMatchObject({ ok: false, code: 'empty_transcript' });
    expect(await getAllItems()).toEqual([]);
  });

  it('falls back to a generic title', async () => {
    givenTab(WATCH_URL, { ...success, title: '' });
    const response = await captureTab(1);
    expect(response.ok && response.item.title).toBe('YouTube video mQZB0l-rhxE');
  });
});
