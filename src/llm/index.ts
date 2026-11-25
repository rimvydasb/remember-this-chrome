// Public API of the LLM transport. Import from here, not from the files, so tests can mock one module.
export { hostPermissionPattern, normalizeBaseUrl } from './address';
export {
  formatTimeout,
  LLM_CONNECT_TIMEOUT_MS,
  LLM_TIMEOUT_MS,
  LlmClient,
  listModels,
  stripReasoning,
  type CompletionOptions,
  type LlmOptions,
  type LlmResult,
} from './client';
export { errorMessage, LlmError } from './errors';
export { hasLlmPermission, requestLlmPermission } from './permission';
