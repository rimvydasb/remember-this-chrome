import { describe, expect, it } from 'vitest';
import { DESCRIPTION_BOOST, TITLE_BOOST, descriptionSummary, itemTerms, languageCode, termFrequencies } from '../terms';
import type { SavedItem } from '../types';

const counts = (text: string, language?: Parameters<typeof termFrequencies>[1]) =>
  Object.fromEntries(termFrequencies(text, language).counts);

const item = (title: string, content: string, description?: string): Pick<SavedItem, 'title' | 'content' | 'meta'> => ({
  title,
  content,
  meta: description ? { description } : {},
});

describe('terms', () => {
  it('drops stopwords, transcript fillers, digits and short words', () => {
    expect(counts("Um, yeah, so the GRAVITY is like... 42 gravity's pull, you know? (gravity)")).toEqual({
      gravity: 3,
      pull: 1,
    });
  });

  it('counts plurals as their singular', () => {
    expect(counts('The agents run tests. One agent fixed the test. Agents again.')).toMatchObject({
      agent: 3,
      test: 2,
    });
  });

  it('keeps nouns and drops verbs and adjectives, by context', () => {
    const result = counts('I love building with Lego. We code every day and it is fun. The code is slow.');
    expect(result).toMatchObject({ lego: 1, code: 1 });
    expect(result).not.toHaveProperty('love');
    expect(result).not.toHaveProperty('building');
    expect(result).not.toHaveProperty('fun');
  });

  it('drops generic nouns', () => {
    expect(counts('On the other side, a bunch of reasons. In the end, the compiler is fast.')).toEqual({ compiler: 1 });
  });

  it('keeps acronyms, including two-letter ones', () => {
    const { counts: result, acronyms } = termFrequencies('AI agents call the API. LLMs and AI. The api is slow. ai');
    expect(Object.fromEntries(result)).toMatchObject({ ai: 2, api: 2, llm: 1, agent: 1 });
    expect([...acronyms].sort()).toEqual(['ai', 'llm']);
  });

  it('filters other languages by stopwords only', () => {
    expect(counts('Die KI schreibt den Code. Der Code ist gut und die KI lernt.', 'de')).toMatchObject({
      ki: 2,
      code: 2,
    });
  });

  it('maps language codes and YouTube language names', () => {
    expect(languageCode('de-DE')).toBe('de');
    expect(languageCode('German (auto-generated)')).toBe('de');
    expect(languageCode('Lithuanian')).toBe('en');
    expect(languageCode(undefined)).toBe('en');
  });

  it('takes the first description paragraph as the summary, unless it has a link', () => {
    expect(descriptionSummary('AI made us gardeners.\n\nSponsor: https://example.com')).toBe('AI made us gardeners.');
    expect(descriptionSummary('Get 20% off at https://example.com\n\nAI made us gardeners.')).toBe('');
    expect(descriptionSummary(undefined)).toBe('');
  });

  it('weights terms of the title and the description summary', () => {
    const terms = itemTerms(
      item(
        'Garden basics',
        'The garden has weeds. The compiler has bugs. The browser has tabs. Twitch is a platform.',
        'Weeds explained.\n\nCheck out my Twitch: https://twitch.tv/x',
      ),
    );
    const weights = Object.fromEntries(terms.terms);
    expect(weights.garden).toBe(TITLE_BOOST);
    expect(weights.weed).toBe(DESCRIPTION_BOOST);
    expect(weights.compiler).toBe(1);
    expect(weights.twitch).toBe(1);
  });

  it('finds the topic of a talk about agents, not the verbs around it', () => {
    const transcript = [
      'I love the Lego building block aspect of things. I love shipping. I loved it.',
      'Agents write most of our code now. The agent opens a PR, and another agent reviews it.',
      'My chat asked about AI. Chat with me on Twitch. AI agents changed what an engineer does.',
      'Engineers are gardeners now: we pull weeds out of the codebase while agents plant code.',
    ].join(' ');
    const terms = itemTerms(item('Coding with agents', transcript, 'AI made engineers into gardeners.'));
    const top = terms.terms.slice(0, 3).map(([term]) => term);
    expect(top[0]).toBe('agent');
    expect(top).toEqual(expect.arrayContaining(['engineer']));
    expect(terms.terms.map(([term]) => term)).not.toContain('love');
    expect(terms.acronyms).toEqual(expect.arrayContaining(['ai', 'pr']));
  });

  it('extracts the terms of a transcript-sized text in reasonable time', () => {
    const sentence = 'The agent reviews the pull request while the team ships code to the platform. ';
    const text = sentence.repeat(700); // ~9,800 words, like a 45-minute video.
    const start = performance.now();
    itemTerms(item('Long video', text));
    const elapsed = performance.now() - start;
    console.log(`terms: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(2000);
  });
});
