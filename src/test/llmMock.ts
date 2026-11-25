import { vi } from 'vitest';

/**
 * Mocks of the LLM calls, for `vi.mock('../../shared/llm', ...)`. Create them with `vi.hoisted`,
 * because `vi.mock` runs before the imports.
 */
export function createLlmMocks() {
  return {
    summarize: vi.fn(),
    answerQuestion: vi.fn(),
    generateTags: vi.fn(),
    listModels: vi.fn(),
    requestLlmPermission: vi.fn(),
    hasLlmPermission: vi.fn(),
  };
}

export type LlmMocks = ReturnType<typeof createLlmMocks>;

/** Permission granted, server reachable, and no answers until a test sets them. */
export function resetLlmMocks(llm: LlmMocks) {
  for (const mock of Object.values(llm)) mock.mockReset();
  llm.requestLlmPermission.mockResolvedValue(true);
  llm.hasLlmPermission.mockResolvedValue(true);
  llm.listModels.mockResolvedValue(['test-model']);
}
