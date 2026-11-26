// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedItem } from '../../../shared/types';
import { installDashboardEnvironment, makeItem, renderApp } from '../../test/render';
import { App } from '../App';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function seed(items: SavedItem[]) {
  const fake = installDashboardEnvironment();
  for (const item of items) fake.storage.local.store.set(`item:${item.id}`, item);
  return fake;
}

const rowTitles = () =>
  within(screen.getByRole('listbox', { name: 'Saved items' }))
    .queryAllByRole('option')
    .map((row) => row.querySelector('h4')?.textContent ?? '');

const LIBRARY = () => [
  makeItem({
    id: 'a',
    title: 'Sleep and memory',
    type: 'youtube_transcript',
    content: 'Sleep consolidates memory during the night.',
    timestamp: daysAgo(2),
    meta: { channel: 'Neuro Lab' },
  }),
  makeItem({
    id: 'b',
    title: 'Sourdough basics',
    type: 'webpage_text',
    content: 'Flour, water and salt make a starter.',
    timestamp: daysAgo(20),
    mark: 'loved',
  }),
  makeItem({
    id: 'c',
    title: 'Cold brew guide',
    type: 'youtube_transcript',
    content: 'Coarse coffee grounds steep in cold water.',
    timestamp: daysAgo(200),
    meta: { channel: 'Coffee Hour' },
  }),
  makeItem({
    id: 'd',
    title: 'Old forgotten note',
    type: 'webpage_text',
    content: 'Nothing important here.',
    timestamp: daysAgo(5),
    mark: 'forgotten',
  }),
];

describe('library filtering', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the library and hides forgotten items by default', async () => {
    seed(LIBRARY());
    renderApp(<App />);
    await screen.findByText('Sleep and memory');
    expect(rowTitles()).toEqual(['Sleep and memory', 'Sourdough basics', 'Cold brew guide']);
    expect(screen.queryByText('Old forgotten note')).not.toBeInTheDocument();
  });

  it('narrows the list as you type and highlights the match', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'coffee');
    await waitFor(() => expect(rowTitles()).toEqual(['Cold brew guide']));
    // The snippet shows where the transcript matched.
    expect(screen.getByText('coffee', { selector: 'mark' })).toBeInTheDocument();
  });

  it('shows an empty state with a reset button when nothing matches', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'zzzzqqq');
    expect(await screen.findByText(/No items match/)).toHaveTextContent('zzzzqqq');

    await user.click(screen.getByRole('button', { name: 'Reset search and filters' }));
    await waitFor(() => expect(rowTitles()).toHaveLength(3));
    expect(screen.getByRole('textbox', { name: 'Search library' })).toHaveValue('');
  });

  it('clears the search with the clear button and Escape', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');
    const search = screen.getByRole('textbox', { name: 'Search library' });

    await user.type(search, 'sourdough');
    await waitFor(() => expect(rowTitles()).toEqual(['Sourdough basics']));
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(rowTitles()).toHaveLength(3));

    await user.type(search, 'sourdough{Escape}');
    expect(search).toHaveValue('');
  });

  it('focuses the search box with the / hotkey', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');
    await user.keyboard('/');
    expect(screen.getByRole('textbox', { name: 'Search library' })).toHaveFocus();
  });

  it('filters by mark: Loved and Forgotten', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    await user.click(screen.getByRole('button', { name: /^Loved/ }));
    await waitFor(() => expect(rowTitles()).toEqual(['Sourdough basics']));
    expect(screen.getByRole('button', { name: 'Remove filter Loved' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Forgotten/ }));
    await waitFor(() => expect(rowTitles()).toEqual(['Old forgotten note']));
  });

  it('filters by type when the library has both types', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    await user.click(screen.getByRole('button', { name: 'YouTube' }));
    await waitFor(() => expect(rowTitles()).toEqual(['Sleep and memory', 'Cold brew guide']));

    await user.click(screen.getByRole('button', { name: 'Web pages' }));
    await waitFor(() => expect(rowTitles()).toEqual(['Sourdough basics']));
  });

  it('hides the type filter when the library has one type', async () => {
    seed([makeItem({ id: 'x', title: 'Only page', type: 'webpage_text' })]);
    renderApp(<App />);
    await screen.findByText('Only page');
    expect(screen.queryByRole('button', { name: 'YouTube', pressed: true })).not.toBeInTheDocument();
  });

  it('filters by date range', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    await user.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(rowTitles()).toEqual(['Sleep and memory']));

    await user.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(rowTitles()).toEqual(['Sleep and memory', 'Sourdough basics']));

    await user.click(screen.getByRole('button', { name: 'Year' }));
    await waitFor(() => expect(rowTitles()).toHaveLength(3));
  });

  it('filters by channel and removes the filter again', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    // The channel shows as a facet in the filter panel and as a badge on the row.
    await user.click((await screen.findAllByRole('button', { name: /^Neuro Lab/, pressed: false }))[0]!);
    await waitFor(() => expect(rowTitles()).toEqual(['Sleep and memory']));
    expect(screen.getAllByRole('button', { name: /^Neuro Lab/, pressed: true }).length).toBeGreaterThan(0);

    // Other channels stay visible, so several can be combined (any of).
    await user.click((await screen.findAllByRole('button', { name: /^Coffee Hour/, pressed: false }))[0]!);
    await waitFor(() => expect(rowTitles()).toEqual(['Sleep and memory', 'Cold brew guide']));

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(rowTitles()).toHaveLength(3));
  });

  it('combines filters with the search (AND)', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    await user.click(screen.getByRole('button', { name: 'YouTube' }));
    await user.type(screen.getByRole('textbox', { name: 'Search library' }), 'water');
    await waitFor(() => expect(rowTitles()).toEqual(['Cold brew guide']));
  });

  it('clears every filter with "Clear filters"', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    await user.click(screen.getByRole('button', { name: /^Loved/ }));
    await user.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove filter 7 days' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Remove filter Loved' })).toBeInTheDocument();
    expect(screen.getByText(/No items match/)).toHaveTextContent('with these filters');

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(rowTitles()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /^Remove filter/ })).not.toBeInTheDocument();
  });

  it('shows removable pills for active filters when the panel is collapsed', async () => {
    seed(LIBRARY());
    const { user } = renderApp(<App />);
    await screen.findByText('Sleep and memory');

    await user.click(screen.getByRole('button', { name: /^Loved/ }));
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Filters/ })).toHaveAttribute('aria-expanded', 'false'),
    );
    await user.click(await screen.findByRole('button', { name: 'Remove filter Loved' }));
    await waitFor(() => expect(rowTitles()).toHaveLength(3));
  });

  it('shows the "empty library" screen when there are no items', async () => {
    seed([]);
    renderApp(<App />);
    expect(await screen.findByText(/no (saved )?items|library is empty|nothing saved/i)).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
