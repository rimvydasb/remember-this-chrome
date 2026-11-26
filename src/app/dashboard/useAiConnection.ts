import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, hasLlmPermission, listModels } from '../../llm';
import type { LlmSettings } from '../../shared/settings';
import { useAiActivity } from './aiActivity';

export type AiConnection =
  | { status: 'checking' }
  /** The extension may not call the server yet: the user has not granted the permission. */
  | { status: 'off' }
  | { status: 'ok'; latencyMs: number; models: readonly string[]; checkedAt: number }
  | { status: 'offline'; message: string; checkedAt: number };

/**
 * The state of the connection to the AI server. Checks it (a model list request, no generation)
 * when the server settings change, after a failed AI request, and when `check` is called. Never
 * asks for the permission: without it, the state is `off`.
 */
export function useAiConnection(llm: LlmSettings | undefined): { connection: AiConnection; check: () => void } {
  const [connection, setConnection] = useState<AiConnection>({ status: 'checking' });
  const run = useRef(0);
  const llmRef = useRef(llm);
  llmRef.current = llm;
  const statusRef = useRef(connection.status);
  statusRef.current = connection.status;

  const check = useCallback(() => {
    const settings = llmRef.current;
    if (!settings) return;
    const id = ++run.current;
    const done = (next: AiConnection) => {
      if (id === run.current) setConnection(next);
    };
    setConnection((previous) => (previous.status === 'ok' ? previous : { status: 'checking' }));
    void (async () => {
      if (!(await hasLlmPermission(settings.baseUrl))) return done({ status: 'off' });
      const started = performance.now();
      try {
        const models = await listModels(settings);
        done({ status: 'ok', latencyMs: Math.round(performance.now() - started), models, checkedAt: Date.now() });
      } catch (error) {
        done({ status: 'offline', message: errorMessage(error), checkedAt: Date.now() });
      }
    })();
  }, []);

  const baseUrl = llm?.baseUrl;
  const model = llm?.model;
  useEffect(() => {
    if (baseUrl !== undefined) check();
  }, [baseUrl, model, check]);

  // A failed request may mean the server went away; a successful one means it is back.
  const lastCall = useAiActivity().lastCall;
  useEffect(() => {
    if (!lastCall) return;
    if (!lastCall.ok || statusRef.current !== 'ok') check();
  }, [lastCall, check]);

  return { connection, check };
}
