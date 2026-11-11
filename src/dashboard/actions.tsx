import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { buildExportPayload } from '../shared/importExport';
import { itemsToMarkdown, markdownFileName } from '../shared/markdown';
import { clearLibrary, deleteItems, getAllItems } from '../shared/storage';
import type { SavedItem } from '../shared/types';
import { downloadTextFile } from '../ui/download';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function exportLibraryJson(): Promise<void> {
  const items = await getAllItems();
  const payload = buildExportPayload(items);
  const date = payload.exportedAt.slice(0, 10);
  downloadTextFile(`remember-this-library-${date}.json`, JSON.stringify(payload, null, 2), 'application/json');
  notifications.show({
    color: 'teal',
    title: 'Library exported',
    message: `${plural(items.length, 'item')} saved to your Downloads folder. Move the file to iCloud Drive to sync.`,
  });
}

export function exportMarkdown(items: readonly SavedItem[]): void {
  if (items.length === 0) return;
  downloadTextFile(markdownFileName(items), itemsToMarkdown(items), 'text/markdown');
  notifications.show({
    color: 'teal',
    title: 'Markdown exported',
    message: `${plural(items.length, 'item')} exported.`,
  });
}

export function confirmDelete(items: readonly SavedItem[], onDeleted?: () => void): void {
  if (items.length === 0) return;
  const single = items.length === 1;
  modals.openConfirmModal({
    title: single ? 'Delete this item?' : `Delete ${items.length} items?`,
    centered: true,
    children: (
      <Text size="sm">
        {single ? (
          <>
            <b>{items[0]!.title}</b> will be removed from your library.
          </>
        ) : (
          `${plural(items.length, 'item')} will be removed from your library.`
        )}{' '}
        This cannot be undone.
      </Text>
    ),
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: async () => {
      await deleteItems(items.map((item) => item.id));
      onDeleted?.();
      notifications.show({ color: 'gray', message: `${plural(items.length, 'item')} deleted.` });
    },
  });
}

export function confirmClearLibrary(total: number): void {
  modals.openConfirmModal({
    title: 'Clear the entire library?',
    centered: true,
    children: (
      <Text size="sm">
        All {plural(total, 'item')} will be permanently deleted. Export the library as JSON first if you want a backup.
      </Text>
    ),
    labels: { confirm: 'Delete everything', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: async () => {
      await clearLibrary();
      notifications.show({ color: 'gray', message: 'Library cleared.' });
    },
  });
}
