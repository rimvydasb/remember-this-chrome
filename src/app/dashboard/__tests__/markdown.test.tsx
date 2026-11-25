import { Markdown } from '@tanstack/markdown/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('summary Markdown rendering', () => {
  it('renders the Markdown that local models produce', () => {
    const html = renderToStaticMarkup(
      <Markdown>{'**Main Statement:** Sleep matters.\n\n- Memory\n- Mood\n\n## Details\n\nSee *this*.'}</Markdown>,
    );
    expect(html).toContain('<strong>Main Statement:</strong>');
    expect(html).toContain('<li>Memory</li>');
    expect(html).toContain('<em>this</em>');
    expect(html).toMatch(/<h2[^>]*>Details<\/h2>/);
  });

  it('does not render raw HTML or executable links from the model', () => {
    const html = renderToStaticMarkup(
      <Markdown>{'<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1))'}</Markdown>,
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
  });
});
