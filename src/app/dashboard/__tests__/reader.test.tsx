// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS_KEY } from '../../../shared/catalogs';
import { createFollowUp } from '../../../shared/followUpRecords';
import type { SavedItem } from '../../../shared/types';
import { installDashboardEnvironment, makeItem, renderApp } from '../../test/render';
import { App } from '../App';

const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
vi.mock('../../ui/download', () => download);

let fake: ReturnType<typeof installDashboardEnvironment>;
const stored = (id: string) => fake.storage.local.store.get(`item:${id}`) as SavedItem | undefined;

const VIDEO = () =>
  makeItem({
    id: 'video',
    title: 'Sleep and memory',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    type: 'youtube_transcript',
    content: 'Sleep helps memory.\n\nDeep sleep is when memory is consolidated.\n\nCoffee does not help.',
    timestamp: '2026-03-04T10:00:00.000Z',
    meta: {
      channel: 'Neuro Lab',
      videoId: 'abcdefghijk',
      language: 'en',
      durationSec: 1500,
      viewCount: 1200,
      description: 'A talk about sleep. Notes: https://example.com/notes',
      chapters: [
        { startSec: 0, title: 'Intro' },
        { startSec: 90, title: 'Deep sleep' },
      ],
      links: [{ url: 'https://example.com/notes', label: 'Notes' }],
    },
  });

function open(items: SavedItem[], id: string, extra: Record<string, unknown> = {}) {
  fake = installDashboardEnvironment();
  for (const item of items) fake.storage.local.store.set(`item:${item.id}`, item);
  for (const [key, value] of Object.entries(extra)) fake.storage.local.store.set(key, value);
  window.location.hash = `#item=${id}`;
  return renderApp(<App />);
}

const heading = (name: string) => screen.findByRole('heading', { level: 2, name });

describe('item reader', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    download.downloadTextFile.mockReset();
    localStorage.clear();
  });

  it('shows the sentiment tags among the keyword tags, right after the channel', async () => {
    const item = VIDEO();
    item.aiTags = { tags: ['sleep science'], createdAt: '2026-03-04T10:00:00.000Z' };
    item.followUps = [createFollowUp('llm-sentiment', { generatedContent: 'informative, optimistic' })];
    open([item], 'video');
    await heading('Sleep and memory');

    const row = (await screen.findAllByText('informative'))[0]!.closest('[data-mood]')!.parentElement!;
    const labels = Array.from(row.children, (child) => child.textContent);
    expect(labels.slice(0, 4)).toEqual(['Neuro Lab', 'informative', 'optimistic', 'sleep science']);
  });

  it('shows the title, details and text of a video', async () => {
    open([VIDEO()], 'video');
    await heading('Sleep and memory');

    expect(screen.getByText('YouTube transcript')).toBeInTheDocument();
    expect(screen.getByText('en')).toBeInTheDocument();
    expect(screen.getByText('Neuro Lab', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/1,200 views as of/)).toBeInTheDocument();
    expect(screen.getByText(/25:00 video/)).toBeInTheDocument();
    expect(screen.getByText('Deep sleep is when memory is consolidated.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open source/ })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
  });

  it('shows a web page as content, without video details', async () => {
    open([makeItem({ id: 'page', title: 'An article', content: 'Hello page.' })], 'page');
    await heading('An article');
    expect(screen.getByText('Web page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Content/ })).toBeInTheDocument();
    expect(screen.queryByText('Chapters')).not.toBeInTheDocument();
  });

  it('uses "Untitled" for an item without a title', async () => {
    open([makeItem({ id: 'blank', title: '', content: 'Text.' })], 'blank');
    expect(await heading('Untitled')).toBeInTheDocument();
  });

  it('lists the chapters, with links that play from the chapter start', async () => {
    open([VIDEO()], 'video');
    await heading('Sleep and memory');
    const link = screen.getByRole('link', { name: /Deep sleep/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('abcdefghijk'));
    expect(link.getAttribute('href')).toMatch(/[?&]t=90/);
    expect(within(link).getByText('1:30')).toBeInTheDocument();
  });

  it('lists links and the description of a video', async () => {
    open([VIDEO()], 'video');
    await heading('Sleep and memory');
    expect(screen.getByRole('link', { name: /Notes/ })).toHaveAttribute('href', 'https://example.com/notes');
    expect(screen.getByText(/A talk about sleep/)).toBeInTheDocument();
  });

  it('collapses a block and remembers it', async () => {
    const { user } = open([VIDEO()], 'video');
    await heading('Sleep and memory');
    const toggle = screen.getByRole('button', { name: /^Transcript/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('rt-block-expanded:content')).toBe('false');
  });

  it('highlights the search terms and counts the matches', async () => {
    const { user } = open([VIDEO()], 'video');
    await heading('Sleep and memory');
    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'memory');
    // "memory" is in the title, and twice in the text.
    expect(await screen.findByText('2 matches')).toBeInTheDocument();
    expect(screen.getAllByText('memory', { selector: 'mark' }).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the item open when the search hides it from the list', async () => {
    const { user } = open([VIDEO(), makeItem({ id: 'other', title: 'Other', content: 'zebra' })], 'video');
    await heading('Sleep and memory');
    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'zebra');
    await waitFor(() => expect(screen.getByRole('option', { name: /Other/ })).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: 'Sleep and memory' })).toBeInTheDocument();
  });

  it('shows the item from the list when a row is clicked, and keeps the URL in step', async () => {
    const { user } = open([VIDEO(), makeItem({ id: 'other', title: 'Other', content: 'zebra' })], 'video');
    await heading('Sleep and memory');
    await user.click(screen.getByRole('option', { name: /Other/ }));
    expect(await heading('Other')).toBeInTheDocument();
    expect(window.location.hash).toBe('#item=other');
  });

  it('moves between items with the arrow keys and J/K', async () => {
    const { user } = open(
      [
        makeItem({ id: 'one', title: 'One', timestamp: '2026-01-03T00:00:00.000Z' }),
        makeItem({ id: 'two', title: 'Two', timestamp: '2026-01-02T00:00:00.000Z' }),
        makeItem({ id: 'three', title: 'Three', timestamp: '2026-01-01T00:00:00.000Z' }),
      ],
      'one',
    );
    await heading('One');
    await user.keyboard('j');
    expect(await heading('Two')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(await heading('Three')).toBeInTheDocument();
    // The end of the list stays on the last item.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('heading', { level: 2, name: 'Three' })).toBeInTheDocument();
    await user.keyboard('k');
    expect(await heading('Two')).toBeInTheDocument();
  });

  it('does not move to another item when J or K is typed in the search box', async () => {
    const { user } = open(
      [
        makeItem({ id: 'one', title: 'One', timestamp: '2026-01-03T00:00:00.000Z' }),
        makeItem({ id: 'two', title: 'Two', timestamp: '2026-01-02T00:00:00.000Z' }),
      ],
      'one',
    );
    await heading('One');
    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'jkjk');
    expect(screen.getByRole('textbox', { name: 'Search library' })).toHaveValue('jkjk');
    expect(window.location.hash).toBe('#item=one');
    expect(screen.getByRole('heading', { level: 2, name: 'One' })).toBeInTheDocument();
  });

  it('shows the breadcrumbs and goes to the catalog and home', async () => {
    const { user } = open([makeItem({ id: 'x', title: 'Cooked', catalogId: 'cooking' })], 'x', {
      [CATALOGS_KEY]: [{ id: 'cooking', name: 'Cooking', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    await heading('Cooked');
    await user.click(within(screen.getByLabelText('Breadcrumb')).getByRole('button', { name: 'Cooking' }));
    expect(await heading('Cooking')).toBeInTheDocument();
    expect(window.location.hash).toBe('#catalog=cooking');
  });

  it('copies the text', async () => {
    const { user } = open([VIDEO()], 'video');
    await heading('Sleep and memory');
    await user.click(screen.getByRole('button', { name: 'Copy text' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(VIDEO().content);
  });

  it('exports the item as Markdown', async () => {
    const { user } = open([VIDEO()], 'video');
    await heading('Sleep and memory');
    await user.click(screen.getByRole('button', { name: 'Export Markdown' }));
    expect(download.downloadTextFile).toHaveBeenCalledTimes(1);
    const [, text, type] = download.downloadTextFile.mock.calls[0]!;
    expect(type).toBe('text/markdown');
    expect(text).toContain('Sleep and memory');
    expect(text).toContain('Deep sleep is when memory is consolidated.');
  });

  it('loves and un-loves the item', async () => {
    const { user } = open([VIDEO()], 'video');
    await heading('Sleep and memory');
    await user.click(screen.getByRole('button', { name: 'Love' }));
    await waitFor(() => expect(stored('video')?.mark).toBe('loved'));
    const unlove = await screen.findByRole('button', { name: 'Remove from loved' });
    expect(unlove).toHaveAttribute('aria-pressed', 'true');
    await user.click(unlove);
    await waitFor(() => expect(stored('video')?.mark).toBeUndefined());
  });

  it('forgets an item, restores it, and deletes it only when forgotten', async () => {
    const { user } = open([VIDEO()], 'video');
    await heading('Sleep and memory');
    expect(screen.queryByRole('button', { name: 'Delete item' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Forget' }));
    await waitFor(() => expect(stored('video')?.mark).toBe('forgotten'));
    expect(await screen.findByText('Forgotten', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(await screen.findByText('1 item forgotten')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(stored('video')?.mark).toBeUndefined());
    await user.click(await screen.findByRole('button', { name: 'Forget' }));

    await user.click(await screen.findByRole('button', { name: 'Delete item' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this item?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(stored('video')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Delete item' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Delete this item?' })).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(stored('video')).toBeUndefined());
    expect(await screen.findByText('1 item deleted.')).toBeInTheDocument();
  });

  it('moves the item to another catalog from the reader', async () => {
    const { user } = open([makeItem({ id: 'x', title: 'Movable' })], 'x', {
      [CATALOGS_KEY]: [{ id: 'work', name: 'Work', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    await heading('Movable');
    // The first "Recents" is the breadcrumb; the second is the catalog button of the item.
    await user.click(screen.getAllByRole('button', { name: /Recents/ })[1]!);
    await user.click(await screen.findByRole('menuitem', { name: 'Work' }));
    await waitFor(() => expect(stored('x')?.catalogId).toBe('work'));
    expect(await screen.findByText('Moved to Work.')).toBeInTheDocument();
  });

  it('shows the library again when the open item is deleted elsewhere', async () => {
    open([VIDEO(), makeItem({ id: 'other', title: 'Other' })], 'video');
    await heading('Sleep and memory');
    fake.storage.local.remove(['item:video']);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2, name: 'Sleep and memory' })).not.toBeInTheDocument(),
    );
  });

  it('shows the library when the link points to an item that does not exist', async () => {
    open([makeItem({ id: 'other', title: 'Other' })], 'missing');
    expect(await screen.findByRole('heading', { name: 'Catalogs' })).toBeInTheDocument();
  });
});
