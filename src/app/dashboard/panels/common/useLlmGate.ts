import { LlmError, requestLlmPermission } from '../../../../llm';
import type { LlmSettings } from '../../../../shared/settings';
import { useSettings } from '../../useSettings';

/** The LLM settings with the permission request that goes with them. */
/** Requests the permission to call the server; rejects with `LlmError` when the user denies it. */
function ensureLlmPermission(baseUrl: string): Promise<void> {
  return requestLlmPermission(baseUrl).then((granted) => {
    if (!granted) throw new LlmError(`Permission to access ${baseUrl} was denied.`);
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
   */
  begin: () => LlmAccess | undefined;
}

/** Gives the panels the LLM settings and the user-gesture rule for the permission, in one place. */
export function useLlmGate(): LlmGate {
  const settings = useSettings();
  return {
    ready: Boolean(settings),
    begin: () => {
      if (!settings) return undefined;
      return { llm: settings.llm, permission: ensureLlmPermission(settings.llm.baseUrl) };
    },
  };
}
