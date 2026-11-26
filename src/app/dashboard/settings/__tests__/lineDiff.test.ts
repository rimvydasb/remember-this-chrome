import { describe, expect, it } from 'vitest';
import { lineDiff } from '../lineDiff';

describe('lineDiff', () => {
  it('marks nothing when the texts are equal', () => {
    expect(lineDiff('a\nb', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
    ]);
  });

  it('shows a replaced line as removed, then added', () => {
    expect(lineDiff('a\nold\nc', 'a\nnew\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('handles lines added at the end and removed at the start', () => {
    expect(lineDiff('x\na', 'a\ny')).toEqual([
      { kind: 'del', text: 'x' },
      { kind: 'same', text: 'a' },
      { kind: 'add', text: 'y' },
    ]);
  });
});
