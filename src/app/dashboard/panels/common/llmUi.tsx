import { Typography } from '@mantine/core';
import { Markdown } from '@tanstack/markdown/react';
import type { ComponentPropsWithoutRef } from 'react';

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
