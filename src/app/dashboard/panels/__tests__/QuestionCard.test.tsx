// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFollowUp } from '../../../../shared/followUpRecords';
import { renderApp } from '../../../test/render';
import { QuestionCard } from '../questions/QuestionCard';

const base = { answering: false, error: undefined, canAsk: true, onRetry: vi.fn(), onDelete: vi.fn() };

describe('QuestionCard', () => {
  it('shows an answered question with the model and offers to answer again', async () => {
    const followUp = createFollowUp('user-question', {
      userContent: 'Why?',
      generatedContent: 'Because.',
      model: 'm1',
    });
    const onRetry = vi.fn();
    const { user } = renderApp(<QuestionCard {...base} followUp={followUp} onRetry={onRetry} />);

    expect(screen.getByText('Why?')).toBeInTheDocument();
    expect(screen.getByText('Because.')).toBeInTheDocument();
    expect(screen.getByText(/m1/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Answer again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows "No answer yet." for a question without an answer and no error', () => {
    renderApp(<QuestionCard {...base} followUp={createFollowUp('user-question', { userContent: 'Why?' })} />);
    expect(screen.getByText('No answer yet.')).toBeInTheDocument();
  });

  it('shows progress while answering, without the retry button', () => {
    renderApp(<QuestionCard {...base} answering followUp={createFollowUp('user-question', { userContent: 'Why?' })} />);
    expect(screen.getByText('Answering…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get answer' })).not.toBeInTheDocument();
  });

  it('shows the error and disables retry when the settings are missing', () => {
    renderApp(
      <QuestionCard
        {...base}
        canAsk={false}
        error="offline"
        followUp={createFollowUp('user-question', { userContent: 'Why?' })}
      />,
    );
    expect(screen.getByText('offline')).toBeInTheDocument();
    expect(screen.queryByText('No answer yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get answer' })).toBeDisabled();
  });
});
