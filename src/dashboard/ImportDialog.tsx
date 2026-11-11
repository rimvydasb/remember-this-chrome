import { Alert, Button, Group, Modal, Radio, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import type { ImportMode, ParsedImport } from '../shared/importExport';
import { applyImport } from '../shared/storage';
import { formatNumber } from '../ui/format';

interface ImportDialogProps {
  fileName: string;
  parsed: ParsedImport;
  libraryCount: number;
  onClose: () => void;
}

export function ImportDialog({ fileName, parsed, libraryCount, onClose }: ImportDialogProps) {
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const plan = await applyImport(parsed.items, mode);
      const parts = [`${plan.added} added`, `${plan.updated} updated`];
      if (plan.unchanged) parts.push(`${plan.unchanged} already up to date`);
      if (plan.removed) parts.push(`${plan.removed} removed`);
      notifications.show({ color: 'teal', title: 'Import complete', message: parts.join(' · ') });
      onClose();
    } catch (error) {
      notifications.show({ color: 'red', title: 'Import failed', message: String(error) });
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title="Import library" centered size="md">
      <Stack gap="md">
        <Text size="sm">
          <b>{fileName}</b> contains <b>{formatNumber(parsed.items.length)}</b> valid{' '}
          {parsed.items.length === 1 ? 'item' : 'items'}.
        </Text>

        {parsed.rejected.length > 0 && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle />} p="sm">
            <Text size="sm">
              {parsed.rejected.length} invalid {parsed.rejected.length === 1 ? 'record' : 'records'} will be skipped
              (first problem: record #{parsed.rejected[0]!.index + 1}, {parsed.rejected[0]!.reason}).
            </Text>
          </Alert>
        )}

        <Radio.Group
          value={mode}
          onChange={(value) => setMode(value as ImportMode)}
          label="How should items be imported?"
        >
          <Stack gap="sm" mt="xs">
            <Radio
              value="merge"
              label="Merge"
              description="Add new items and update items where the imported copy is newer. Nothing is deleted."
            />
            <Radio
              value="replace"
              color="red"
              label="Replace"
              description={`Replace the current library (${formatNumber(libraryCount)} items) with the file's contents.`}
            />
          </Stack>
        </Radio.Group>

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button color={mode === 'replace' ? 'red' : undefined} loading={busy} onClick={run}>
            {mode === 'replace' ? 'Replace library' : 'Merge into library'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
