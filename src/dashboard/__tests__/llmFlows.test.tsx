// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from '../../shared/llm';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../shared/settings';
import type { FollowUp, SavedItem } from '../../shared/types';
import { resetLlmMocks } from '../../test/llmMock';
import { installDashboardEnvironment, makeItem, renderApp } from '../../test/render';
import { App } from '../App';

const llm = await vi.hoisted(async () => (await import('../../test/llmMock')).createLlmMocks());
vi.mock('../../shared/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/llm')>()),
  ...llm,
}));

let fake: ReturnType<typeof installDashboardEnvironment>;
const stored = () => fake.storage.local.store.get('item:a') as SavedItem;
const followUps = (type: FollowUp['type']) => (stored().followUps ?? []).filter((f) => f.type === type);

const followUp = (extra: Partial<FollowUp>): FollowUp => ({
  id: crypto.randomUUID(),
  type: 'user-question',
  generatedContent: '',
  createdAt: '2026-02-01T10:00:00.000Z',
  ...extra,
});

async function open(extra: Partial<SavedItem> = {}) {
  fake = installDashboardEnvironment();
  // Background tagging has its own tests; here only the buttons make LLM calls.
  fake.storage.local.store.set(SETTINGS_KEY, { llm: { ...DEFAULT_SETTINGS.llm, useForTags: false } });
  const item = makeItem({
    id: 'a',
    title: 'Sleep and memory',
    type: 'youtube_transcript',
    content: 'Sleep helps memory.',
    aiTags: { tags: ['sleep'], createdAt: '2026-01-01T00:00:00.000Z' },
    ...extra,
  });
  fake.storage.local.store.set('item:a', item);
  window.location.hash = '#item=a';
  const view = renderApp(<App />);
  await screen.findByRole('heading', { level: 2, name: 'Sleep and memory' });
  // The buttons are disabled until the settings are loaded.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask' })).toBeDefined());
  return view;
}

const askBox = () => screen.getByRole('textbox', { name: 'Your question' });

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  resetLlmMocks(llm);
});

describe('summary', () => {
  it('invites the user to generate a summary', async () => {
    await open();
    expect(screen.getByText('No summary yet')).toBeInTheDocument();
    expect(screen.getByText(/read the transcript and write a short summary/)).toBeInTheDocument();
  });

  it('says "page" for a web page', async () => {
    await open({ type: 'webpage_text' });
    expect(screen.getByText(/read the page and write a short summary/)).toBeInTheDocument();
  });

  it('generates a summary with the stored settings and saves it', async () => {
    llm.summarize.mockResolvedValue({ content: '**Main idea:** sleep matters.', model: 'qwen-7b' });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Generate summary' }));

    expect(await screen.findByText('Main idea:', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/qwen-7b/)).toBeInTheDocument();
    expect(llm.requestLlmPermission).toHaveBeenCalledWith(DEFAULT_SETTINGS.llm.baseUrl);
    expect(llm.summarize).toHaveBeenCalledWith(
      { ...DEFAULT_SETTINGS.llm, useForTags: false },
      expect.objectContaining({ id: 'a' }),
    );
    await waitFor(() => expect(followUps('llm-summary')).toHaveLength(1));
    expect(followUps('llm-summary')[0]).toMatchObject({
      generatedContent: '**Main idea:** sleep matters.',
      model: 'qwen-7b',
    });
    expect(await screen.findByText('Summary added to “Sleep and memory”.')).toBeInTheDocument();
  });

  it('uses the settings that the user saved', async () => {
    llm.summarize.mockResolvedValue({ content: 'Short.' });
    fake = installDashboardEnvironment();
    fake.storage.local.store.set(SETTINGS_KEY, {
      llm: { ...DEFAULT_SETTINGS.llm, baseUrl: 'http://10.0.0.5:1234', model: 'm1' },
    });
    fake.storage.local.store.set(
      'item:a',
      makeItem({ id: 'a', title: 'Sleep and memory', aiTags: { tags: ['x'], createdAt: '2026-01-01T00:00:00.000Z' } }),
    );
    window.location.hash = '#item=a';
    const { user } = renderApp(<App />);
    await screen.findByRole('heading', { level: 2, name: 'Sleep and memory' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate summary' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate summary' }));
    await waitFor(() => expect(llm.summarize).toHaveBeenCalled());
    expect(llm.requestLlmPermission).toHaveBeenCalledWith('http://10.0.0.5:1234');
    expect(llm.summarize.mock.calls[0]![0]).toMatchObject({ baseUrl: 'http://10.0.0.5:1234', model: 'm1' });
  });

  it('shows the error in the block when the LLM fails', async () => {
    llm.summarize.mockRejectedValue(new LlmError('Cannot reach the LLM server.'));
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Generate summary' }));
    expect(
      await screen.findByText('Cannot reach the LLM server.', { selector: '.mantine-Alert-message' }),
    ).toBeInTheDocument();
    expect(followUps('llm-summary')).toHaveLength(0);
    // The button is back, so the user can try again.
    expect(screen.getByRole('button', { name: 'Generate summary' })).toBeEnabled();
  });

  it('does not call the server when the permission is denied', async () => {
    llm.requestLlmPermission.mockResolvedValue(false);
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Generate summary' }));
    expect(await screen.findByText(/Permission to access .* was denied/)).toBeInTheDocument();
    expect(llm.summarize).not.toHaveBeenCalled();
  });

  it('replaces the summary when it is regenerated', async () => {
    llm.summarize.mockResolvedValue({ content: 'New summary.' });
    const { user } = await open({
      followUps: [followUp({ type: 'llm-summary', id: 'old', generatedContent: 'Old summary.' })],
    });
    expect(screen.getByText('Old summary.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Regenerate summary' }));
    expect(await screen.findByText('New summary.')).toBeInTheDocument();
    await waitFor(() => expect(followUps('llm-summary').map((f) => f.generatedContent)).toEqual(['New summary.']));
    expect(screen.queryByText('Old summary.')).not.toBeInTheDocument();
  });

  it('keeps the old summary when regenerating fails', async () => {
    llm.summarize.mockRejectedValue(new LlmError('Server down'));
    const { user } = await open({
      followUps: [followUp({ type: 'llm-summary', id: 'old', generatedContent: 'Old summary.' })],
    });
    await user.click(screen.getByRole('button', { name: 'Regenerate summary' }));
    expect(await screen.findByText('Cannot summarize')).toBeInTheDocument();
    expect(screen.getByText('Old summary.')).toBeInTheDocument();
    expect(followUps('llm-summary')).toHaveLength(1);
  });

  it('deletes the summary', async () => {
    const { user } = await open({
      followUps: [followUp({ type: 'llm-summary', id: 'old', generatedContent: 'Old summary.' })],
    });
    await user.click(screen.getByRole('button', { name: 'Delete summary' }));
    expect(await screen.findByText('No summary yet')).toBeInTheDocument();
    expect(stored().followUps).toBeUndefined();
  });

  it('copies the summary', async () => {
    const { user } = await open({ followUps: [followUp({ type: 'llm-summary', generatedContent: 'Copy me.' })] });
    await user.click(screen.getByRole('button', { name: 'Copy summary' }));
    expect(await navigator.clipboard.readText()).toBe('Copy me.');
  });

  it('shows only the newest of several stored summaries', async () => {
    await open({
      followUps: [
        followUp({ type: 'llm-summary', generatedContent: 'First.' }),
        followUp({ type: 'llm-summary', generatedContent: 'Second.' }),
      ],
    });
    expect(screen.getByText('Second.')).toBeInTheDocument();
    expect(screen.queryByText('First.')).not.toBeInTheDocument();
  });

  it('does not run raw HTML or scripts from the model, and opens links in a new tab', async () => {
    await open({
      followUps: [
        followUp({
          type: 'llm-summary',
          generatedContent:
            '<img src=x onerror="alert(1)">\n\n[docs](https://example.com/docs) [bad](javascript:alert(1))',
        }),
      ],
    });
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });
});

describe('questions', () => {
  it('disables Ask until there is a question', async () => {
    const { user } = await open();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    await user.type(askBox(), '   ');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    await user.type(askBox(), 'Why?');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled();
  });

  it('asks a question, shows the answer and saves both', async () => {
    llm.answerQuestion.mockResolvedValue({ content: 'Because **sleep** consolidates memory.', model: 'qwen-7b' });
    const { user } = await open();
    await user.type(askBox(), 'Why sleep?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('sleep', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Why sleep?', { selector: '.rt-question-text' })).toBeInTheDocument();
    expect(askBox()).toHaveValue('');
    const [, , asked] = llm.answerQuestion.mock.calls[0]!;
    expect(asked).toMatchObject({ text: 'Why sleep?' });
    await waitFor(() =>
      expect(followUps('user-question')[0]).toMatchObject({
        userContent: 'Why sleep?',
        generatedContent: 'Because **sleep** consolidates memory.',
        model: 'qwen-7b',
      }),
    );
    // The question id lets the prompt leave the question being answered out of the history.
    expect(asked.id).toBe(followUps('user-question')[0]!.id);
  });

  it('asks with Enter, and adds a line with Shift+Enter', async () => {
    llm.answerQuestion.mockResolvedValue({ content: 'Answer.' });
    const { user } = await open();
    await user.type(askBox(), 'Line one{Shift>}{Enter}{/Shift}line two');
    expect(askBox()).toHaveValue('Line one\nline two');
    expect(llm.answerQuestion).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(llm.answerQuestion).toHaveBeenCalledTimes(1));
    expect(llm.answerQuestion.mock.calls[0]![2]).toMatchObject({ text: 'Line one\nline two' });
  });

  it('asks a question only once when Enter is pressed twice', async () => {
    let finish!: (value: unknown) => void;
    llm.answerQuestion.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = await open();
    await user.type(askBox(), 'Why?');
    await user.keyboard('{Enter}{Enter}');
    finish({ content: 'Because.' });

    await screen.findByText('Because.');
    expect(llm.answerQuestion).toHaveBeenCalledTimes(1);
    expect(followUps('user-question')).toHaveLength(1);
  });

  it('shows "Answering…" while the model works', async () => {
    let finish!: (value: unknown) => void;
    llm.answerQuestion.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = await open();
    await user.type(askBox(), 'Why?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Answering…')).toBeInTheDocument();
    finish({ content: 'Done.' });
    expect(await screen.findByText('Done.')).toBeInTheDocument();
    expect(screen.queryByText('Answering…')).not.toBeInTheDocument();
  });

  it('keeps the question and offers a retry when the answer fails', async () => {
    llm.answerQuestion
      .mockRejectedValueOnce(new LlmError('Server down'))
      .mockResolvedValueOnce({ content: 'Second try.' });
    const { user } = await open();
    await user.type(askBox(), 'Why?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('Cannot answer')).toBeInTheDocument();
    expect(screen.getByText('Server down')).toBeInTheDocument();
    expect(followUps('user-question')[0]).toMatchObject({ userContent: 'Why?', generatedContent: '' });

    await user.click(screen.getByRole('button', { name: 'Get answer' }));
    expect(await screen.findByText('Second try.')).toBeInTheDocument();
    expect(screen.queryByText('Cannot answer')).not.toBeInTheDocument();
    expect(llm.answerQuestion).toHaveBeenCalledTimes(2);
  });

  it('shows "No answer yet" for a question that was never answered', async () => {
    await open({ followUps: [followUp({ userContent: 'Old question?' })] });
    expect(screen.getByText('No answer yet.')).toBeInTheDocument();
  });

  it('keeps the old answer when answering again fails', async () => {
    llm.answerQuestion.mockRejectedValue(new LlmError('Server down'));
    const { user } = await open({
      followUps: [followUp({ id: 'q', userContent: 'Why?', generatedContent: 'Old answer.' })],
    });
    await user.click(screen.getByRole('button', { name: 'Answer again' }));
    expect(await screen.findByText('Cannot answer')).toBeInTheDocument();
    expect(screen.getByText('Old answer.')).toBeInTheDocument();
    expect(followUps('user-question')[0]!.generatedContent).toBe('Old answer.');
  });

  it('replaces the answer when asked again', async () => {
    llm.answerQuestion.mockResolvedValue({ content: 'Fresh answer.' });
    const { user } = await open({
      followUps: [followUp({ id: 'q', userContent: 'Why?', generatedContent: 'Old answer.' })],
    });
    await user.click(screen.getByRole('button', { name: 'Answer again' }));
    expect(await screen.findByText('Fresh answer.')).toBeInTheDocument();
    expect(screen.queryByText('Old answer.')).not.toBeInTheDocument();
  });

  it('does not call the server when the permission is denied', async () => {
    llm.requestLlmPermission.mockResolvedValue(false);
    const { user } = await open();
    await user.type(askBox(), 'Why?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/Permission to access .* was denied/)).toBeInTheDocument();
    expect(llm.answerQuestion).not.toHaveBeenCalled();
    expect(followUps('user-question')).toHaveLength(1);
  });

  it('lists the newest question first and counts them', async () => {
    await open({
      followUps: [
        followUp({ userContent: 'First?', generatedContent: 'A1', createdAt: '2026-02-01T10:00:00.000Z' }),
        followUp({ userContent: 'Second?', generatedContent: 'A2', createdAt: '2026-02-02T10:00:00.000Z' }),
      ],
    });
    const texts = [...document.querySelectorAll('.rt-question-text')].map((el) => el.textContent);
    expect(texts).toEqual(['Second?', 'First?']);
    expect(within(screen.getByRole('button', { name: /^Questions/ })).getByText('2')).toBeInTheDocument();
  });

  it('deletes a question', async () => {
    const { user } = await open({ followUps: [followUp({ userContent: 'Why?', generatedContent: 'A1' })] });
    await user.click(screen.getByRole('button', { name: 'Delete question' }));
    await waitFor(() => expect(screen.queryByText('Why?')).not.toBeInTheDocument());
    expect(stored().followUps).toBeUndefined();
  });

  it('answers two questions that are asked one after the other without losing one', async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    llm.answerQuestion.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const { user } = await open();
    await user.type(askBox(), 'One?{Enter}');
    await waitFor(() => expect(resolvers).toHaveLength(1));
    await user.type(askBox(), 'Two?{Enter}');
    await waitFor(() => expect(resolvers).toHaveLength(2));

    // Both answers arrive together.
    resolvers[0]!({ content: 'Answer one.' });
    resolvers[1]!({ content: 'Answer two.' });
    expect(await screen.findByText('Answer one.')).toBeInTheDocument();
    expect(await screen.findByText('Answer two.')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        followUps('user-question')
          .map((f) => f.generatedContent)
          .sort(),
      ).toEqual(['Answer one.', 'Answer two.']),
    );
  });

  it('does not bring back a question that was deleted while it was answered', async () => {
    let finish!: (value: unknown) => void;
    llm.answerQuestion.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = await open();
    await user.type(askBox(), 'Why?{Enter}');
    await screen.findByText('Answering…');
    await user.click(screen.getByRole('button', { name: 'Delete question' }));
    finish({ content: 'Too late.' });
    await waitFor(() => expect(llm.answerQuestion).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored().followUps).toBeUndefined();
    expect(screen.queryByText('Too late.')).not.toBeInTheDocument();
  });
});

describe('AI tags button', () => {
  const noTags = { aiTags: undefined };

  it('is not shown when the item has AI tags', async () => {
    await open();
    expect(screen.queryByRole('button', { name: /Regenerate tags with AI/ })).not.toBeInTheDocument();
  });

  it('generates tags for an item and replaces the keyword tags', async () => {
    llm.generateTags.mockResolvedValue({
      tags: ['sleep', 'memory'],
      createdAt: '2026-02-01T00:00:00.000Z',
      model: 'm',
    });
    const { user } = await open(noTags);
    await user.click(await screen.findByRole('button', { name: 'Regenerate tags with AI' }));

    await waitFor(() => expect(stored().aiTags?.tags).toEqual(['sleep', 'memory']));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Regenerate tags with AI/ })).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole('button', { name: /^memory/ }).length).toBeGreaterThan(0);
  });

  it('tells when tags cannot be generated', async () => {
    llm.generateTags.mockRejectedValue(new LlmError('The LLM answer has no tags.'));
    const { user } = await open(noTags);
    await user.click(await screen.findByRole('button', { name: 'Regenerate tags with AI' }));
    expect(await screen.findByText('Cannot generate tags')).toBeInTheDocument();
    expect(screen.getByText('The LLM answer has no tags.')).toBeInTheDocument();
    expect(stored().aiTags).toBeUndefined();
  });

  it('tells when the permission is denied', async () => {
    llm.requestLlmPermission.mockResolvedValue(false);
    const { user } = await open(noTags);
    await user.click(await screen.findByRole('button', { name: 'Regenerate tags with AI' }));
    expect(await screen.findByText(/Permission to access .* was denied/)).toBeInTheDocument();
    expect(llm.generateTags).not.toHaveBeenCalled();
  });
});
