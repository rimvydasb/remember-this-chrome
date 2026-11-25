// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResponse, SavedItem } from '../../shared/types';
import { installDashboardEnvironment, makeItem, renderApp } from '../../test/render';
import { Popup } from '../Popup';

const VIDEO_URL = 'https://www.youtube.com/watch?v=abcdefghijk';

function open(tab: { id?: number; url?: string; title?: string }, items: SavedItem[] = []) {
  const fake = installDashboardEnvironment();
  for (const item of items) fake.storage.local.store.set(`item:${item.id}`, item);
  const chromeStub = {
    ...fake,
    tabs: { query: vi.fn(async () => [tab]), create: vi.fn(async () => ({})) },
    runtime: { sendMessage: vi.fn(), getURL: (path: string) => `chrome-extension://abc/${path}` },
  };
  vi.stubGlobal('chrome', chromeStub);
  vi.spyOn(window, 'close').mockImplementation(() => {});
  return { chrome: chromeStub, fake, ...renderApp(<Popup />) };
}

const response = (extra: Partial<Extract<CaptureResponse, { ok: true }>> = {}): CaptureResponse => ({
  ok: true,
  created: true,
  changed: [],
  item: makeItem({ id: 'saved', title: 'Video', content: 'Transcript words.' }),
  stats: { extractMs: 12, words: 1234, paragraphs: 8, source: 'dom' },
  ...extra,
});

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('popup', () => {
  it('offers to save the transcript of a YouTube video, with a clean title', async () => {
    open({ id: 1, url: VIDEO_URL, title: '(3) Sleep and memory - YouTube' });
    expect(await screen.findByText('Sleep and memory')).toBeInTheDocument();
    expect(screen.getByText('YouTube video')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Save transcript' })).toBeEnabled();
  });

  it('offers to capture the text of another page', async () => {
    open({ id: 1, url: 'https://example.com/article', title: 'An article' });
    expect(await screen.findByRole('button', { name: 'Capture page text' })).toBeEnabled();
    expect(screen.getByText('Web page')).toBeInTheDocument();
  });

  it('offers an update when the video is already in the library', async () => {
    open({ id: 1, url: VIDEO_URL, title: 'Video - YouTube' }, [
      makeItem({ id: 'v', url: VIDEO_URL, type: 'youtube_transcript' }),
    ]);
    expect(await screen.findByRole('button', { name: 'Update transcript' })).toBeEnabled();
    expect(screen.getByText(/In your library · last updated/)).toBeInTheDocument();
  });

  it('counts the items in the library', async () => {
    open({ id: 1, url: 'https://example.com' }, [makeItem(), makeItem()]);
    expect(await screen.findByText('2 items in library')).toBeInTheDocument();
  });

  it('uses the singular for one item', async () => {
    open({ id: 1, url: 'https://example.com' }, [makeItem()]);
    expect(await screen.findByText('1 item in library')).toBeInTheDocument();
  });

  it('keeps the button disabled when there is no active tab', async () => {
    const { chrome } = open({});
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Capture page text' })).toBeDisabled();
  });

  it('captures through the background and shows the result', async () => {
    const { user, chrome } = open({ id: 7, url: VIDEO_URL, title: 'Video - YouTube' });
    chrome.runtime.sendMessage.mockResolvedValue(response());
    await user.click(await screen.findByRole('button', { name: 'Save transcript' }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'capture-tab', tabId: 7 });
    expect(await screen.findByText('Transcript saved')).toBeInTheDocument();
    expect(screen.getByText('1,234 words')).toBeInTheDocument();
    expect(screen.getByText('8 paragraphs')).toBeInTheDocument();
  });

  it('lists what changed when a capture updates an item', async () => {
    const { user, chrome } = open({ id: 7, url: VIDEO_URL });
    chrome.runtime.sendMessage.mockResolvedValue(response({ created: false, changed: ['title', 'content', 'views'] }));
    await user.click(await screen.findByRole('button', { name: 'Save transcript' }));
    expect(await screen.findByText('Transcript updated')).toBeInTheDocument();
    expect(screen.getByText('Changed: title, transcript, view count.')).toBeInTheDocument();
  });

  it('says when nothing changed', async () => {
    const { user, chrome } = open({ id: 7, url: VIDEO_URL });
    chrome.runtime.sendMessage.mockResolvedValue(response({ created: false, changed: [] }));
    await user.click(await screen.findByRole('button', { name: 'Save transcript' }));
    expect(await screen.findByText('No changes since the last capture.')).toBeInTheDocument();
  });

  it('shows the error of a failed capture', async () => {
    const { user, chrome } = open({ id: 7, url: VIDEO_URL });
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: false,
      code: 'no_captions',
      error: 'This video has no captions.',
    });
    await user.click(await screen.findByRole('button', { name: 'Save transcript' }));
    expect(await screen.findByText('Could not save the transcript')).toBeInTheDocument();
    expect(screen.getByText('This video has no captions.')).toBeInTheDocument();
  });

  it('shows an error when the background does not answer', async () => {
    const { user, chrome } = open({ id: 7, url: VIDEO_URL });
    chrome.runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated.'));
    await user.click(await screen.findByRole('button', { name: 'Save transcript' }));
    expect(await screen.findByText(/Extension context invalidated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save transcript' })).toBeEnabled();
  });

  it('copies the captured text', async () => {
    const { user, chrome } = open({ id: 7, url: VIDEO_URL });
    chrome.runtime.sendMessage.mockResolvedValue(response());
    await user.click(await screen.findByRole('button', { name: 'Save transcript' }));
    await user.click(await screen.findByRole('button', { name: 'Copy text' }));
    expect(await navigator.clipboard.readText()).toBe('Transcript words.');
  });

  it('opens the library, and the captured item, in a new tab', async () => {
    const { user, chrome } = open({ id: 7, url: VIDEO_URL });
    await user.click(screen.getByRole('button', { name: 'Open library' }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://abc/dashboard.html' });

    chrome.runtime.sendMessage.mockResolvedValue(response({ item: makeItem({ id: 'a b' }) }));
    await user.click(await screen.findByRole('button', { name: 'Save transcript' }));
    await user.click(await screen.findByRole('button', { name: 'View' }));
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: 'chrome-extension://abc/dashboard.html#item=a%20b' });
  });

  it('updates the button and the count when the library changes', async () => {
    const { fake } = open({ id: 1, url: VIDEO_URL });
    await screen.findByRole('button', { name: 'Save transcript' });
    await fake.storage.local.set({ 'item:v': makeItem({ id: 'v', url: VIDEO_URL, type: 'youtube_transcript' }) });
    expect(await screen.findByRole('button', { name: 'Update transcript' })).toBeInTheDocument();
    expect(screen.getByText('1 item in library')).toBeInTheDocument();
  });
});
