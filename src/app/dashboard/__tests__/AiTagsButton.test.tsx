// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeItem, renderApp } from '../../test/render';
import { AiTagsButton } from '../AiTagsButton';

const state = vi.hoisted(() => ({ ready: true, generating: false, generate: vi.fn(async () => {}) }));
vi.mock('../useGenerateTags', () => ({ useGenerateTags: () => state }));

beforeEach(() => {
  state.ready = true;
  state.generating = false;
  state.generate.mockClear();
});

describe('AiTagsButton', () => {
  it('generates tags on click', async () => {
    const { user } = renderApp(<AiTagsButton item={makeItem()} />);
    await user.click(screen.getByRole('button', { name: 'Regenerate tags with AI' }));
    expect(state.generate).toHaveBeenCalledOnce();
  });

  it('is disabled until the settings are loaded', () => {
    state.ready = false;
    renderApp(<AiTagsButton item={makeItem()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows progress while this chip or the background tagger works on the item', () => {
    state.generating = true;
    const { unmount } = renderApp(<AiTagsButton item={makeItem()} />);
    expect(screen.getByRole('button', { name: 'Generating tags…' })).toBeDisabled();
    unmount();

    state.generating = false;
    renderApp(<AiTagsButton item={makeItem()} busy />);
    expect(screen.getByRole('button', { name: 'Generating tags…' })).toBeDisabled();
  });
});
