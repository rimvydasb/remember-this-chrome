import { describe, expect, it } from 'vitest';
import { errorMessage, LlmError } from '../errors';

describe('errorMessage', () => {
  it('reads the message of errors and stringifies other values', () => {
    expect(errorMessage(new LlmError('bad'))).toBe('bad');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(42)).toBe('42');
  });
});
