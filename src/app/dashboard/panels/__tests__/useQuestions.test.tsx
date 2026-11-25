// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemDeletedError } from '../../../../followups/errors';
import { createFollowUp } from '../../../../shared/followUpRecords';
import { DEFAULT_SETTINGS } from '../../../../shared/settings';
import { makeItem } from '../../../../test/items';
import { useQuestions } from '../questions/useQuestions';

const pipeline = vi.hoisted(() => ({ list: vi.fn(), ask: vi.fn(), run: vi.fn(), remove: vi.fn() }));
vi.mock('../../../../followups/services', () => ({ questionPipeline: pipeline }));
const gate = vi.hoisted(() => ({ begin: vi.fn(), ready: true }));
vi.mock('../common/useLlmGate', () => ({ useLlmGate: () => gate }));

const llm = DEFAULT_SETTINGS.llm;
const saved = createFollowUp('user-question', { userContent: 'Why?' });

beforeEach(() => {
  pipeline.list.mockReset().mockReturnValue([]);
  pipeline.ask.mockReset().mockResolvedValue(saved);
  pipeline.run.mockReset().mockResolvedValue(undefined);
  pipeline.remove.mockReset();
  gate.begin.mockReset().mockReturnValue({ llm, permission: Promise.resolve() });
});

describe('useQuestions', () => {
  it('saves the draft as a question, clears the input and answers it', async () => {
    const item = makeItem();
    const { result } = renderHook(() => useQuestions(item));
    act(() => result.current.setDraft('  Why?  '));
    await act(() => result.current.ask());

    expect(pipeline.ask).toHaveBeenCalledWith(item, 'Why?');
    expect(pipeline.run).toHaveBeenCalledWith({ settings: llm, item }, saved);
    expect(result.current.draft).toBe('');
    expect(result.current.isAnswering(saved.id)).toBe(false);
  });

  it('ignores an empty draft', async () => {
    const { result } = renderHook(() => useQuestions(makeItem()));
    act(() => result.current.setDraft('   '));
    await act(() => result.current.ask());
    expect(pipeline.ask).not.toHaveBeenCalled();
  });

  it('restores the draft when the item was deleted', async () => {
    pipeline.ask.mockRejectedValue(new ItemDeletedError());
    const { result } = renderHook(() => useQuestions(makeItem()));
    act(() => result.current.setDraft('Why?'));
    await act(() => result.current.ask());
    expect(result.current.draft).toBe('Why?');
    expect(pipeline.run).not.toHaveBeenCalled();
  });

  it('keeps the error of a failed answer for the question', async () => {
    pipeline.run.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useQuestions(makeItem()));
    act(() => result.current.setDraft('Why?'));
    await act(() => result.current.ask());
    expect(result.current.errorOf(saved.id)).toBe('offline');
  });

  it('reports a denied permission as the error of the question', async () => {
    gate.begin.mockReturnValue({ llm, permission: Promise.reject(new Error('denied')) });
    const { result } = renderHook(() => useQuestions(makeItem()));
    act(() => result.current.setDraft('Why?'));
    await act(() => result.current.ask());
    expect(result.current.errorOf(saved.id)).toBe('denied');
    expect(pipeline.run).not.toHaveBeenCalled();
  });

  it('answers again on retry and clears the old error', async () => {
    pipeline.run.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { result } = renderHook(() => useQuestions(makeItem()));
    act(() => result.current.setDraft('Why?'));
    await act(() => result.current.ask());
    act(() => result.current.retry(saved));
    await waitFor(() => expect(result.current.errorOf(saved.id)).toBeUndefined());
    expect(pipeline.run).toHaveBeenCalledTimes(2);
  });

  it('removes a question and its error', () => {
    const item = makeItem();
    const { result } = renderHook(() => useQuestions(item));
    act(() => result.current.remove(saved));
    expect(pipeline.remove).toHaveBeenCalledWith(item, saved);
  });

  it('lists the questions of the pipeline', () => {
    pipeline.list.mockReturnValue([saved]);
    const { result } = renderHook(() => useQuestions(makeItem()));
    expect(result.current.questions).toEqual([saved]);
  });
});
