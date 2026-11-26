import { LlmError, requestLlmPermission } from '../../../../llm';
import type { LlmSettings } from '../../../../shared/settings';
import { useSettings } from '../../useSettings';

/**
 * Requests the permission to call the server (and the extra origins); rejects with `LlmError`
 * when the user denies it.
 */
function ensureLlmPermission(baseUrl: string, extraOrigins: readonly string[]): Promise<void> {
  return requestLlmPermission(baseUrl, extraOrigins).then((granted) => {
    if (!granted) {
      const extra = extraOrigins.map((origin) => origin.replace(/\/\*$/, '')).join(', ');
      throw new LlmError(`Permission to access ${baseUrl}${extra ? ` and ${extra}` : ''} was denied.`);
    }
  });
}

export interface LlmAccess {
  llm: LlmSettings;
  /** Resolves when the permission is granted; rejects with `LlmError` when it is denied. */
  permission: Promise<void>;
}

export interface LlmGate {
  /** False until the settings are loaded. */
  ready: boolean;
  /**
   * Starts the permission request for the configured server. Call it directly in a click handler,
   * before any `await`: Chrome shows the prompt only during a user gesture. Undefined until ready.
   * `extraOrigins` (for example a search engine) are asked in the same prompt.
   */
  begin: (extraOrigins?: readonly string[]) => LlmAccess | undefined;
}

/** Gives the panels the LLM settings and the user-gesture rule for the permission, in one place. */
export function useLlmGate(): LlmGate {
  const settings = useSettings();
  return {
    ready: Boolean(settings),
    begin: (extraOrigins = []) => {
      if (!settings) return undefined;
      return { llm: settings.llm, permission: ensureLlmPermission(settings.llm.baseUrl, extraOrigins) };
    },
  };
}
