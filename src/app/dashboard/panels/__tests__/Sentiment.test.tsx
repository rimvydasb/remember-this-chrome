// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFollowUp } from '../../../../shared/followUpRecords';
import { parseSentiments } from '../../../../shared/sentiment';
import { makeItem, renderApp } from '../../../test/render';
import { Sentiment, SentimentTags } from '../sentiment/Sentiment';
import type { SentimentState } from '../sentiment/useSentiment';

const state = vi.hoisted(() => ({ current: undefined as unknown as SentimentState }));
vi.mock('../sentiment/useSentiment', () => ({ useSentiment: () => state.current }));

const idle = (overrides: Partial<SentimentState> = {}): SentimentState => ({
  sentiment: undefined,
  sentiments: [],
  generating: false,
  error: undefined,
  canGenerate: true,
  generate: vi.fn(async () => {}),
  remove: vi.fn(),
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('Sentiment panel', () => {
  it('invites the user to analyze the sentiment and starts the analysis', async () => {
    state.current = idle();
    const { user } = renderApp(<Sentiment item={makeItem({ type: 'youtube_transcript' })} />);
    expect(screen.getByText('No sentiment yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Analyze sentiment' }));
    expect(state.current.generate).toHaveBeenCalledOnce();
  });

  it('disables the analysis until the settings are loaded, and shows the last error', () => {
    state.current = idle({ canGenerate: false, error: 'The LLM did not answer.' });
    renderApp(<Sentiment item={makeItem()} />);
    expect(screen.getByRole('button', { name: 'Analyze sentiment' })).toBeDisabled();
    expect(screen.getByText('The LLM did not answer.')).toBeInTheDocument();
  });

  it('shows each sentiment as a tag colored by mood, and regenerates or deletes them', async () => {
    const content = 'cautiously bearish, alarming, informative';
    const sentiment = createFollowUp('llm-sentiment', { generatedContent: content, model: 'qwen' });
    state.current = idle({ sentiment, sentiments: parseSentiments(content) });
    const { user } = renderApp(<Sentiment item={makeItem()} />);

    expect(screen.getByText('cautiously bearish').closest('[data-mood]')).toHaveAttribute(
      'data-mood',
      'leaning-negative',
    );
    expect(screen.getByText('alarming').closest('[data-mood]')).toHaveAttribute('data-mood', 'negative');
    expect(screen.getByText('informative').closest('[data-mood]')).toHaveAttribute('data-mood', 'neutral');
    expect(screen.getByText(/qwen/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Regenerate sentiment' }));
    expect(state.current.generate).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Delete sentiment' }));
    expect(state.current.remove).toHaveBeenCalledOnce();
  });
});

describe('SentimentTags', () => {
  it('shows the current sentiments of the item as tags', () => {
    const old = createFollowUp('llm-sentiment', { generatedContent: 'bearish' });
    const current = createFollowUp('llm-sentiment', { generatedContent: 'short term bullish, calm' });
    renderApp(<SentimentTags item={makeItem({ followUps: [old, current] })} />);
    expect(screen.getByText('short term bullish').closest('[data-mood]')).toHaveAttribute(
      'data-mood',
      'leaning-positive',
    );
    expect(screen.getByText('calm')).toBeInTheDocument();
    expect(screen.queryByText('bearish')).not.toBeInTheDocument();
  });

  it('renders nothing without a sentiment', () => {
    const { container } = renderApp(<SentimentTags item={makeItem()} />);
    expect(container.querySelector('[data-mood]')).toBeNull();
  });
});
