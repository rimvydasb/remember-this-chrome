import { normalizeBaseUrl } from './address';
import { LlmError } from './errors';
import type { LlmSettings } from '../shared/settings';

/** Time limit of one generation call to the local LLM. Long transcripts on local hardware are slow. */
export const LLM_TIMEOUT_MS = 3 * 60_000;

/** Time limit of a connection test (model list), which does not generate text. */
export const LLM_CONNECT_TIMEOUT_MS = 10_000;

/** Formats a timeout for messages: "45 seconds", "3 minutes". */
export function formatTimeout(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

export interface LlmOptions {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface LlmResult {
  content: string;
  /** The model that answered, as the server reports it. */
  model?: string;
}

/** Extra request fields of one completion. */
export interface CompletionOptions {
  temperature?: number;
}

/** Removes the reasoning block that some local models (for example Qwen, DeepSeek) put before the answer. */
export function stripReasoning(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>/i, '').trim();
}

/**
 * The transport to an OpenAI-compatible server (LM Studio, Ollama, llama.cpp). It knows nothing
 * about items, prompts or follow-ups: it sends one user message and returns the answer.
 */
export class LlmClient {
  constructor(
    private readonly settings: LlmSettings,
    private readonly options: LlmOptions = {},
  ) {}

  /** Sends one user message to the configured model (chat completions API). */
  async complete(content: string, extra: CompletionOptions = {}): Promise<LlmResult> {
    const payload: Record<string, unknown> = { messages: [{ role: 'user', content }], stream: false, ...extra };
    if (this.settings.model) payload.model = this.settings.model;

    const data = (await this.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })) as { model?: unknown; choices?: { message?: { content?: unknown } }[] };

    const raw = data.choices?.[0]?.message?.content;
    const answer = typeof raw === 'string' ? stripReasoning(raw) : '';
    if (!answer) throw new LlmError('The LLM returned an empty answer.');
    const model = typeof data.model === 'string' && data.model ? data.model : this.settings.model || undefined;
    return model ? { content: answer, model } : { content: answer };
  }

  /** Lists the model identifiers that the server offers. Used to test the connection. */
  async listModels(): Promise<string[]> {
    const data = (await this.request('/v1/models', { method: 'GET' }, LLM_CONNECT_TIMEOUT_MS)) as {
      data?: { id?: unknown }[];
    };
    return (data.data ?? []).flatMap((entry) => (typeof entry.id === 'string' ? [entry.id] : []));
  }

  private async request(path: string, init: RequestInit, defaultTimeoutMs = LLM_TIMEOUT_MS): Promise<unknown> {
    const doFetch = this.options.fetch ?? fetch;
    const timeoutMs = this.options.timeoutMs ?? defaultTimeoutMs;
    const root = normalizeBaseUrl(this.settings.baseUrl);

    let response: Response;
    try {
      response = await doFetch(`${root}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new LlmError(
          `The LLM did not answer within ${formatTimeout(timeoutMs)} (${root}). ` +
            'Check that the address is the current IP of the computer that runs the server and that the server is running.',
        );
      }
      throw new LlmError(`Cannot reach the LLM server at ${root}. Is it running?`);
    }

    const body = await response.text().catch(() => '');
    if (!response.ok) {
      let detail = body.slice(0, 300);
      try {
        const parsed = JSON.parse(body) as { error?: string | { message?: string } };
        const message = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
        if (message) detail = message;
      } catch {
        // Not JSON: keep the raw text.
      }
      throw new LlmError(`The LLM server returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new LlmError('The LLM server returned a response that is not JSON.');
    }
  }
}

/** Lists the models of the server. Used to test the connection. */
export function listModels(settings: LlmSettings, options: LlmOptions = {}): Promise<string[]> {
  return new LlmClient(settings, options).listModels();
}
