import { expect, test } from './fixtures';

test.describe('Summarize', () => {
  test('generates a summary of the opened video with the mocked LLM', async ({ dashboard, llm }) => {
    llm.answer = 'This video is about **ownership**.';
    await dashboard.getByRole('option', { name: /Rust ownership explained/ }).click();

    await expect(dashboard.getByText('No summary yet')).toBeVisible();
    await dashboard.getByRole('button', { name: 'Generate summary' }).click();

    await expect(dashboard.getByText('Summary added to “Rust ownership explained”.')).toBeVisible();
    await expect(dashboard.locator('strong', { hasText: 'ownership' })).toBeVisible();
    await expect(dashboard.getByText(/mock-model-a/)).toBeVisible();
    await expect(dashboard.getByText('No summary yet')).toHaveCount(0);

    // The request carried the transcript of this video, and only one request was made.
    expect(llm.completions).toHaveLength(1);
    expect(llm.completions[0]!.messages[0]!.content).toContain('Ownership in Rust means every value has one owner.');
  });

  test('keeps the summary after reloading the page, and deletes it', async ({ dashboard }) => {
    await dashboard.getByRole('option', { name: /Lifetimes in Rust/ }).click();
    await dashboard.getByRole('button', { name: 'Generate summary' }).click();
    await expect(dashboard.getByText('A mocked summary.')).toBeVisible();

    await dashboard.reload();
    await expect(dashboard.getByText('A mocked summary.')).toBeVisible();

    await dashboard.getByRole('button', { name: 'Delete summary' }).click();
    await expect(dashboard.getByText('No summary yet')).toBeVisible();
  });

  test('shows the error when the LLM server fails', async ({ dashboard, context }) => {
    await context.route('http://llm.test:1234/v1/chat/completions', (route) =>
      route.fulfill({
        status: 500,
        headers: { 'access-control-allow-origin': '*' },
        json: { error: { message: 'model crashed' } },
      }),
    );
    await dashboard.getByRole('option', { name: /Sourdough bread/ }).click();
    await dashboard.getByRole('button', { name: 'Generate summary' }).click();

    await expect(dashboard.getByText(/HTTP 500: model crashed/).first()).toBeVisible();
    await expect(dashboard.getByText('No summary yet')).toBeVisible();
  });
});
