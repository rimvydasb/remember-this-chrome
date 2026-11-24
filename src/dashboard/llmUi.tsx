import { Typography } from '@mantine/core';
import { Markdown } from '@tanstack/markdown/react';
import type { ComponentPropsWithoutRef } from 'react';
import { LlmError, requestLlmPermission } from '../shared/llm';

/** Links in LLM output open in a new tab, so they do not replace the dashboard. */
const MARKDOWN_COMPONENTS = {
  a: (props: ComponentPropsWithoutRef<'a'>) => <a {...props} target="_blank" rel="noreferrer" />,
};

/** Renders LLM output (Markdown) in the reader style. */
export function LlmMarkdown({ children }: { children: string }) {
  return (
    <Typography className="rt-reader rt-follow-up">
      <Markdown components={MARKDOWN_COMPONENTS}>{children}</Markdown>
    </Typography>
  );
}

/**
 * Asks for the permission to call the LLM server; rejects with `LlmError` when it is denied.
 * Call it directly in a click handler, before any `await`: Chrome shows the prompt only during a
 * user gesture.
 */
export function ensureLlmPermission(baseUrl: string): Promise<void> {
  return requestLlmPermission(baseUrl).then((granted) => {
    if (!granted) throw new LlmError(`Permission to access ${baseUrl} was denied.`);
  });
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
