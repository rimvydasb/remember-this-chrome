import { describe, expect, it } from 'vitest';
import { makeItem } from '../../../test/items';
import { buildFallbackQueries } from '../fallbackQueries';
import { parseQueries } from '../parseQueries';
import { buildQueryMessage, QUERY_PROMPT } from '../prompt';

describe('parseQueries', () => {
  it('parseQueries reads a JSON array inside a code fence', () => {
    const answer =
      'Here you go:\n```json\n["sleep deprivation memory study", "hippocampus synaptic plasticity sleep"]\n```';
    expect(parseQueries(answer)).toEqual(['sleep deprivation memory study', 'hippocampus synaptic plasticity sleep']);
  });

  it('reads one query per line, strips markers and quotes, and drops duplicates', () => {
    expect(parseQueries('1. "caffeine social memory"\n- Caffeine Social Memory\n* sleep and memory study,\n')).toEqual([
      'caffeine social memory',
      'sleep and memory study',
    ]);
  });

  it('drops empty and overlong queries and keeps at most 5', () => {
    const long = Array.from({ length: 21 }, (_, i) => `w${i}`).join(' ');
    const answer = JSON.stringify(['', 'ab', long, 'q one', 'q two', 'q three', 'q four', 'q five', 'q six']);
    expect(parseQueries(answer)).toEqual(['q one', 'q two', 'q three', 'q four', 'q five']);
  });
});

describe('buildQueryMessage', () => {
  it('sends the prompt, title, channel, description and the text, named by item type', () => {
    const video = buildQueryMessage(
      makeItem({ type: 'youtube_transcript', title: 'T', content: 'words', meta: { channel: 'C', description: 'D' } }),
    );
    expect(video).toBe(`${QUERY_PROMPT}\n\nTitle: T\n\nChannel: C\n\nDescription:\nD\n\nTranscript:\nwords`);
    expect(buildQueryMessage(makeItem({ content: 'text' }))).toContain('Page text:\ntext');
  });
});

describe('buildFallbackQueries', () => {
  it('builds a title query and a tag query without the channel', () => {
    const item = makeItem({
      title: 'Why We Sleep (Official Video) | Science Channel',
      aiTags: { tags: ['sleep', 'Science Channel', 'memory', 'hippocampus', 'REM', 'dreams'], createdAt: '2026-01-01' },
      meta: { channel: 'Science Channel' },
    });
    expect(buildFallbackQueries(item)).toEqual(['Why We Sleep', 'sleep memory hippocampus REM']);
  });

  it('uses keyword tags when the item has no AI tags', () => {
    const queries = buildFallbackQueries(
      makeItem({ title: 'Sleep and memory', content: 'The hippocampus replays memory during sleep. Sleep matters.' }),
    );
    expect(queries[0]).toBe('Sleep and memory');
    expect(queries[1]).toMatch(/sleep/);
  });
});
