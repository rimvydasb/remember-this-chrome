import { expect, test, LLM_URL } from './fixtures';

const storedLlm = (page: import('@playwright/test').Page) =>
  page.evaluate(
    async () => ((await chrome.storage.local.get('settings')).settings as { llm: Record<string, unknown> }).llm,
  );

test.describe('Settings', () => {
  test('tests the connection, picks a model and saves it', async ({ dashboard }) => {
    await dashboard.getByRole('button', { name: 'Settings' }).click();
    const dialog = dashboard.getByRole('dialog');
    await expect(dialog.getByLabel('Server address')).toHaveValue(LLM_URL);
    await expect(dialog.getByText('No changes.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

    await dialog.getByRole('button', { name: 'Test & list' }).click();
    await expect(dialog.getByText('Connected')).toBeVisible();
    await dialog.getByText('mock-model-b').click();
    await expect(dialog.getByLabel('Model')).toHaveValue('mock-model-b');
    await expect(dialog.getByText('You have unsaved changes.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dashboard.getByText('Settings saved.')).toBeVisible();
    await expect(dialog).toBeHidden();
    expect((await storedLlm(dashboard)).model).toBe('mock-model-b');
  });

  test('the saved model is used by the next summary', async ({ dashboard, llm }) => {
    await dashboard.getByRole('button', { name: 'Settings' }).click();
    const dialog = dashboard.getByRole('dialog');
    await dialog.getByLabel('Model').fill('my-model');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await dashboard.getByRole('option', { name: /Rust ownership explained/ }).click();
    await dashboard.getByRole('button', { name: 'Generate summary' }).click();
    await expect(dashboard.getByText('A mocked summary.')).toBeVisible();
    expect(llm.completions).toHaveLength(1);
    expect(llm.completions[0]).toMatchObject({ model: 'my-model' });
  });

  test('cancel discards the changes', async ({ dashboard }) => {
    await dashboard.getByRole('button', { name: 'Settings' }).click();
    const dialog = dashboard.getByRole('dialog');
    await dialog.getByLabel('Server address').fill('http://elsewhere.test:9');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect((await storedLlm(dashboard)).baseUrl).toBe(LLM_URL);

    await dashboard.getByRole('button', { name: 'Settings' }).click();
    await expect(dashboard.getByRole('dialog').getByLabel('Server address')).toHaveValue(LLM_URL);
  });

  test('turns on LLM tagging on the Tagging tab', async ({ dashboard }) => {
    await dashboard.getByRole('button', { name: 'Settings' }).click();
    const dialog = dashboard.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Tagging' }).click();
    const toggle = dialog.getByRole('switch', { name: 'Use LLM for tagging' });
    await expect(toggle).not.toBeChecked(); // The fixture turns it off, so tests do not trigger tagging.
    await toggle.check({ force: true });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    expect((await storedLlm(dashboard)).useForTags).toBe(true);
  });

  test('shows a failed connection', async ({ dashboard, llm }) => {
    llm.models = [];
    await dashboard.getByRole('button', { name: 'Settings' }).click();
    const dialog = dashboard.getByRole('dialog');
    await dialog.getByLabel('Server address').fill('not a url');
    await dialog.getByRole('button', { name: 'Test & list' }).click();
    await expect(dialog.getByText('Connection failed')).toBeVisible();
  });
});
