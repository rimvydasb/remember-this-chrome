// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from '../../../../llm';
import { DEFAULT_SETTINGS } from '../../../../shared/settings';
import { useLlmGate } from '../common/useLlmGate';

const settings = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../useSettings', () => ({ useSettings: () => settings.current }));
const llm = vi.hoisted(() => ({ requestLlmPermission: vi.fn() }));
vi.mock('../../../../llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../llm')>()),
  ...llm,
}));

beforeEach(() => {
  settings.current = { llm: DEFAULT_SETTINGS.llm };
  llm.requestLlmPermission.mockReset().mockResolvedValue(true);
});

describe('useLlmGate', () => {
  it('is not ready and gives no access until the settings are loaded', () => {
    settings.current = undefined;
    const { result } = renderHook(() => useLlmGate());
    expect(result.current.ready).toBe(false);
    expect(result.current.begin()).toBeUndefined();
    expect(llm.requestLlmPermission).not.toHaveBeenCalled();
  });

  it('requests the permission for the configured server and returns the settings', async () => {
    const { result } = renderHook(() => useLlmGate());
    const access = result.current.begin()!;
    await expect(access.permission).resolves.toBeUndefined();
    expect(access.llm).toBe(DEFAULT_SETTINGS.llm);
    expect(llm.requestLlmPermission).toHaveBeenCalledWith(DEFAULT_SETTINGS.llm.baseUrl);
  });

  it('rejects with an LlmError when the permission is denied', async () => {
    llm.requestLlmPermission.mockResolvedValue(false);
    const { result } = renderHook(() => useLlmGate());
    await expect(result.current.begin()!.permission).rejects.toBeInstanceOf(LlmError);
  });
});
