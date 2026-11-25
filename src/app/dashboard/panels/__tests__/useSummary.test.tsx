// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFollowUp } from '../../../../shared/followUpRecords';
import { DEFAULT_SETTINGS } from '../../../../shared/settings';
import { makeItem } from '../../../../test/items';
import { useSummary } from '../summary/useSummary';

const pipeline = vi.hoisted(() => ({ current: vi.fn(), run: vi.fn(), remove: vi.fn() }));
vi.mock('../../../../followups/services', () => ({ summaryPipeline: pipeline }));
const gate = vi.hoisted(() => ({ begin: vi.fn(), ready: true }));
vi.mock('../common/useLlmGate', () => ({ useLlmGate: () => gate }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const llm = DEFAULT_SETTINGS.llm;

beforeEach(() => {
  pipeline.current.mockReset();
  pipeline.run.mockReset().mockResolvedValue(undefined);
  pipeline.remove.mockReset();
  gate.begin.mockReset().mockReturnValue({ llm, permission: Promise.resolve() });
});

describe('useSummary', () => {
  it('exposes the current summary and whether generating is possible', () => {
    const summary = createFollowUp('llm-summary', { generatedContent: 'S' });
    pipeline.current.mockReturnValue(summary);
    const { result } = renderHook(() => useSummary(makeItem()), { wrapper });
    expect(result.current.summary).toBe(summary);
    expect(result.current.canGenerate).toBe(true);
  });

  it('runs the pipeline with the settings after the permission is granted', async () => {
    const item = makeItem();
    const { result } = renderHook(() => useSummary(item), { wrapper });
    await act(() => result.current.generate());
    await waitFor(() => expect(pipeline.run).toHaveBeenCalledWith({ settings: llm, item }));
  });

  it('does not run the pipeline when the permission is denied', async () => {
    gate.begin.mockReturnValue({ llm, permission: Promise.reject(new Error('denied')) });
    const { result } = renderHook(() => useSummary(makeItem()), { wrapper });
    await act(() => result.current.generate());
    expect(pipeline.run).not.toHaveBeenCalled();
  });

  it('exposes the error of a failed generation', async () => {
    pipeline.run.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSummary(makeItem()), { wrapper });
    await act(() => result.current.generate());
    await waitFor(() => expect(result.current.error).toBe('offline'));
  });

  it('does nothing while the settings are not loaded', async () => {
    gate.begin.mockReturnValue(undefined);
    const { result } = renderHook(() => useSummary(makeItem()), { wrapper });
    await act(() => result.current.generate());
    expect(pipeline.run).not.toHaveBeenCalled();
  });

  it('removes the current summary', () => {
    const summary = createFollowUp('llm-summary');
    pipeline.current.mockReturnValue(summary);
    const item = makeItem();
    const { result } = renderHook(() => useSummary(item), { wrapper });
    result.current.remove();
    expect(pipeline.remove).toHaveBeenCalledWith(item, summary);
  });
});
