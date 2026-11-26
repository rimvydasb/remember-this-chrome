import { forwardRef, useState, type ReactNode } from 'react';

export interface Cursor {
  line: number;
  column: number;
}

/** Line and column (1-based) of a position in the text. */
export function cursorAt(text: string, position: number): Cursor {
  const before = text.slice(0, position).split('\n');
  return { line: before.length, column: before.at(-1)!.length + 1 };
}

/** One line of a Mustache template, with `{{value}}` and `{{#section}}` tags marked. */
function highlight(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(/\{\{\{?[^}]*\}?\}\}/g)) {
    const start = match.index;
    if (start > last) parts.push(line.slice(last, start));
    const section = /^\{\{[#^/]/.test(match[0]);
    parts.push(
      <span key={start} className={section ? 'rt-code-s' : 'rt-code-v'}>
        {match[0]}
      </span>,
    );
    last = start + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursor: (cursor: Cursor) => void;
  label: string;
  invalid?: boolean;
}

/**
 * A plain textarea over a highlighted copy of its text. Both layers use the same font, padding and
 * wrapping, so the highlight, the line numbers and the current line follow the text exactly.
 */
export const CodeEditor = forwardRef<HTMLTextAreaElement, CodeEditorProps>(function CodeEditor(
  { value, onChange, onCursor, label, invalid },
  ref,
) {
  const [line, setLine] = useState<number>();
  const report = (target: HTMLTextAreaElement) => {
    const cursor = cursorAt(target.value, target.selectionStart);
    setLine(cursor.line);
    onCursor(cursor);
  };

  return (
    <div className="rt-code" data-invalid={invalid || undefined}>
      <div className="rt-code-inner">
        <div className="rt-code-layer" aria-hidden>
          {value.split('\n').map((text, index) => (
            <div key={index} data-current={index + 1 === line || undefined}>
              {highlight(text)}
              {'​'}
            </div>
          ))}
        </div>
        <textarea
          ref={ref}
          aria-label={label}
          aria-invalid={invalid || undefined}
          spellCheck={false}
          value={value}
          onChange={(event) => {
            onChange(event.currentTarget.value);
            report(event.currentTarget);
          }}
          onSelect={(event) => report(event.currentTarget)}
          onBlur={() => setLine(undefined)}
        />
      </div>
    </div>
  );
});
