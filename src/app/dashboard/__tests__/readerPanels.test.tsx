// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReaderPanels } from '../panels/ReaderPanels';
import type { ReaderPanel } from '../panels/types';
import type { SavedItem } from '../../../shared/types';

const item = {
  id: 'i',
  url: 'u',
  title: 't',
  content: 'c',
  timestamp: '2026-01-01T00:00:00Z',
  type: 'webpage_text',
} as SavedItem;

const panels: ReaderPanel[] = [
  { id: 'a', Component: () => <p>panel A</p> },
  { id: 'b', appliesTo: (i) => i.type === 'youtube_transcript', Component: () => <p>panel B</p> },
  { id: 'c', Component: ({ item: i }) => <p>panel C for {i.id}</p> },
];

describe('ReaderPanels', () => {
  it('renders attached panels in order and skips those that do not apply', () => {
    render(<ReaderPanels item={item} panels={panels} />);
    expect(screen.getByText('panel A')).toBeInTheDocument();
    expect(screen.queryByText('panel B')).not.toBeInTheDocument();
    expect(screen.getByText('panel C for i')).toBeInTheDocument();
  });

  it('renders nothing when no panel is attached', () => {
    const { container } = render(<ReaderPanels item={item} panels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
