// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS_KEY, RECENTS_ID, type Catalog } from '../../../shared/catalogs';
import type { SavedItem } from '../../../shared/types';
import { installDashboardEnvironment, makeItem, renderApp } from '../../test/render';
import { App } from '../App';

const catalog = (id: string, name: string): Catalog => ({ id, name, createdAt: '2026-01-01T00:00:00.000Z' });
const COOKING = catalog('cooking', 'Cooking');
const WORK = catalog('work', 'Work');

type Fake = ReturnType<typeof installDashboardEnvironment>;
let fake: Fake;

function seed(items: SavedItem[], catalogs: Catalog[] = [COOKING, WORK]) {
  fake = installDashboardEnvironment();
  for (const item of items) fake.storage.local.store.set(`item:${item.id}`, item);
  if (catalogs.length > 0) fake.storage.local.store.set(CATALOGS_KEY, catalogs);
}

const stored = (id: string) => fake.storage.local.store.get(`item:${id}`) as SavedItem;
const storedCatalogs = () => (fake.storage.local.store.get(CATALOGS_KEY) ?? []) as Catalog[];

const ITEMS = () => [
  makeItem({ id: 'soup', title: 'Soup recipe', catalogId: 'cooking' }),
  makeItem({ id: 'bread', title: 'Bread recipe', catalogId: 'cooking' }),
  makeItem({ id: 'plan', title: 'Quarterly plan', catalogId: 'work' }),
  makeItem({ id: 'misc', title: 'Random note' }),
];

const card = (name: RegExp) => screen.findByRole('button', { name });
const rows = () => within(screen.getByRole('listbox', { name: 'Saved items' })).queryAllByRole('option');
const rowTitles = () => rows().map((row) => row.querySelector('p')?.textContent ?? '');

describe('Catalogs home', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  it('shows Recents first, then the catalogs with item counts', async () => {
    seed(ITEMS());
    renderApp(<App />);
    expect(await screen.findByRole('heading', { name: 'Catalogs' })).toBeInTheDocument();

    const cards = screen.getAllByRole('button', { name: /^Open / }).map((c) => c.getAttribute('aria-label'));
    expect(cards).toEqual(['Open Recents, 1 items', 'Open Cooking, 2 items', 'Open Work, 1 items']);
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows only Recents, with a hint, when there are no catalogs', async () => {
    seed([], []);
    renderApp(<App />);
    // An empty library shows the empty screen instead of the catalogs.
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
  });

  it('opens a catalog and shows only its items', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await user.click(await card(/Open Cooking/));

    expect(await screen.findByRole('heading', { name: 'Cooking' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#catalog=cooking');
    await waitFor(() => expect(rowTitles().sort()).toEqual(['Bread recipe', 'Soup recipe']));
    expect(within(screen.getByRole('main')).getByText('2 items')).toBeInTheDocument();
  });

  it('opens a catalog from the keyboard', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    (await card(/Open Work/)).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Work' })).toBeInTheDocument();
  });

  it('opens the catalog from a deep link', async () => {
    window.location.hash = '#catalog=work';
    seed(ITEMS());
    renderApp(<App />);
    expect(await screen.findByRole('heading', { name: 'Work' })).toBeInTheDocument();
    await waitFor(() => expect(rowTitles()).toEqual(['Quarterly plan']));
  });

  it('goes back home from the breadcrumb and the logo', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await user.click(await card(/Open Work/));
    await screen.findByRole('heading', { name: 'Work' });

    await user.click(screen.getByRole('button', { name: 'Catalogs' }));
    expect(await screen.findByRole('heading', { name: 'Catalogs' })).toBeInTheDocument();

    await user.click(await card(/Open Work/));
    await user.click(screen.getByRole('button', { name: 'Catalogs home' }));
    expect(await screen.findByRole('heading', { name: 'Catalogs' })).toBeInTheDocument();
  });

  it('scopes the list with the catalog selector', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await screen.findByRole('heading', { name: 'Catalogs' });
    await waitFor(() => expect(rowTitles()).toHaveLength(4));

    await user.click(screen.getAllByLabelText('Show items from')[0]!);
    await user.click(await screen.findByRole('option', { name: 'Work (1)' }));
    await waitFor(() => expect(rowTitles()).toEqual(['Quarterly plan']));

    await user.click(screen.getAllByLabelText('Show items from')[0]!);
    await user.click(await screen.findByRole('option', { name: 'All catalogs (4)' }));
    await waitFor(() => expect(rowTitles()).toHaveLength(4));
  });

  it('treats an item in a deleted catalog as Recents', async () => {
    seed([makeItem({ id: 'x', title: 'Orphan', catalogId: 'gone' })]);
    renderApp(<App />);
    expect(await card(/Open Recents, 1 items/)).toBeInTheDocument();
  });

  it('narrows the items of a catalog with the search, and can reset it', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await user.click(await card(/Open Cooking/));
    await screen.findByRole('heading', { name: 'Cooking' });

    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'soup');
    expect(await screen.findByText('1 of 2 items match')).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Search library' }));
    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'nonexistentword');
    expect(await screen.findByText('Nothing in this catalog matches the search and filters.')).toBeInTheDocument();
    const [reset] = screen.getAllByRole('button', { name: 'Reset search and filters' });
    await user.click(reset!);
    expect(await within(screen.getByRole('main')).findByText('2 items')).toBeInTheDocument();
  });

  it('shows an empty catalog with a hint', async () => {
    seed([makeItem({ id: 'x', title: 'Only item' })]);
    const { user } = renderApp(<App />);
    await user.click(await card(/Open Work, 0 items/));
    expect(await screen.findByText('This catalog is empty')).toBeInTheDocument();
  });
});

describe('Catalog management', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  it('creates a catalog', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await screen.findByRole('heading', { name: 'Catalogs' });

    await user.click(screen.getAllByRole('button', { name: /New catalog/ })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'New catalog' });
    const create = within(dialog).getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Travel');
    await user.click(create);

    await waitFor(() => expect(storedCatalogs().map((c) => c.name)).toContain('Travel'));
    expect(await card(/Open Travel, 0 items/)).toBeInTheDocument();
    expect(await screen.findByText('Catalog “Travel” created.')).toBeInTheDocument();
  });

  it('refuses an empty name and a duplicate name', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await screen.findByRole('heading', { name: 'Catalogs' });
    await user.click(screen.getAllByRole('button', { name: /New catalog/ })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'New catalog' });

    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'cooking');
    expect(await within(dialog).findByText('A catalog with this name already exists')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();

    await user.clear(within(dialog).getByRole('textbox', { name: /Name/ }));
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(storedCatalogs()).toHaveLength(2);
  });

  it('renames a catalog from its card menu', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await user.click(await screen.findByRole('button', { name: 'Cooking actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Rename/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Rename catalog' });
    const name = within(dialog).getByRole('textbox', { name: /Name/ });
    expect(name).toHaveValue('Cooking');
    // Unchanged name: nothing to save.
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeDisabled();

    await user.clear(name);
    await user.type(name, 'Kitchen');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    await waitFor(() =>
      expect(
        storedCatalogs()
          .map((c) => c.name)
          .sort(),
      ).toEqual(['Kitchen', 'Work']),
    );
    expect(await card(/Open Kitchen, 2 items/)).toBeInTheDocument();
  });

  it('has no menu on Recents, which cannot be renamed or deleted', async () => {
    seed(ITEMS());
    renderApp(<App />);
    await card(/Open Recents/);
    expect(screen.queryByRole('button', { name: 'Recents actions' })).not.toBeInTheDocument();
  });

  it('deletes a catalog after confirmation and moves its items to Recents', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await user.click(await screen.findByRole('button', { name: 'Cooking actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));

    const dialog = await screen.findByRole('dialog', { name: /Delete “Cooking”\?/ });
    expect(within(dialog).getByText('Its 2 items will move to Recents. No items are deleted.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete catalog' }));

    await waitFor(() => expect(storedCatalogs().map((c) => c.id)).toEqual(['work']));
    expect(stored('soup').catalogId).toBeUndefined();
    expect(stored('bread').catalogId).toBeUndefined();
    expect(await card(/Open Recents, 3 items/)).toBeInTheDocument();
    expect(await screen.findByText(/Catalog deleted\. 2 items moved to Recents\./)).toBeInTheDocument();
  });

  it('keeps the catalog when deletion is cancelled', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await user.click(await screen.findByRole('button', { name: 'Cooking actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    const dialog = await screen.findByRole('dialog', { name: /Delete/ });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(storedCatalogs()).toHaveLength(2);
  });

  it('renames and deletes from the catalog page, and returns home after deleting', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await user.click(await card(/Open Work/));
    await screen.findByRole('heading', { name: 'Work' });

    await user.click(screen.getByRole('button', { name: 'More catalog actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Delete catalog/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete catalog' }));

    expect(await screen.findByRole('heading', { name: 'Catalogs' })).toBeInTheDocument();
    expect(storedCatalogs().map((c) => c.id)).toEqual(['cooking']);
  });

  it('moves the selected items to another catalog', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await screen.findByRole('heading', { name: 'Catalogs' });
    await waitFor(() => expect(rowTitles()).toHaveLength(4));

    await user.click(screen.getByRole('checkbox', { name: 'Select Random note' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Quarterly plan' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Move' }));
    // The items are in different catalogs, so every catalog is a target.
    await user.click(await screen.findByRole('menuitem', { name: 'Cooking' }));

    await waitFor(() => expect(stored('misc').catalogId).toBe('cooking'));
    expect(stored('plan').catalogId).toBe('cooking');
    expect(await screen.findByText('2 items moved to Cooking.')).toBeInTheDocument();
    // The selection is cleared.
    await waitFor(() => expect(screen.queryByText('2 selected')).not.toBeInTheDocument());
  });

  it('moves items to a new catalog in one step', async () => {
    seed(ITEMS());
    const { user } = renderApp(<App />);
    await waitFor(() => expect(rows()).toHaveLength(4));
    await user.click(screen.getByRole('checkbox', { name: 'Select Random note' }));

    await user.click(screen.getByRole('button', { name: 'Move' }));
    await user.click(await screen.findByRole('menuitem', { name: /New catalog/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New catalog' });
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Ideas');
    await user.click(within(dialog).getByRole('button', { name: 'Create and move' }));

    await waitFor(() => expect(storedCatalogs().map((c) => c.name)).toContain('Ideas'));
    const ideas = storedCatalogs().find((c) => c.name === 'Ideas')!;
    await waitFor(() => expect(stored('misc').catalogId).toBe(ideas.id));
  });

  it('moves items dropped on a catalog card', async () => {
    seed(ITEMS());
    renderApp(<App />);
    const target = await card(/Open Work/);
    const data = new Map<string, string>([['application/x-remember-this-items', JSON.stringify(['misc'])]]);
    const dataTransfer = {
      types: ['application/x-remember-this-items'],
      getData: (type: string) => data.get(type) ?? '',
      dropEffect: '',
    };
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.dragOver(target, { dataTransfer });
    expect(await screen.findByText('Move here')).toBeInTheDocument();
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(stored('misc').catalogId).toBe('work'));
    expect(RECENTS_ID).toBe('recents');
  });
});
