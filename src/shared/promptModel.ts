import Mustache from 'mustache';
import { formatDuration } from './markdown';
import { followUpsOfType } from './followUpRecords';
import type { SavedItem } from './types';

/**
 * Prompt templates use Mustache syntax (the logic-less core of Handlebars): `{{name}}` inserts a
 * value, `{{#list}}…{{/list}}` repeats for each entry (or shows once when a text is not empty),
 * `{{^name}}…{{/name}}` shows when a value is empty. Handlebars itself compiles templates with
 * `new Function`, which Manifest V3 extension pages forbid; Mustache interprets them.
 */

/** A question that the user asked earlier, with its answer. */
export interface PromptQuestion {
  question: string;
  answer: string;
  /** The model that answered; empty when unknown. */
  model: string;
  /** Date of the question, `YYYY-MM-DD`. */
  askedAt: string;
}

export interface PromptLink {
  url: string;
  /** Text next to the URL that tells what it is; empty when there is none. */
  label: string;
}

export interface PromptChapter {
  /** Start of the chapter, for example `12:05`. */
  time: string;
  title: string;
}

/** The business object model that prompt templates read. Every field is always present. */
export interface PromptModel {
  title: string;
  url: string;
  /** `video` for a YouTube transcript, `page` for web page text. */
  kind: 'video' | 'page';
  /** True for a YouTube transcript. For `{{#isVideo}}…{{/isVideo}}`. */
  isVideo: boolean;
  channel: string;
  language: string;
  /** Length of the video, for example `1:02:03`; empty for pages. */
  duration: string;
  /** Date the item was saved, `YYYY-MM-DD`. */
  savedAt: string;
  /** The video description. */
  description: string;
  /** The transcript or page text. */
  transcript: string;
  /** The latest AI summary; empty when there is none. */
  summary: string;
  /** AI tags, most relevant first. Each is `{{.}}` inside `{{#tags}}`. */
  tags: string[];
  links: PromptLink[];
  chapters: PromptChapter[];
  /** Answered questions, oldest first. In the question prompt, without the question being asked. */
  questions: PromptQuestion[];
  /** The question being asked. Question prompt only; empty elsewhere. */
  question: string;
}

export type PromptField = keyof PromptModel;

export type PromptKind = 'summary' | 'question';

/** Documentation of the fields for the settings editor. `snippet` is inserted on click. */
export interface PromptFieldInfo {
  name: PromptField;
  description: string;
  snippet: string;
  /** Prompts where the field has a value. */
  kinds: readonly PromptKind[];
}

const BOTH: readonly PromptKind[] = ['summary', 'question'];

export const PROMPT_FIELDS: readonly PromptFieldInfo[] = [
  { name: 'transcript', description: 'Transcript or page text', snippet: '{{transcript}}', kinds: BOTH },
  { name: 'question', description: 'The question being asked', snippet: '{{question}}', kinds: ['question'] },
  { name: 'title', description: 'Title of the video or page', snippet: '{{title}}', kinds: BOTH },
  { name: 'channel', description: 'Channel of the video', snippet: '{{channel}}', kinds: BOTH },
  { name: 'description', description: 'Video description', snippet: '{{description}}', kinds: BOTH },
  {
    name: 'summary',
    description: 'Latest AI summary, if any',
    snippet: '{{#summary}}\nSummary:\n{{summary}}\n{{/summary}}',
    kinds: ['question'],
  },
  {
    name: 'questions',
    description: 'Earlier questions with their answers: {{question}}, {{answer}}, {{model}}, {{askedAt}}',
    snippet: '{{#questions}}\nQ: {{question}}\nA: {{answer}}\n\n{{/questions}}',
    kinds: BOTH,
  },
  {
    name: 'chapters',
    description: 'Video chapters: {{time}}, {{title}}',
    snippet: '{{#chapters}}\n- {{time}} {{title}}\n{{/chapters}}',
    kinds: BOTH,
  },
  {
    name: 'links',
    description: 'Links from the description: {{url}}, {{label}}',
    snippet: '{{#links}}\n- {{url}} {{label}}\n{{/links}}',
    kinds: BOTH,
  },
  { name: 'tags', description: 'AI tags; each one is {{.}}', snippet: '{{#tags}}{{.}}, {{/tags}}', kinds: BOTH },
  { name: 'url', description: 'Address of the video or page', snippet: '{{url}}', kinds: BOTH },
  { name: 'kind', description: '"video" or "page"', snippet: '{{kind}}', kinds: BOTH },
  { name: 'isVideo', description: 'True for a video', snippet: '{{#isVideo}}{{/isVideo}}', kinds: BOTH },
  { name: 'duration', description: 'Length of the video, e.g. 12:05', snippet: '{{duration}}', kinds: BOTH },
  { name: 'language', description: 'Transcript language code', snippet: '{{language}}', kinds: BOTH },
  { name: 'savedAt', description: 'Date the item was saved', snippet: '{{savedAt}}', kinds: BOTH },
];

/** The item fields that the model reads. */
export type PromptItem = Pick<SavedItem, 'title' | 'url' | 'type' | 'content' | 'timestamp'> &
  Partial<Pick<SavedItem, 'meta' | 'followUps' | 'aiTags'>>;

const day = (iso: string) => (Number.isNaN(Date.parse(iso)) ? '' : new Date(iso).toISOString().slice(0, 10));

/**
 * Builds the template model of an item. With `question`, builds the model of the question prompt:
 * `question` is set and the follow-up with `questionId` (the one being answered) is left out of
 * `questions`.
 */
export function buildPromptModel(item: PromptItem, ask?: { question: string; questionId?: string }): PromptModel {
  const meta = item.meta ?? {};
  const summary = followUpsOfType(item, 'llm-summary').at(-1);
  return {
    title: item.title || 'Untitled',
    url: item.url,
    kind: item.type === 'youtube_transcript' ? 'video' : 'page',
    isVideo: item.type === 'youtube_transcript',
    channel: meta.channel ?? '',
    language: meta.language ?? '',
    duration: meta.durationSec ? formatDuration(meta.durationSec) : '',
    savedAt: day(item.timestamp),
    description: meta.description?.trim() ?? '',
    transcript: item.content,
    summary: summary?.generatedContent.trim() ?? '',
    tags: item.aiTags?.tags ?? [],
    links: (meta.links ?? []).map((link) => ({ url: link.url, label: link.label ?? '' })),
    chapters: (meta.chapters ?? []).map((chapter) => ({
      time: formatDuration(chapter.startSec),
      title: chapter.title,
    })),
    questions: followUpsOfType(item, 'user-question')
      .filter(
        (followUp) =>
          followUp.id !== ask?.questionId && followUp.userContent?.trim() && followUp.generatedContent.trim(),
      )
      .map((followUp) => ({
        question: followUp.userContent!.trim(),
        answer: followUp.generatedContent.trim(),
        model: followUp.model ?? '',
        askedAt: day(followUp.createdAt),
      })),
    question: ask?.question.trim() ?? '',
  };
}

export class PromptTemplateError extends Error {}

type Token = [string, string, number, number, Token[]?, ...unknown[]];

function parse(template: string): Token[] {
  try {
    return Mustache.parse(template) as unknown as Token[];
  } catch (error) {
    throw new PromptTemplateError(error instanceof Error ? error.message : String(error));
  }
}

/** Names that the template reads (values, sections, inverted sections), top level and nested. */
export function templateFields(template: string): Set<string> {
  const names = new Set<string>();
  const walk = (tokens: Token[]) => {
    for (const token of tokens) {
      if (['name', '&', '#', '^'].includes(token[0])) names.add(token[1]);
      if (token[4]) walk(token[4]);
    }
  };
  walk(parse(template));
  return names;
}

/** Throws `PromptTemplateError` with the syntax error, if the template has one. */
export function validateTemplate(template: string): void {
  parse(template);
}

/**
 * Renders a template with the model. Values are inserted as they are (no HTML escaping). A
 * template without any tag (written before templates) gets the title, the transcript and, in the
 * question prompt, the question appended.
 */
export function renderPrompt(template: string, model: PromptModel, kind: PromptKind): string {
  const tokens = parse(template.trim());
  if (tokens.every((token) => token[0] === 'text')) {
    let message = `${template.trim()}\n\nTitle: ${model.title}\n\nTranscript:\n${model.transcript}`;
    if (kind === 'question') message += `\n\nQuestion: ${model.question}`;
    return message;
  }
  return Mustache.render(template.trim(), model, undefined, { escape: (value: unknown) => String(value) }).trim();
}
