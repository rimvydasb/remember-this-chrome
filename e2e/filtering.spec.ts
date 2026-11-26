import { expect, test } from './fixtures';

test.describe('Filtering videos', () => {
  test('searches by title and clears the search', async ({ dashboard }) => {
    const list = dashboard.getByRole('listbox', { name: 'Saved items' });
    await expect(list.getByRole('option')).toHaveCount(4);

    await dashboard.getByLabel('Search library').fill('sourdough');
    await expect(list.getByRole('option')).toHaveCount(1);
    await expect(list.getByRole('option', { name: /Sourdough bread/ })).toBeVisible();

    await dashboard.getByRole('button', { name: 'Clear search' }).click();
    await expect(list.getByRole('option')).toHaveCount(4);
  });

  test('searches inside the transcript', async ({ dashboard }) => {
    await dashboard.getByLabel('Search library').fill('borrowing');
    const options = dashboard.getByRole('option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('Rust ownership explained');
  });

  test('shows a message and resets when nothing matches', async ({ dashboard }) => {
    await dashboard.getByLabel('Search library').fill('zzzz-no-such-text');
    await expect(dashboard.getByText(/No items match/)).toBeVisible();
    await dashboard.getByRole('button', { name: 'Reset search and filters' }).click();
    await expect(dashboard.getByRole('option')).toHaveCount(4);
  });

  test('filters by type', async ({ dashboard }) => {
    // The Type group starts folded.
    await dashboard.getByRole('button', { name: /^Type/ }).click();
    await dashboard.getByRole('button', { name: 'YouTube', exact: true }).click();
    await expect(dashboard.getByRole('option')).toHaveCount(3);
    await expect(dashboard.getByText('A page about gardening')).toHaveCount(0);

    await dashboard.getByRole('button', { name: 'Web pages', exact: true }).click();
    await expect(dashboard.getByRole('option')).toHaveCount(1);
  });

  test('filters by channel and removes the filter from its pill', async ({ dashboard }) => {
    await dashboard
      .getByRole('button', { name: /Code Corner/ })
      .first()
      .click();
    await expect(dashboard.getByRole('option')).toHaveCount(2);
    await expect(dashboard.getByText('Active', { exact: true })).toBeVisible();

    await dashboard.getByRole('button', { name: 'Clear all' }).click();
    await expect(dashboard.getByRole('option')).toHaveCount(4);
  });

  test('combines a topic filter with the search', async ({ dashboard }) => {
    await dashboard.getByRole('button', { name: /^rust/ }).first().click();
    await expect(dashboard.getByRole('option')).toHaveCount(2);

    await dashboard.getByLabel('Search library').fill('lifetimes');
    await expect(dashboard.getByRole('option')).toHaveCount(1);
    await expect(dashboard.getByRole('option').first()).toContainText('Lifetimes in Rust');
  });
});
