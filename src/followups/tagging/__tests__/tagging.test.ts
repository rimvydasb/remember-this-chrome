import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type LlmSettings } from '../../../shared/settings';
import { generateTags } from '../generateTags';
import { parseTags } from '../parseTags';
import { TAG_PROMPT } from '../prompt';

const settings: LlmSettings = { ...DEFAULT_SETTINGS.llm };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const completion = (content: string, model = 'qwen3-8b') =>
  jsonResponse({ model, choices: [{ message: { content } }] });

describe('parseTags', () => {
  it('reads a JSON array, also inside a code fence or after other text', () => {
    expect(parseTags('["AI agents", "TypeScript"]')).toEqual(['AI agents', 'TypeScript']);
    expect(parseTags('Here are the tags:\n```json\n["code review", "#gardening"]\n```')).toEqual([
      'code review',
      'gardening',
    ]);
  });

  it('falls back to lines and commas, and cleans list markers', () => {
    expect(parseTags('1. AI agents\n2. software engineering\n- "TypeScript"')).toEqual([
      'AI agents',
      'software engineering',
      'TypeScript',
    ]);
    expect(parseTags('agents, gardening, agents')).toEqual(['agents', 'gardening']);
  });

  it('drops odd lengths and keeps at most 10 tags', () => {
    expect(parseTags('["x", "a tag that is far too long to be a useful tag at all", "ok tag"]')).toEqual(['ok tag']);
    expect(parseTags(JSON.stringify(Array.from({ length: 15 }, (_, i) => `tag ${i}`)))).toHaveLength(10);
  });
});

describe('generateTags', () => {
  const item = {
    title: 'Coding with agents',
    content: 'the transcript',
    meta: { channel: 'Theo', description: 'About AI.' },
  };

  it('sends the tag prompt with title, channel, description and transcript', async () => {
    const fetch = vi.fn(async () => completion('<think>hmm</think>["AI agents", "gardening"]'));
    const result = await generateTags(settings, item, { fetch });

    expect(result.tags).toEqual(['AI agents', 'gardening']);
    expect(result.model).toBe('qwen3-8b');
    expect(Date.parse(result.createdAt)).not.toBeNaN();
    const [, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    const message: string = JSON.parse(init.body as string).messages[0].content;
    expect(message.startsWith(TAG_PROMPT)).toBe(true);
    for (const part of [
      'Title: Coding with agents',
      'Channel: Theo',
      'Description:\nAbout AI.',
      'Transcript:\nthe transcript',
    ]) {
      expect(message).toContain(part);
    }
  });

  it('fails when the answer has no tags', async () => {
    const fetch = vi.fn(async () => completion('[]'));
    await expect(generateTags(settings, item, { fetch })).rejects.toThrow('no tags');
  });
});
