import { describe, expect, it, vi } from 'vitest';
import {
  formatTimeout,
  hostPermissionPattern,
  listModels,
  LLM_TIMEOUT_MS,
  LlmClient,
  LlmError,
  normalizeBaseUrl,
  stripReasoning,
} from '..';
import { DEFAULT_SETTINGS, type LlmSettings } from '../../shared/settings';

const settings: LlmSettings = { ...DEFAULT_SETTINGS.llm };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const completion = (content: string, model = 'qwen3-8b') =>
  jsonResponse({ model, choices: [{ message: { content } }] });

describe('normalizeBaseUrl', () => {
  it('removes trailing slashes and /v1', () => {
    expect(normalizeBaseUrl('http://192.168.1.220:1234')).toBe('http://192.168.1.220:1234');
    expect(normalizeBaseUrl(' http://192.168.1.220:1234/ ')).toBe('http://192.168.1.220:1234');
    expect(normalizeBaseUrl('http://localhost:1234/v1/')).toBe('http://localhost:1234');
  });

  it('rejects invalid addresses', () => {
    expect(() => normalizeBaseUrl('192.168.1.220:1234')).toThrow(LlmError);
    expect(() => normalizeBaseUrl('not a url')).toThrow(LlmError);
  });

  it('builds a host permission pattern without the port', () => {
    expect(hostPermissionPattern('http://192.168.1.220:1234')).toBe('http://192.168.1.220/*');
  });
});

describe('LlmClient.complete', () => {
  it('posts the message to the chat completions API', async () => {
    const fetch = vi.fn(async () => completion('Main idea.\n\nMore.'));
    const result = await new LlmClient(settings, { fetch }).complete('hi');

    expect(result).toEqual({ content: 'Main idea.\n\nMore.', model: 'qwen3-8b' });
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('http://192.168.1.220:1234/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBeUndefined();
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('sends the configured model', async () => {
    const fetch = vi.fn(async () => completion('Ok', 'gemma'));
    await new LlmClient({ ...settings, model: 'gemma' }, { fetch }).complete('hi');
    const init = (fetch.mock.calls[0]! as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).model).toBe('gemma');
  });

  it('removes a reasoning block from the answer', async () => {
    const fetch = vi.fn(async () => completion('<think>hmm\nok</think>\n\nThe summary.'));
    expect((await new LlmClient(settings, { fetch }).complete('hi')).content).toBe('The summary.');
    expect(stripReasoning('No reasoning.')).toBe('No reasoning.');
  });

  it('formats timeouts for messages', () => {
    expect(formatTimeout(LLM_TIMEOUT_MS)).toBe('3 minutes');
    expect(formatTimeout(60_000)).toBe('1 minute');
    expect(formatTimeout(10_000)).toBe('10 seconds');
    expect(formatTimeout(90_000)).toBe('90 seconds');
  });

  it('times out after 3 minutes by default', async () => {
    expect(LLM_TIMEOUT_MS).toBe(180_000);
    const fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    await expect(new LlmClient(settings, { fetch, timeoutMs: 20 }).complete('hi')).rejects.toThrow(
      /did not answer within 0 seconds/,
    );
  });

  it('reports network, HTTP, and empty-answer errors', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(new LlmClient(settings, { fetch: offline }).complete('hi')).rejects.toThrow(
      /Cannot reach the LLM server/,
    );

    const httpError = vi.fn(async () => jsonResponse({ error: { message: 'No models loaded' } }, 400));
    await expect(new LlmClient(settings, { fetch: httpError }).complete('hi')).rejects.toThrow(
      'The LLM server returned HTTP 400: No models loaded',
    );

    const empty = vi.fn(async () => completion('  '));
    await expect(new LlmClient(settings, { fetch: empty }).complete('hi')).rejects.toThrow(/empty answer/);
  });
});

describe('listModels', () => {
  it('returns the model identifiers', async () => {
    const fetch = vi.fn(async () => jsonResponse({ data: [{ id: 'a' }, { id: 'b' }, {}] }));
    expect(await listModels(settings, { fetch })).toEqual(['a', 'b']);
    expect((fetch.mock.calls[0]! as unknown as [string])[0]).toBe('http://192.168.1.220:1234/v1/models');
  });
});
