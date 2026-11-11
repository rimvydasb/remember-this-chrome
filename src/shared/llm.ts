import type { LlmSettings } from './settings';
import type { AiTags, SavedItem } from './types';

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

export class LlmError extends Error {}

export interface LlmOptions {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface LlmResult {
  content: string;
  /** The model that answered, as the server reports it. */
  model?: string;
}

/**
 * Normalizes a server address to its root URL without a trailing slash or `/v1`.
 * Throws `LlmError` when the address is not an http(s) URL.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new LlmError(`"${baseUrl}" is not a valid server address.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LlmError('The server address must start with http:// or https://.');
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '').replace(/\/v1$/, '');
}

/** The host permission pattern that lets the extension call the server (all ports of the host). */
export function hostPermissionPattern(baseUrl: string): string {
  const url = new URL(normalizeBaseUrl(baseUrl));
  return `${url.protocol}//${url.hostname}/*`;
}

/** Removes the reasoning block that some local models (for example Qwen, DeepSeek) put before the answer. */
export function stripReasoning(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>/i, '').trim();
}

async function request(settings: LlmSettings, path: string, init: RequestInit, options: LlmOptions): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? LLM_TIMEOUT_MS;
  const url = `${normalizeBaseUrl(settings.baseUrl)}${path}`;

  let response: Response;
  try {
    response = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new LlmError(`The LLM did not answer within ${formatTimeout(timeoutMs)}.`);
    }
    throw new LlmError(`Cannot reach the LLM server at ${normalizeBaseUrl(settings.baseUrl)}. Is it running?`);
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

/** Builds the user message: the configured prompt, then the source text. */
export function buildSummaryMessage(prompt: string, title: string, text: string): string {
  return `${prompt.trim()}\n\nTitle: ${title || 'Untitled'}\n\nTranscript:\n${text}`;
}

/** Sends one user message to the configured model (OpenAI-compatible chat completions API). */
async function chat(
  settings: LlmSettings,
  content: string,
  options: LlmOptions,
  extra: Record<string, unknown> = {},
): Promise<LlmResult> {
  const payload: Record<string, unknown> = { messages: [{ role: 'user', content }], stream: false, ...extra };
  if (settings.model) payload.model = settings.model;

  const data = (await request(
    settings,
    '/v1/chat/completions',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    options,
  )) as { model?: unknown; choices?: { message?: { content?: unknown } }[] };

  const raw = data.choices?.[0]?.message?.content;
  const answer = typeof raw === 'string' ? stripReasoning(raw) : '';
  if (!answer) throw new LlmError('The LLM returned an empty answer.');
  const model = typeof data.model === 'string' && data.model ? data.model : settings.model || undefined;
  return model ? { content: answer, model } : { content: answer };
}

/** Summarizes a text with the configured local model. */
export function summarize(
  settings: LlmSettings,
  title: string,
  text: string,
  options: LlmOptions = {},
): Promise<LlmResult> {
  return chat(settings, buildSummaryMessage(settings.summaryPrompt, title, text), options);
}

/** Most tags kept from an answer. */
export const MAX_AI_TAGS = 10;

export const TAG_PROMPT =
  'List the main topics of this transcript as tags for a personal library. ' +
  'Give 5 to 10 tags, most important first. A tag is a noun or a short noun phrase of 1 to 3 words ' +
  '(for example "AI agents", "TypeScript", "code review"). ' +
  'Name what the content is about, not words that are only said often. ' +
  'Do not use generic tags such as "video", "discussion" or "technology", and do not use the channel name. ' +
  'Write tags in lowercase, except names and acronyms. ' +
  'Answer with a JSON array of strings only, for example ["AI agents", "software engineering"].';

/** Builds the tagging message: the prompt, then the title, the description and the text. */
export function buildTagMessage(item: Pick<SavedItem, 'title' | 'content' | 'meta'>): string {
  const description = item.meta?.description?.trim();
  return [
    TAG_PROMPT,
    `Title: ${item.title || 'Untitled'}`,
    item.meta?.channel ? `Channel: ${item.meta.channel}` : '',
    description ? `Description:\n${description}` : '',
    `Transcript:\n${item.content}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Reads tags from a model answer: a JSON array (also inside a code fence or after other text),
 * else one tag per line or comma. Strips list markers and "#", drops duplicates and odd lengths.
 */
export function parseTags(answer: string): string[] {
  let raw: string[] | undefined;
  const array = answer.match(/\[[\s\S]*\]/);
  if (array) {
    try {
      const parsed: unknown = JSON.parse(array[0]);
      if (Array.isArray(parsed)) raw = parsed.filter((tag): tag is string => typeof tag === 'string');
    } catch {
      // Not valid JSON: fall back to lines and commas.
    }
  }
  raw ??= answer.replace(/```\w*/g, '').split(/[\n,]/);

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const tag = entry
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^[\s"'#`]+|[\s"'`.]+$/g, '')
      .replace(/\s+/g, ' ');
    const key = tag.toLowerCase();
    if (tag.length < 2 || tag.length > 40 || tag.split(' ').length > 4 || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_AI_TAGS) break;
  }
  return tags;
}

/** Generates tags for an item with the configured model. */
export async function generateTags(
  settings: LlmSettings,
  item: Pick<SavedItem, 'title' | 'content' | 'meta'>,
  options: LlmOptions = {},
): Promise<AiTags> {
  const result = await chat(settings, buildTagMessage(item), options, { temperature: 0.2 });
  const tags = parseTags(result.content);
  if (tags.length === 0) throw new LlmError('The LLM answer has no tags.');
  const aiTags: AiTags = { tags, createdAt: new Date().toISOString() };
  if (result.model) aiTags.model = result.model;
  return aiTags;
}

/** Lists the model identifiers that the server offers. Used to test the connection. */
export async function listModels(settings: LlmSettings, options: LlmOptions = {}): Promise<string[]> {
  const data = (await request(
    settings,
    '/v1/models',
    { method: 'GET' },
    { timeoutMs: LLM_CONNECT_TIMEOUT_MS, ...options },
  )) as { data?: { id?: unknown }[] };
  return (data.data ?? []).flatMap((entry) => (typeof entry.id === 'string' ? [entry.id] : []));
}

/**
 * Asks for the host permission to call the server. Call it directly from a click handler,
 * before any `await`, because Chrome shows the permission prompt only during a user gesture.
 */
export function requestLlmPermission(baseUrl: string): Promise<boolean> {
  let origins: string[];
  try {
    origins = [hostPermissionPattern(baseUrl)];
  } catch (error) {
    return Promise.reject(error);
  }
  return chrome.permissions.request({ origins });
}

/** Tells whether the extension may call the server. Unlike `requestLlmPermission`, needs no user gesture. */
export async function hasLlmPermission(baseUrl: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [hostPermissionPattern(baseUrl)] });
  } catch {
    return false;
  }
}
