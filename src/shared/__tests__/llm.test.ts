import { describe, expect, it, vi } from 'vitest';
import {
  buildSummaryMessage,
  hostPermissionPattern,
  listModels,
  LLM_TIMEOUT_MS,
  LlmError,
  normalizeBaseUrl,
  stripReasoning,
  summarize,
} from '../llm';
import { DEFAULT_SETTINGS, type LlmSettings } from '../settings';

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

describe('summarize', () => {
  it('posts the prompt and transcript to the chat completions API', async () => {
    const fetch = vi.fn(async () => completion('Main idea.\n\nMore.'));
    const result = await summarize(settings, 'My video', 'the transcript', { fetch });

    expect(result).toEqual({ content: 'Main idea.\n\nMore.', model: 'qwen3-8b' });
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('http://192.168.1.220:1234/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBeUndefined();
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: 'user', content: buildSummaryMessage(settings.summaryPrompt, 'My video', 'the transcript') },
    ]);
    expect(body.messages[0].content).toMatch(/^Summarize this YouTube transcript\./);
    expect(body.messages[0].content).toMatch(/Transcript:\nthe transcript$/);
  });

  it('sends the configured model', async () => {
    const fetch = vi.fn(async () => completion('Ok', 'gemma'));
    await summarize({ ...settings, model: 'gemma' }, 't', 'x', { fetch });
    const init = (fetch.mock.calls[0]! as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).model).toBe('gemma');
  });

  it('removes a reasoning block from the answer', async () => {
    const fetch = vi.fn(async () => completion('<think>hmm\nok</think>\n\nThe summary.'));
    expect((await summarize(settings, 't', 'x', { fetch })).content).toBe('The summary.');
    expect(stripReasoning('No reasoning.')).toBe('No reasoning.');
  });

  it('times out after 30 seconds by default', async () => {
    expect(LLM_TIMEOUT_MS).toBe(30_000);
    const fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    await expect(summarize(settings, 't', 'x', { fetch, timeoutMs: 20 })).rejects.toThrow(
      /did not answer within 0 seconds/,
    );
  });

  it('reports network, HTTP, and empty-answer errors', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(summarize(settings, 't', 'x', { fetch: offline })).rejects.toThrow(/Cannot reach the LLM server/);

    const httpError = vi.fn(async () => jsonResponse({ error: { message: 'No models loaded' } }, 400));
    await expect(summarize(settings, 't', 'x', { fetch: httpError })).rejects.toThrow(
      'The LLM server returned HTTP 400: No models loaded',
    );

    const empty = vi.fn(async () => completion('  '));
    await expect(summarize(settings, 't', 'x', { fetch: empty })).rejects.toThrow(/empty answer/);
  });
});

describe('listModels', () => {
  it('returns the model identifiers', async () => {
    const fetch = vi.fn(async () => jsonResponse({ data: [{ id: 'a' }, { id: 'b' }, {}] }));
    expect(await listModels(settings, { fetch })).toEqual(['a', 'b']);
    expect((fetch.mock.calls[0]! as unknown as [string])[0]).toBe('http://192.168.1.220:1234/v1/models');
  });
});
