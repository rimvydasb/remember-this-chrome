// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS_KEY } from '../../shared/catalogs';
import { buildExportPayload } from '../../shared/importExport';
import type { SavedItem } from '../../shared/types';
import { installDashboardEnvironment, makeItem, renderApp } from '../../test/render';
import { App } from '../App';

const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
vi.mock('../../ui/download', () => download);

let fake: ReturnType<typeof installDashboardEnvironment>;
const stored = (id: string) => fake.storage.local.store.get(`item:${id}`) as SavedItem | undefined;
const storedIds = () =>
  [...fake.storage.local.store.keys()]
    .filter((k) => k.startsWith('item:'))
    .map((k) => k.slice(5))
    .sort();
const rowTitles = () =>
  within(screen.getByRole('listbox', { name: 'Saved items' }))
    .queryAllByRole('option')
    .map((row) => row.querySelector('p')?.textContent ?? '');

function open(items: SavedItem[]) {
  fake = installDashboardEnvironment();
  for (const item of items) fake.storage.local.store.set(`item:${item.id}`, item);
  window.location.hash = '';
  return renderApp(<App />);
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const jsonFile = (value: unknown, name = 'library.json') =>
  new File([typeof value === 'string' ? value : JSON.stringify(value)], name, { type: 'application/json' });

beforeEach(() => {
  vi.unstubAllGlobals();
  download.downloadTextFile.mockReset();
  localStorage.clear();
});

describe('import', () => {
  const incoming = () => [
    makeItem({ id: 'new1', title: 'Imported one', timestamp: '2026-05-01T00:00:00.000Z' }),
    makeItem({ id: 'new2', title: 'Imported two', timestamp: '2026-05-02T00:00:00.000Z' }),
  ];

  it('merges the file into the library', async () => {
    const { user } = open([makeItem({ id: 'mine', title: 'My item' })]);
    await screen.findByText('My item');
    await user.upload(fileInput(), jsonFile(buildExportPayload(incoming())));

    const dialog = await screen.findByRole('dialog', { name: 'Import library' });
    expect(within(dialog).getByText('library.json')).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/contains 2 valid items/);
    await user.click(within(dialog).getByRole('button', { name: 'Merge into library' }));

    expect(await screen.findByText('Import complete')).toBeInTheDocument();
    expect(screen.getByText('2 added · 0 updated')).toBeInTheDocument();
    expect(storedIds()).toEqual(['mine', 'new1', 'new2']);
    await waitFor(() => expect(rowTitles()).toHaveLength(3));
  });

  it('replaces the library when asked, and warns first', async () => {
    const { user } = open([makeItem({ id: 'mine', title: 'My item' })]);
    await screen.findByText('My item');
    await user.upload(fileInput(), jsonFile(buildExportPayload(incoming())));

    const dialog = await screen.findByRole('dialog', { name: 'Import library' });
    await user.click(within(dialog).getByRole('radio', { name: /Replace/ }));
    expect(within(dialog).getByText(/Replace the current library \(1 items\)/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Replace library' }));

    expect(await screen.findByText(/1 removed/)).toBeInTheDocument();
    expect(storedIds()).toEqual(['new1', 'new2']);
  });

  it('changes nothing when the dialog is cancelled', async () => {
    const { user } = open([makeItem({ id: 'mine', title: 'My item' })]);
    await screen.findByText('My item');
    await user.upload(fileInput(), jsonFile(buildExportPayload(incoming())));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Import library' })).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(storedIds()).toEqual(['mine']);
  });

  it('imports the catalogs of the file, and the items in them', async () => {
    const { user } = open([makeItem({ id: 'mine', title: 'My item' })]);
    await screen.findByText('My item');
    const catalog = { id: 'c1', name: 'Cooking', createdAt: '2026-01-01T00:00:00.000Z' };
    await user.upload(
      fileInput(),
      jsonFile(buildExportPayload([makeItem({ id: 'soup', title: 'Soup', catalogId: 'c1' })], new Date(), [catalog])),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Import library' });
    expect(dialog).toHaveTextContent(/contains 1 valid item and 1 catalog\./);
    await user.click(within(dialog).getByRole('button', { name: 'Merge into library' }));
    await waitFor(() => expect(stored('soup')?.catalogId).toBe('c1'));
    expect(fake.storage.local.store.get(CATALOGS_KEY)).toEqual([catalog]);
  });

  it('skips invalid records and says so', async () => {
    const { user } = open([makeItem({ id: 'mine', title: 'My item' })]);
    await screen.findByText('My item');
    await user.upload(fileInput(), jsonFile(buildExportPayload([...incoming(), { nonsense: true } as never])));
    const dialog = await screen.findByRole('dialog', { name: 'Import library' });
    expect(within(dialog).getByText(/1 invalid record will be skipped/)).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/contains 2 valid items/);
  });

  it('refuses a file that is not a library export', async () => {
    const { user } = open([makeItem({ id: 'mine', title: 'My item' })]);
    await screen.findByText('My item');
    await user.upload(fileInput(), jsonFile('this is not json', 'broken.json'));
    expect(await screen.findByText('Cannot import this file')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Import library' })).not.toBeInTheDocument();
    expect(storedIds()).toEqual(['mine']);
  });

  it('imports into an empty library from the empty screen', async () => {
    const { user } = open([]);
    await screen.findByText('Your library is empty');
    await user.upload(fileInput(), jsonFile(buildExportPayload(incoming())));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Import library' })).getByRole('button', {
        name: 'Merge into library',
      }),
    );
    await waitFor(() => expect(storedIds()).toEqual(['new1', 'new2']));
    expect(await screen.findByRole('heading', { name: 'Catalogs' })).toBeInTheDocument();
  });
});

describe('export and clear', () => {
  it('exports the library and the catalogs as JSON', async () => {
    fake = installDashboardEnvironment();
    const catalog = { id: 'c1', name: 'Cooking', createdAt: '2026-01-01T00:00:00.000Z' };
    fake.storage.local.store.set(CATALOGS_KEY, [catalog]);
    fake.storage.local.store.set('item:a', makeItem({ id: 'a', title: 'Soup', catalogId: 'c1' }));
    const { user } = renderApp(<App />);
    await screen.findByText('Soup');

    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    await waitFor(() => expect(download.downloadTextFile).toHaveBeenCalledTimes(1));
    const [name, text, type] = download.downloadTextFile.mock.calls[0]!;
    expect(name).toMatch(/^remember-this-library-\d{4}-\d{2}-\d{2}\.json$/);
    expect(type).toBe('application/json');
    const payload = JSON.parse(text);
    expect(payload).toMatchObject({ format: 'remember-this-library', count: 1, catalogs: [catalog] });
    expect(payload.items[0].id).toBe('a');
    expect(await screen.findByText('Library exported')).toBeInTheDocument();
  });

  it('disables the export on an empty library', async () => {
    open([]);
    await screen.findByText('Your library is empty');
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
  });

  it('exports all transcripts as Markdown, without the web pages', async () => {
    const { user } = open([
      makeItem({ id: 'v', title: 'A video', type: 'youtube_transcript', content: 'Video words.' }),
      makeItem({ id: 'p', title: 'A page', type: 'webpage_text', content: 'Page words.' }),
    ]);
    await screen.findByText('A video');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Export all transcripts as Markdown/ }));
    expect(download.downloadTextFile).toHaveBeenCalledTimes(1);
    const text = download.downloadTextFile.mock.calls[0]![1] as string;
    expect(text).toContain('Video words.');
    expect(text).not.toContain('Page words.');
  });

  it('clears the library after confirmation, and keeps the catalogs and settings', async () => {
    fake = installDashboardEnvironment();
    fake.storage.local.store.set(CATALOGS_KEY, [{ id: 'c1', name: 'Cooking', createdAt: '2026-01-01T00:00:00.000Z' }]);
    fake.storage.local.store.set('settings', { llm: {} });
    fake.storage.local.store.set('item:a', makeItem({ id: 'a', title: 'Soup' }));
    const { user } = renderApp(<App />);
    await screen.findByText('Soup');

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Clear library/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Clear the entire library?' });
    expect(within(dialog).getByText(/All 1 item will be permanently deleted/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(storedIds()).toEqual(['a']);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Clear library/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete everything' }));
    await waitFor(() => expect(storedIds()).toEqual([]));
    expect(fake.storage.local.store.has(CATALOGS_KEY)).toBe(true);
    expect(fake.storage.local.store.has('settings')).toBe(true);
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
  });
});

describe('bulk actions', () => {
  const items = () => [
    makeItem({ id: 'a', title: 'Alpha', timestamp: '2026-01-03T00:00:00.000Z' }),
    makeItem({ id: 'b', title: 'Beta', timestamp: '2026-01-02T00:00:00.000Z' }),
    makeItem({ id: 'c', title: 'Gamma', timestamp: '2026-01-01T00:00:00.000Z' }),
  ];
  const select = async (user: ReturnType<typeof open>['user'], ...titles: string[]) => {
    for (const title of titles) await user.click(screen.getByRole('checkbox', { name: `Select ${title}` }));
  };

  it('selects all visible items and clears the selection', async () => {
    const { user } = open(items());
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible items' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible items' }));
    await waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());

    await select(user, 'Alpha');
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
  });

  it('selects only the items that match the search', async () => {
    const { user } = open(items());
    await screen.findByText('Alpha');
    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'beta');
    await waitFor(() => expect(rowTitles()).toEqual(['Beta']));
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible items' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('forgets the selected items, which then show under Forgotten', async () => {
    const { user } = open(items());
    await screen.findByText('Alpha');
    await select(user, 'Alpha', 'Beta');
    await user.click(screen.getByRole('button', { name: 'Forget' }));

    await waitFor(() => expect(rowTitles()).toEqual(['Gamma']));
    expect(stored('a')?.mark).toBe('forgotten');
    expect(await screen.findByText('2 items forgotten')).toBeInTheDocument();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Forgotten' }));
    await waitFor(() => expect(rowTitles()).toEqual(['Alpha', 'Beta']));
  });

  it('restores forgotten items', async () => {
    const { user } = open([makeItem({ id: 'a', title: 'Alpha', mark: 'forgotten' })]);
    await screen.findByRole('radio', { name: 'Forgotten' });
    await user.click(screen.getByRole('radio', { name: 'Forgotten' }));
    await select(user, 'Alpha');
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(stored('a')?.mark).toBeUndefined());
  });

  it('deletes only the forgotten items of a mixed selection', async () => {
    const { user } = open([
      makeItem({ id: 'a', title: 'Alpha', timestamp: '2026-01-03T00:00:00.000Z' }),
      makeItem({ id: 'b', title: 'Beta', timestamp: '2026-01-02T00:00:00.000Z', mark: 'forgotten' }),
    ]);
    await screen.findByText('Alpha');
    // Forgotten items are hidden by default: show all by switching to Forgotten, select, then check the Delete button.
    await user.click(screen.getByRole('radio', { name: 'Forgotten' }));
    await select(user, 'Beta');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this item?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(storedIds()).toEqual(['a']));
  });

  it('has no Delete button while no selected item is forgotten', async () => {
    const { user } = open(items());
    await screen.findByText('Alpha');
    await select(user, 'Alpha');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('exports the selected items as Markdown', async () => {
    const { user } = open(items());
    await screen.findByText('Alpha');
    await select(user, 'Beta');
    await user.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(download.downloadTextFile).toHaveBeenCalledTimes(1);
    expect(download.downloadTextFile.mock.calls[0]![1]).toContain('Beta');
    expect(download.downloadTextFile.mock.calls[0]![1]).not.toContain('Alpha');
  });

  it('drops the selection of an item that was deleted elsewhere', async () => {
    const { user } = open(items());
    await screen.findByText('Alpha');
    await select(user, 'Alpha', 'Beta');
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await fake.storage.local.remove(['item:a']);
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });
});

describe('topic filters', () => {
  const tagged = (id: string, title: string, tags: string[], day: number) =>
    makeItem({
      id,
      title,
      timestamp: `2026-01-0${day}T00:00:00.000Z`,
      aiTags: { tags, createdAt: '2026-01-01T00:00:00.000Z' },
    });
  const topic = (name: string, pressed = false) =>
    screen.getAllByRole('button', { name: new RegExp(`^${name}`), pressed })[0]!;

  it('combines topics with AND', async () => {
    const { user } = open([
      tagged('a', 'Alpha', ['sleep', 'memory'], 3),
      tagged('b', 'Beta', ['sleep', 'coffee'], 2),
      tagged('c', 'Gamma', ['tea'], 1),
    ]);
    await screen.findByText('Alpha');

    await user.click(topic('sleep'));
    await waitFor(() => expect(rowTitles()).toEqual(['Alpha', 'Beta']));
    await user.click(topic('memory'));
    await waitFor(() => expect(rowTitles()).toEqual(['Alpha']));
    expect(screen.getByText('2 filters active')).toBeInTheDocument();
    await user.click(topic('memory', true));
    await waitFor(() => expect(rowTitles()).toEqual(['Alpha', 'Beta']));
  });

  it('keeps a selected topic visible, so it can be removed, when no result has it', async () => {
    const { user } = open([tagged('a', 'Alpha', ['sleep'], 1)]);
    await screen.findByText('Alpha');
    await user.click(topic('sleep'));
    // The item was saved long ago, so the last 7 days leave no result.
    await user.click(screen.getByRole('radio', { name: '7 days' }));
    await waitFor(() => expect(rowTitles()).toEqual([]));
    await user.click(topic('sleep', true));
    await user.click(screen.getByRole('radio', { name: 'Any time' }));
    await waitFor(() => expect(rowTitles()).toEqual(['Alpha']));
  });

  it('expands a long topic list and finds a topic that is not shown', async () => {
    const letters = 'abcdefghij'.split('').map((c) => `topic ${c}`);
    const numbers = Array.from({ length: 10 }, (_, i) => `number ${i + 1}`);
    const { user } = open([tagged('a', 'Alpha', letters, 2), tagged('c', 'Gamma', numbers, 1)]);
    await screen.findByText('Alpha');

    await user.click(await screen.findByRole('button', { name: /^\+\d+ more$/ }));
    await user.click(await screen.findByRole('button', { name: 'Show less' }));

    await user.click(screen.getAllByLabelText('Find a topic')[0]!);
    await user.click(await screen.findByRole('option', { name: /^number 10/ }));
    await waitFor(() => expect(rowTitles()).toEqual(['Gamma']));
  });
});
