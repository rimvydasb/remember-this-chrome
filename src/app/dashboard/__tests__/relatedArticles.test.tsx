// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from '../../../llm';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../../shared/settings';
import type { SavedItem } from '../../../shared/types';
import { resetLlmMocks } from '../../../test/llmMock';
import { installDashboardEnvironment, makeItem, renderApp, topicTags } from '../../test/render';
import { App } from '../App';

const llm = await vi.hoisted(async () => (await import('../../../test/llmMock')).createLlmMocks());
vi.mock('../../../llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../llm')>()),
  ...llm,
}));
const queries = vi.hoisted(() => vi.fn());
vi.mock('../../../followups/related/generateSearchQueries', () => ({ generateSearchQueries: queries }));

const serp = readFileSync(resolve(import.meta.dirname, '../../../shared/__tests__/fixtures/google-serp.html'), 'utf8');

/** A Google answer: the result page, or a redirect to the bot check. */
function stubGoogle(kind: 'results' | 'sorry') {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const response = new Response(kind === 'results' ? serp : 'Our systems have detected unusual traffic', {
      status: kind === 'results' ? 200 : 429,
    });
    const url = kind === 'results' ? 'https://www.google.com/search?q=x' : 'https://www.google.com/sorry/index?x';
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let fake: ReturnType<typeof installDashboardEnvironment>;
const stored = () => fake.storage.local.store.get('item:a') as SavedItem;

async function open(extra: Partial<SavedItem> = {}) {
  fake = installDashboardEnvironment();
  fake.storage.local.store.set(SETTINGS_KEY, { llm: { ...DEFAULT_SETTINGS.llm, useForTags: false } });
  fake.storage.local.store.set(
    'item:a',
    makeItem({
      id: 'a',
      title: 'Sleep and memory',
      type: 'youtube_transcript',
      url: 'https://www.youtube.com/watch?v=abc',
      tags: topicTags('sleep'),
      ...extra,
    }),
  );
  window.location.hash = '#item=a';
  const view = renderApp(<App />);
  await screen.findByRole('heading', { level: 2, name: 'Sleep and memory' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find related articles' })).toBeEnabled());
  return view;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  resetLlmMocks(llm);
  queries.mockReset().mockResolvedValue({ queries: ['sleep deprivation memory study'], model: 'qwen' });
});

describe('related articles', () => {
  it('RelatedArticles saves a follow-up after a successful search', async () => {
    const fetchMock = stubGoogle('results');
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Find related articles' }));

    expect(await screen.findByRole('link', { name: /Devastating Effects of Sleep Deprivation/ })).toBeInTheDocument();
    // One prompt for the LLM server and Google together, during the click.
    expect(llm.requestLlmPermission).toHaveBeenCalledWith(DEFAULT_SETTINGS.llm.baseUrl, ['https://www.google.com/*']);
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.searchParams.get('q')).toBe('sleep deprivation memory study -site:youtube.com');

    const [saved] = stored().followUps!;
    expect(saved).toMatchObject({ type: 'related-articles', model: 'qwen' });
    expect(saved!.articles).toHaveLength(10);
    expect(saved!.generatedContent).toContain('](<https://pmc.ncbi.nlm.nih.gov/articles/PMC10204456>)');
  });

  it('works for a page item and leaves out the page itself', async () => {
    stubGoogle('results');
    const { user } = await open({ type: 'webpage_text', url: 'https://theconversation.com/some-post' });
    await user.click(screen.getByRole('button', { name: 'Find related articles' }));

    await screen.findByRole('link', { name: /Devastating Effects/ });
    expect(screen.queryByRole('link', { name: /Not getting enough sleep/ })).not.toBeInTheDocument();
    expect(stored().followUps![0]!.articles).toHaveLength(9);
  });

  it('RelatedArticles shows the cooldown after a /sorry/ response', async () => {
    stubGoogle('sorry');
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Find related articles' }));

    expect(await screen.findByText('Google search is paused')).toBeInTheDocument();
    expect(screen.getByText('Cannot find related articles')).toBeInTheDocument();
    expect(screen.getByText(/“sleep deprivation memory study”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find related articles' })).toBeDisabled();
    expect(stored().followUps).toBeUndefined();
  });

  it('searches with title and tag queries when the LLM is not reachable', async () => {
    queries.mockRejectedValue(new LlmError('Cannot reach the LLM server.'));
    const fetchMock = stubGoogle('results');
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Find related articles' }));

    await screen.findByRole('link', { name: /Devastating Effects/ }, { timeout: 6000 });
    const sent = fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('q'));
    expect(sent).toEqual(['Sleep and memory -site:youtube.com', 'sleep -site:youtube.com']);
  }, 10_000);

  it('shows the denied permission and keeps the button usable', async () => {
    llm.requestLlmPermission.mockResolvedValue(false);
    const fetchMock = stubGoogle('results');
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Find related articles' }));

    expect(await screen.findByText(/was denied/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Find related articles' })).toBeEnabled();
  });
});
