// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFollowUp } from '../../../../shared/followUpRecords';
import { makeItem, renderApp } from '../../../test/render';
import { RelatedArticles } from '../related/RelatedArticles';
import type { RelatedArticlesState } from '../related/useRelatedArticles';

const state = vi.hoisted(() => ({ current: undefined as unknown as RelatedArticlesState }));
vi.mock('../related/useRelatedArticles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../related/useRelatedArticles')>()),
  useRelatedArticles: () => state.current,
}));

const idle = (overrides: Partial<RelatedArticlesState> = {}): RelatedArticlesState => ({
  searches: [],
  progress: undefined,
  error: undefined,
  cooldown: undefined,
  canSearch: true,
  find: vi.fn(async () => {}),
  remove: vi.fn(),
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('RelatedArticles panel', () => {
  it('RelatedArticles renders for a webpage_text item', async () => {
    state.current = idle();
    const { user } = renderApp(<RelatedArticles item={makeItem({ type: 'webpage_text' })} />);
    expect(screen.getByRole('button', { name: /^Related articles/ })).toBeInTheDocument();
    expect(screen.getByText(/search queries about this page/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Find related articles' }));
    expect(state.current.find).toHaveBeenCalledOnce();
  });

  it('names the video for a youtube_transcript item', () => {
    state.current = idle();
    renderApp(<RelatedArticles item={makeItem({ type: 'youtube_transcript' })} />);
    expect(screen.getByText(/search queries about this video/)).toBeInTheDocument();
  });

  it('shows the step while it works and disables the button', () => {
    state.current = idle({ progress: { step: 'search', index: 2, total: 4 }, canSearch: false });
    renderApp(<RelatedArticles item={makeItem()} />);
    expect(screen.getByRole('button', { name: 'Searching 2 of 4…' })).toBeDisabled();
  });

  it('shows the error with the queries that ran, and the cooldown', () => {
    state.current = idle({
      error: { message: 'Google asks to prove that you are not a robot.', queries: ['sleep study -site:youtube.com'] },
      cooldown: { until: Date.now() + 60_000, reason: 'Bot check.' },
      canSearch: false,
    });
    renderApp(<RelatedArticles item={makeItem()} />);
    expect(screen.getByText('Google asks to prove that you are not a robot.')).toBeInTheDocument();
    expect(screen.getByText(/“sleep study”/)).toBeInTheDocument();
    expect(screen.getByText('Google search is paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find related articles' })).toBeDisabled();
  });

  it('lists each search with its links, and deletes one', async () => {
    const search = createFollowUp('related-articles', {
      generatedContent: '- [A](<https://www.a.example/x>)',
      queries: ['q1', 'q2'],
      articles: [
        { url: 'https://www.a.example/x', title: 'Article A', snippet: 'About A.', queries: ['q2'], bestRank: 1 },
      ],
    });
    state.current = idle({ searches: [search] });
    const { user } = renderApp(<RelatedArticles item={makeItem()} />);

    expect(within(screen.getByRole('button', { name: /^Related articles/ })).getByText('1')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Article A' });
    expect(link).toHaveAttribute('href', 'https://www.a.example/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByText(/a\.example · found by “q2”/)).toBeInTheDocument();
    expect(screen.getByText('About A.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete these results' }));
    expect(state.current.remove).toHaveBeenCalledWith(search);
  });
});
