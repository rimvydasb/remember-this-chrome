import type { CaptureResponse, RuntimeMessage } from '../shared/types';
import { captureTab } from './capture';

async function safeCapture(tabId: number): Promise<CaptureResponse> {
  try {
    return await captureTab(tabId);
  } catch (error) {
    console.error('[Remember This] capture failed', error);
    return {
      ok: false,
      code: 'extraction_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  // Only accept messages from the extension's own pages.
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  if (message?.type === 'capture-tab' && typeof message.tabId === 'number') {
    safeCapture(message.tabId).then(sendResponse);
    return true; // keep the channel open for the async response
  }
  return false;
});

async function flashBadge(tabId: number, response: CaptureResponse): Promise<void> {
  const text = response.ok ? '✓' : response.code === 'not_implemented' ? '–' : '!';
  const color = response.ok ? '#2f9e44' : response.code === 'not_implemented' ? '#868e96' : '#e03131';
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setTitle({
    tabId,
    title: response.ok ? `Saved: ${response.item.title}` : `Remember This: ${response.error}`,
  });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined);
    chrome.action.setTitle({ tabId, title: 'Remember This' }).catch(() => undefined);
  }, 4000);
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'capture-current-tab') return;
  const tabId = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (tabId === undefined) return;
  await chrome.action.setBadgeText({ tabId, text: '…' });
  await flashBadge(tabId, await safeCapture(tabId));
});
