import { Button } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconRefresh } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import {
  buildPromptModel,
  PROMPT_FIELDS,
  PromptTemplateError,
  renderPrompt,
  templateFields,
  validateTemplate,
  type PromptField,
  type PromptKind,
  type PromptModel,
} from '../../../shared/promptModel';
import type { SavedItem } from '../../../shared/types';
import { formatNumber } from '../../ui/format';
import { CodeEditor, type Cursor } from './CodeEditor';
import { lineDiff } from './lineDiff';

/** The syntax error of a template, or undefined when it is valid. */
export function templateError(template: string): string | undefined {
  try {
    validateTemplate(template);
    return undefined;
  } catch (error) {
    return error instanceof PromptTemplateError ? error.message : String(error);
  }
}

type Mode = 'edit' | 'preview' | 'diff';

const SAMPLE_QUESTION = 'What is the main argument?';
/** Characters of the transcript that the preview shows. */
const PREVIEW_TRANSCRIPT = 280;

// Markers around inserted values, so the preview can show them; they never reach the model.
const FILL = '\ue000';
const FILL_END = '\ue001';
const MORE = '\ue002';
const MORE_END = '\ue003';

/** A marked value or a "more words" note, kept by `split` as its own part. */
const MARKED = new RegExp(`(${FILL}[\\s\\S]*?${FILL_END}|${MORE}[\\s\\S]*?${MORE_END})`);

const wrap = (text: string) => (text ? `${FILL}${text}${FILL_END}` : text);

/** The model with every inserted value marked, and the transcript shortened. Empty values stay empty, so sections work as they will. */
function markedModel(model: PromptModel): PromptModel {
  const words = model.transcript.split(/\s+/).filter(Boolean).length;
  const head = model.transcript.slice(0, PREVIEW_TRANSCRIPT);
  const rest = model.transcript.length > PREVIEW_TRANSCRIPT ? head.split(/\s+/).filter(Boolean).length : words;
  const transcript =
    model.transcript.length > PREVIEW_TRANSCRIPT
      ? `${wrap(`${head}…`)} ${MORE}(${formatNumber(words - rest)} more words)${MORE_END}`
      : wrap(model.transcript);
  return {
    ...model,
    title: wrap(model.title),
    url: wrap(model.url),
    channel: wrap(model.channel),
    language: wrap(model.language),
    duration: wrap(model.duration),
    savedAt: wrap(model.savedAt),
    description: wrap(model.description),
    transcript,
    summary: wrap(model.summary),
    question: wrap(model.question),
    tags: model.tags.map(wrap),
    links: model.links.map((link) => ({ url: wrap(link.url), label: wrap(link.label) })),
    chapters: model.chapters.map((chapter) => ({ time: wrap(chapter.time), title: wrap(chapter.title) })),
    questions: model.questions.map((entry) => ({
      question: wrap(entry.question),
      answer: wrap(entry.answer),
      model: wrap(entry.model),
      askedAt: wrap(entry.askedAt),
    })),
  };
}

interface Preview {
  parts: { text: string; kind: 'text' | 'fill' | 'more' }[];
  /** Rough token count of the full request: about 4 characters per token. */
  tokens: number;
}

function buildPreview(template: string, item: SavedItem, kind: PromptKind): Preview {
  const model = buildPromptModel(item, kind === 'question' ? { question: SAMPLE_QUESTION } : undefined);
  const tokens = Math.ceil(renderPrompt(template, model, kind).length / 4);
  const marked = renderPrompt(template, markedModel(model), kind);
  const parts = marked
    .split(MARKED)
    .filter(Boolean)
    .map((text) =>
      text.startsWith(FILL)
        ? { text: text.slice(1, -1), kind: 'fill' as const }
        : text.startsWith(MORE)
          ? { text: text.slice(1, -1), kind: 'more' as const }
          : { text, kind: 'text' as const },
    );
  return { parts, tokens };
}

interface PromptEditorProps {
  kind: PromptKind;
  label: string;
  value: string;
  defaultValue: string;
  /** Fields the template should use; a warning shows when it does not. */
  expected: PromptField[];
  /** The item the preview fills in; usually the open one. */
  previewItem: SavedItem | undefined;
  onChange: (value: string) => void;
}

/**
 * The editor of one prompt template: highlighted fields, a palette that inserts at the cursor,
 * validation as you type, a preview filled with an item, and a diff against the default.
 */
export function PromptEditor({ kind, label, value, defaultValue, expected, previewItem, onChange }: PromptEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>('edit');
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1 });

  const error = templateError(value);
  const used = error ? undefined : templateFields(value);
  const legacy = used?.size === 0;
  const missing = used && !legacy ? expected.filter((name) => !used.has(name)) : [];
  const fields = PROMPT_FIELDS.filter((field) => field.kinds.includes(kind));
  const values = fields.filter((field) => !field.snippet.startsWith('{{#'));
  const blocks = fields.filter((field) => field.snippet.startsWith('{{#'));
  const preview = useMemo(
    () => (error || !previewItem ? undefined : buildPreview(value, previewItem, kind)),
    [error, previewItem, value, kind],
  );
  const diff = useMemo(() => (mode === 'diff' ? lineDiff(defaultValue, value) : []), [mode, defaultValue, value]);

  const insert = (snippet: string) => {
    setMode('edit');
    const textarea = ref.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + snippet + value.slice(end));
    requestAnimationFrame(() => {
      const editor = ref.current;
      editor?.focus();
      editor?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const field = (info: (typeof fields)[number]) => (
    <button
      key={info.name}
      type="button"
      className="rt-field"
      data-block={info.snippet.startsWith('{{#') || undefined}
      aria-label={info.name}
      title={`Insert ${info.snippet.split('\n')[0]}`}
      onClick={() => insert(info.snippet)}
    >
      <code>
        {info.name}
        {used?.has(info.name) && (
          <span className="rt-field-used">
            <IconCheck size={12} />
            used
          </span>
        )}
      </code>
      <small>{info.description}</small>
    </button>
  );

  return (
    <>
      <div className="rt-editor-wrap">
        <div className="rt-etool">
          <div className="rt-seg" role="radiogroup" aria-label="View">
            {(
              [
                ['edit', 'Edit'],
                ['preview', 'Preview'],
                ['diff', 'Diff vs default'],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                data-active={mode === key || undefined}
                onClick={() => setMode(key)}
              >
                {text}
              </button>
            ))}
          </div>
          {mode === 'preview' && previewItem && (
            <span className="rt-meta rt-etool-item">
              with <b>{previewItem.title || 'Untitled'}</b>
            </span>
          )}
          <span className="rt-spacer" />
          {value !== defaultValue && (
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={<IconRefresh size={14} />}
              onClick={() => onChange(defaultValue)}
            >
              Reset to default
            </Button>
          )}
        </div>

        <div className="rt-editor-main">
          {mode === 'edit' && (
            <CodeEditor
              ref={ref}
              label={label}
              value={value}
              onChange={onChange}
              onCursor={setCursor}
              invalid={!!error}
            />
          )}
          {mode === 'preview' && (
            <div className="rt-preview" aria-label={`${label} preview`}>
              {error ? (
                <span className="rt-preview-note">Fix the template error to see the preview.</span>
              ) : !preview ? (
                <span className="rt-preview-note">The preview needs an item in the library.</span>
              ) : (
                preview.parts.map((part, index) =>
                  part.kind === 'text' ? (
                    part.text
                  ) : (
                    <span key={index} className={part.kind === 'fill' ? 'rt-fill' : 'rt-trunc'}>
                      {part.text}
                    </span>
                  ),
                )
              )}
            </div>
          )}
          {mode === 'diff' && (
            <div className="rt-code rt-diff" aria-label={`${label} changes`}>
              <div className="rt-code-layer">
                {diff.map((line, index) => (
                  <div key={index} data-diff={line.kind}>
                    {line.text}
                    {'​'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="rt-fields" aria-label="Insert field">
          <span className="rt-label">Insert field</span>
          {values.map(field)}
          <span className="rt-label rt-gap">Repeat blocks</span>
          {blocks.map(field)}
        </aside>

        <div className="rt-vbar">
          {error ? (
            <span className="rt-vbar-err" role="alert">
              <IconAlertTriangle size={12} />
              Template error: {error}
            </span>
          ) : (
            <>
              <span className="rt-vbar-ok">
                <IconCheck size={12} />
                Valid template
              </span>
              {used && used.size > 0 && <span className="rt-vbar-uses">uses {[...used].join(' · ')}</span>}
            </>
          )}
          <span className="rt-spacer" />
          {preview && <span>≈ {formatNumber(preview.tokens)} tokens with the open item</span>}
          {mode === 'edit' && (
            <span>
              Ln {cursor.line}, Col {cursor.column}
            </span>
          )}
        </div>
      </div>

      {legacy && (
        <div className="rt-alert" data-tone="info">
          <IconAlertTriangle size={16} />
          <p>
            The template uses no fields, so the title and the transcript
            {kind === 'question' ? ' and the question are' : ' are'} added at the end of the request.
          </p>
        </div>
      )}
      {missing.length > 0 && (
        <div className="rt-alert" data-tone="warn">
          <IconAlertTriangle size={16} />
          <p>
            The template does not use {missing.map((name) => `{{${name}}}`).join(' or ')}, so the model does not get it.
          </p>
        </div>
      )}
      <div className="rt-syntax">
        <span>
          <code>{'{{field}}'}</code> inserts a value
        </span>
        <span>
          <code>{'{{#list}}…{{/list}}'}</code> repeats, or shows when not empty
        </span>
        <span>
          <code>{'{{^field}}…{{/field}}'}</code> shows when empty
        </span>
      </div>
    </>
  );
}
