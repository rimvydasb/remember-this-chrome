import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResponse } from '../../shared/types';

const captureTab = vi.hoisted(() => vi.fn());
vi.mock('../capture', () => ({ captureTab }));

type MessageListener = (
  message: unknown,
  sender: Record<string, unknown>,
  sendResponse: (r: unknown) => void,
) => boolean;
type CommandListener = (command: string, tab?: { id?: number }) => Promise<void>;

let onMessage: MessageListener;
let onCommand: CommandListener;
let action: Record<'setBadgeText' | 'setBadgeBackgroundColor' | 'setTitle', ReturnType<typeof vi.fn>>;
let query: ReturnType<typeof vi.fn>;

const OK: CaptureResponse = {
  ok: true,
  created: true,
  changed: [],
  item: {
    id: 'a',
    title: 'Saved title',
    url: 'https://x',
    type: 'webpage_text',
    content: 'c',
    timestamp: '2026-01-01T00:00:00.000Z',
  },
  stats: { extractMs: 1, words: 1, paragraphs: 1, source: 'dom' },
};

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  captureTab.mockReset();
  query = vi.fn(async () => [{ id: 9 }]);
  action = {
    setBadgeText: vi.fn(async () => {}),
    setBadgeBackgroundColor: vi.fn(async () => {}),
    setTitle: vi.fn(async () => {}),
  };
  vi.stubGlobal('chrome', {
    runtime: { id: 'me', onMessage: { addListener: (l: MessageListener) => (onMessage = l) } },
    commands: { onCommand: { addListener: (l: CommandListener) => (onCommand = l) } },
    tabs: { query },
    action,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../index');
});

describe('background messages', () => {
  it('captures the tab and sends the response back', async () => {
    captureTab.mockResolvedValue(OK);
    const sendResponse = vi.fn();
    const keepOpen = onMessage({ type: 'capture-tab', tabId: 5 }, { id: 'me' }, sendResponse);
    expect(keepOpen).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(OK));
    expect(captureTab).toHaveBeenCalledWith(5);
  });

  it('turns a crash into an error response', async () => {
    captureTab.mockRejectedValue(new Error('boom'));
    const sendResponse = vi.fn();
    onMessage({ type: 'capture-tab', tabId: 5 }, { id: 'me' }, sendResponse);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, code: 'extraction_failed', error: 'boom' }),
    );
  });

  it('ignores messages from other extensions and from web pages', () => {
    const sendResponse = vi.fn();
    expect(onMessage({ type: 'capture-tab', tabId: 5 }, { id: 'other' }, sendResponse)).toBe(false);
    expect(onMessage({ type: 'capture-tab', tabId: 5 }, { id: 'me', tab: { id: 1 } }, sendResponse)).toBe(false);
    expect(captureTab).not.toHaveBeenCalled();
  });

  it('ignores unknown messages and a tab ID that is not a number', () => {
    expect(onMessage({ type: 'other' }, { id: 'me' }, vi.fn())).toBe(false);
    expect(onMessage({ type: 'capture-tab', tabId: '5' }, { id: 'me' }, vi.fn())).toBe(false);
    expect(onMessage(undefined, { id: 'me' }, vi.fn())).toBe(false);
    expect(captureTab).not.toHaveBeenCalled();
  });
});

describe('keyboard shortcut', () => {
  it('captures the current tab and shows a green check, then clears the badge', async () => {
    captureTab.mockResolvedValue(OK);
    await onCommand('capture-current-tab', { id: 3 });
    expect(action.setBadgeText).toHaveBeenNthCalledWith(1, { tabId: 3, text: '…' });
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '✓' });
    expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 3, color: '#2f9e44' });
    expect(action.setTitle).toHaveBeenCalledWith({ tabId: 3, title: 'Saved: Saved title' });

    await vi.advanceTimersByTimeAsync(4000);
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 3, text: '' });
    expect(action.setTitle).toHaveBeenLastCalledWith({ tabId: 3, title: 'Remember This' });
  });

  it('shows "!" and the error when the capture fails', async () => {
    captureTab.mockResolvedValue({ ok: false, code: 'no_captions', error: 'No captions.' });
    await onCommand('capture-current-tab', { id: 3 });
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '!' });
    expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 3, color: '#e03131' });
    expect(action.setTitle).toHaveBeenCalledWith({ tabId: 3, title: 'Remember This: No captions.' });
  });

  it('shows a dash for something that is not implemented', async () => {
    captureTab.mockResolvedValue({ ok: false, code: 'not_implemented', error: 'Later.' });
    await onCommand('capture-current-tab', { id: 3 });
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '–' });
  });

  it('falls back to the active tab when the command has none', async () => {
    captureTab.mockResolvedValue(OK);
    await onCommand('capture-current-tab', undefined);
    expect(captureTab).toHaveBeenCalledWith(9);
  });

  it('does nothing without a tab, and ignores other commands', async () => {
    query.mockResolvedValue([]);
    await onCommand('capture-current-tab', undefined);
    await onCommand('something-else', { id: 3 });
    expect(captureTab).not.toHaveBeenCalled();
    expect(action.setBadgeText).not.toHaveBeenCalled();
  });
});
