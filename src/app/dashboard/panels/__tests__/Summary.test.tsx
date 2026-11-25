// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFollowUp } from '../../../../shared/followUpRecords';
import { makeItem, renderApp } from '../../../test/render';
import { Summary } from '../summary/Summary';
import type { SummaryState } from '../summary/useSummary';

const state = vi.hoisted(() => ({ current: undefined as unknown as SummaryState }));
vi.mock('../summary/useSummary', () => ({ useSummary: () => state.current }));

const idle = (overrides: Partial<SummaryState> = {}): SummaryState => ({
  summary: undefined,
  generating: false,
  error: undefined,
  canGenerate: true,
  generate: vi.fn(async () => {}),
  remove: vi.fn(),
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('Summary panel', () => {
  it('invites the user to generate a summary and starts the generation', async () => {
    state.current = idle();
    const { user } = renderApp(<Summary item={makeItem({ type: 'youtube_transcript' })} />);
    expect(screen.getByText('No summary yet')).toBeInTheDocument();
    expect(screen.getByText(/read the transcript/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate summary' }));
    expect(state.current.generate).toHaveBeenCalledOnce();
  });

  it('disables generating until the settings are loaded', () => {
    state.current = idle({ canGenerate: false });
    renderApp(<Summary item={makeItem()} />);
    expect(screen.getByRole('button', { name: 'Generate summary' })).toBeDisabled();
  });

  it('shows the error of the last generation', () => {
    state.current = idle({ error: 'The LLM did not answer.' });
    renderApp(<Summary item={makeItem()} />);
    expect(screen.getByText('The LLM did not answer.')).toBeInTheDocument();
  });

  it('shows the summary with its model, and regenerates or deletes it', async () => {
    const summary = createFollowUp('llm-summary', { generatedContent: 'The **main** idea.', model: 'qwen' });
    state.current = idle({ summary });
    const { user } = renderApp(<Summary item={makeItem()} />);

    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText(/qwen/)).toBeInTheDocument();
    expect(screen.queryByText('No summary yet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Regenerate summary' }));
    expect(state.current.generate).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Delete summary' }));
    expect(state.current.remove).toHaveBeenCalledOnce();
  });
});
