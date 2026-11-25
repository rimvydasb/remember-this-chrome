// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFollowUp } from '../../../../shared/followUpRecords';
import { makeItem, renderApp } from '../../../test/render';
import { Questions } from '../questions/Questions';
import type { QuestionsState } from '../questions/useQuestions';

const state = vi.hoisted(() => ({ current: undefined as unknown as QuestionsState }));
vi.mock('../questions/useQuestions', () => ({ useQuestions: () => state.current }));

const idle = (overrides: Partial<QuestionsState> = {}): QuestionsState => ({
  questions: [],
  draft: '',
  setDraft: vi.fn(),
  canAsk: true,
  ask: vi.fn(async () => {}),
  retry: vi.fn(),
  remove: vi.fn(),
  isAnswering: () => false,
  errorOf: () => undefined,
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('Questions panel', () => {
  it('disables Ask while the draft is empty or the settings are not loaded', () => {
    state.current = idle();
    const { unmount } = renderApp(<Questions item={makeItem()} />);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    unmount();

    state.current = idle({ draft: 'Why?', canAsk: false });
    renderApp(<Questions item={makeItem()} />);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });

  it('sends typing to the draft and asks on click and on Enter, but not on Shift+Enter', async () => {
    state.current = idle({ draft: 'Why?' });
    const { user } = renderApp(<Questions item={makeItem()} />);
    const box = screen.getByRole('textbox', { name: 'Your question' });

    await user.type(box, 'x');
    expect(state.current.setDraft).toHaveBeenCalledWith('Why?x');

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.type(box, '{Enter}');
    await user.type(box, '{Shift>}{Enter}{/Shift}');
    expect(state.current.ask).toHaveBeenCalledTimes(2);
  });

  it('names the source in the placeholder', () => {
    state.current = idle();
    renderApp(<Questions item={makeItem({ type: 'youtube_transcript' })} />);
    expect(screen.getByPlaceholderText('Ask a question about this transcript…')).toBeInTheDocument();
  });

  it('shows a card per question with the count, and wires retry and delete', async () => {
    const answered = createFollowUp('user-question', { userContent: 'Why?', generatedContent: 'Because.' });
    const failed = createFollowUp('user-question', { userContent: 'How?' });
    state.current = idle({
      questions: [answered, failed],
      errorOf: (id) => (id === failed.id ? 'offline' : undefined),
    });
    const { user } = renderApp(<Questions item={makeItem()} />);

    expect(within(screen.getByRole('button', { name: /^Questions/ })).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Because.')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Get answer' }));
    expect(state.current.retry).toHaveBeenCalledWith(failed);
    await user.click(screen.getAllByRole('button', { name: 'Delete question' })[0]!);
    expect(state.current.remove).toHaveBeenCalledWith(answered);
  });
});
