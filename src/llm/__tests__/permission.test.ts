import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from '../errors';
import { hasLlmPermission, requestLlmPermission } from '../permission';

const permissions = { request: vi.fn(), contains: vi.fn() };

beforeEach(() => {
  permissions.request.mockReset().mockResolvedValue(true);
  permissions.contains.mockReset().mockResolvedValue(true);
  vi.stubGlobal('chrome', { permissions });
});
afterEach(() => vi.unstubAllGlobals());

describe('LLM permission', () => {
  it('requests the host pattern of the server', async () => {
    await expect(requestLlmPermission('http://192.168.1.220:1234')).resolves.toBe(true);
    expect(permissions.request).toHaveBeenCalledWith({ origins: ['http://192.168.1.220/*'] });
  });

  it('rejects an invalid address without asking Chrome', async () => {
    await expect(requestLlmPermission('nope')).rejects.toBeInstanceOf(LlmError);
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it('tells whether the permission exists, and false for an invalid address', async () => {
    await expect(hasLlmPermission('http://localhost:1234')).resolves.toBe(true);
    permissions.contains.mockResolvedValue(false);
    await expect(hasLlmPermission('http://localhost:1234')).resolves.toBe(false);
    await expect(hasLlmPermission('nope')).resolves.toBe(false);
  });
});
