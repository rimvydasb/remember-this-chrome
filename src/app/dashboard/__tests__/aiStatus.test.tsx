// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../../shared/settings';
import type { SavedItem } from '../../../shared/types';
import { resetLlmMocks } from '../../../test/llmMock';
import { installDashboardEnvironment, makeItem, renderApp, topicTags } from '../../test/render';
import { aiActivity } from '../aiActivity';
import { App } from '../App';

const llm = await vi.hoisted(async () => (await import('../../../test/llmMock')).createLlmMocks());
vi.mock('../../../llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../llm')>()),
  ...llm,
}));
vi.mock('../../../followups/summary/generateSummary', () => ({ generateSummary: llm.summarize }));
vi.mock('../../../followups/tagging/generateTags', () => ({ generateTags: llm.generateTags }));

let fake: ReturnType<typeof installDashboardEnvironment>;
const pill = () => screen.getByRole('button', { name: /^AI status/ });

async function open(items: SavedItem[], settings: Partial<typeof DEFAULT_SETTINGS.llm> = {}) {
  fake = installDashboardEnvironment();
  fake.storage.local.store.set(SETTINGS_KEY, { llm: { ...DEFAULT_SETTINGS.llm, useForTags: false, ...settings } });
  for (const item of items) fake.storage.local.store.set(`item:${item.id}`, item);
  window.location.hash = items[0] ? `#item=${items[0].id}` : '';
  const view = renderApp(<App />);
  if (items[0]) await screen.findByRole('heading', { level: 2, name: items[0].title });
  return view;
}

const item = (extra: Partial<SavedItem> = {}) =>
  makeItem({ id: 'a', title: 'Sleep and memory', content: 'Sleep helps memory.', tags: topicTags('sleep'), ...extra });

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  resetLlmMocks(llm);
  aiActivity.reset();
});

describe('aiActivity', () => {
  it('lists a task while it runs and records the outcome as the last call', async () => {
    let finish!: () => void;
    const running = aiActivity.track('Summarizing', 'A video', () => new Promise<void>((r) => (finish = r)));
    expect(aiActivity.get().tasks.map((task) => task.label)).toEqual(['Summarizing']);
    finish();
    await running;
    expect(aiActivity.get().tasks).toEqual([]);
    expect(aiActivity.get().lastCall?.ok).toBe(true);

    await expect(aiActivity.track('Answering', '', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(aiActivity.get().lastCall?.ok).toBe(false);
  });
});

describe('AI status in the header', () => {
  it('is ready when the server answers, and the panel shows the server', async () => {
    const { user } = await open([item()], { baseUrl: 'http://10.0.0.5:1234', model: 'qwen' });
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: ready'));
    await user.click(pill());
    const panel = await screen.findByRole('dialog', { name: /^AI status/ });
    expect(within(panel).getByText('Local AI connected')).toBeInTheDocument();
    expect(within(panel).getByText('10.0.0.5:1234')).toBeInTheDocument();
    expect(within(panel).getByText('qwen')).toBeInTheDocument();
  });

  it('shows a summary while it is generated', async () => {
    let answer!: (value: { content: string }) => void;
    llm.summarize.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { user } = await open([item()]);
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: ready'));

    await user.click(screen.getByRole('button', { name: 'Generate summary' }));
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: summarizing'));
    expect(screen.getByRole('status')).toHaveTextContent(/Summarizing · 0:0\d/);
    await user.click(pill());
    const panel = await screen.findByRole('dialog', { name: /^AI status/ });
    expect(within(panel).getByText('Summarizing')).toBeInTheDocument();
    expect(within(panel).getByText('Sleep and memory')).toBeInTheDocument();

    await act(async () => answer({ content: 'Done.' }));
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: ready'));
  });

  it('shows background tagging as done of total', async () => {
    const pending: (() => void)[] = [];
    llm.generateTags.mockImplementation(() => new Promise((resolve) => pending.push(() => resolve(topicTags('x')))));
    const items = [
      item({ id: 'a', tags: [], timestamp: '2026-03-01T00:00:00.000Z' }),
      item({ id: 'b', title: 'Second', tags: [], timestamp: '2026-02-01T00:00:00.000Z' }),
    ];
    await open(items, { useForTags: true });
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: tagging 0/2'));
    await act(async () => pending.shift()!());
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: tagging 1/2'));
  });

  it('is off without the permission, and offers to connect', async () => {
    llm.hasLlmPermission.mockResolvedValue(false);
    const { user } = await open([item()]);
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: off'));
    await user.click(pill());
    const panel = await screen.findByRole('dialog', { name: /^AI status/ });
    await user.click(within(panel).getByRole('button', { name: 'Connect a server' }));
    expect(llm.requestLlmPermission).toHaveBeenCalledWith(DEFAULT_SETTINGS.llm.baseUrl);
  });

  it('is offline when the server does not answer', async () => {
    llm.listModels.mockRejectedValue(new Error('Cannot reach the LLM server.'));
    const { user } = await open([item()]);
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: offline'));
    await user.click(pill());
    expect(await screen.findByText('Cannot reach the AI server')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();
  });

  it('pauses and resumes background tagging for this session', async () => {
    const { user } = await open([item()], { useForTags: true });
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: ready'));
    await user.click(pill());
    await user.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(aiActivity.get().taggingPaused).toBe(true);
    await waitFor(() => expect(pill()).toHaveAccessibleName('AI status: paused'));
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(aiActivity.get().taggingPaused).toBe(false);
  });
});

describe('header and sidebar', () => {
  it('has no way to clear the library', async () => {
    const { user } = await open([item()]);
    await user.click(screen.getByRole('button', { name: 'Import and export' }));
    expect(await screen.findByRole('menuitem', { name: 'Export JSON' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Clear/ })).not.toBeInTheDocument();
  });

  it('moves New catalog below the catalogs when the sidebar is collapsed', async () => {
    const { user } = await open([item()]);
    const sidebar = screen.getByRole('complementary', { name: 'Library' });
    expect(within(sidebar).getByRole('button', { name: 'New catalog' })).toBeInTheDocument();
    await user.click(within(sidebar).getByRole('button', { name: 'Collapse sidebar' }));
    const buttons = within(sidebar).getAllByRole('button');
    expect(buttons.at(-1)).toHaveAccessibleName('New catalog');
  });

  it('folds the sidebar with the [ key', async () => {
    const { user, container } = await open([item()]);
    const app = container.querySelector('.rt-app')!;
    expect(app).not.toHaveAttribute('data-side-collapsed');
    await user.keyboard('[['); // One press of "[" in user-event syntax.
    expect(app).toHaveAttribute('data-side-collapsed');
    await user.keyboard('[[');
    expect(app).not.toHaveAttribute('data-side-collapsed');
  });
});
