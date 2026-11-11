import { Alert, Anchor, Badge, Button, Checkbox, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCircleCheck, IconDatabase, IconPlugConnected } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { backfillThumbnails, countMissingThumbnails } from '../shared/thumbnail';
import { listModels, LlmError, requestLlmPermission } from '../shared/llm';
import { DEFAULT_SETTINGS, saveSettings, type LlmSettings } from '../shared/settings';
import { useSettings } from './useSettings';

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;

interface SettingsDialogProps {
  opened: boolean;
  onClose: () => void;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; models: string[] }
  | { status: 'error'; message: string };

const errorMessage = (error: unknown) => (error instanceof LlmError ? error.message : String(error));

export function SettingsDialog({ opened, onClose }: SettingsDialogProps) {
  const stored = useSettings();
  const [draft, setDraft] = useState<LlmSettings>(DEFAULT_SETTINGS.llm);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  // Start from the stored values each time the dialog opens.
  useEffect(() => {
    if (opened && stored) {
      setDraft(stored.llm);
      setTest({ status: 'idle' });
    }
  }, [opened, stored]);

  const [usage, setUsage] = useState<{ bytes: number; missing: number } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const refreshUsage = () =>
    Promise.all([chrome.storage.local.getBytesInUse(null), countMissingThumbnails()]).then(([bytes, missing]) =>
      setUsage({ bytes, missing }),
    );

  useEffect(() => {
    if (opened) void refreshUsage();
  }, [opened]);

  const downloadThumbnails = async () => {
    setDownloading(true);
    try {
      const { saved, failed } = await backfillThumbnails();
      notifications.show(
        failed > 0
          ? {
              color: 'red',
              message: `Saved ${saved}, failed ${failed}. If all failed, reload the extension at chrome://extensions and approve the new permission.`,
            }
          : { color: 'teal', message: `Saved ${saved} thumbnail${saved === 1 ? '' : 's'}.` },
      );
      await refreshUsage();
    } finally {
      setDownloading(false);
    }
  };

  const update = (patch: Partial<LlmSettings>) => setDraft((previous) => ({ ...previous, ...patch }));

  const testConnection = () => {
    // The permission request must start inside the click handler (user gesture).
    const permission = requestLlmPermission(draft.baseUrl);
    setTest({ status: 'testing' });
    permission
      .then(async (granted) => {
        if (!granted) throw new LlmError(`Permission to access ${draft.baseUrl} was denied.`);
        const models = await listModels(draft);
        setTest({ status: 'ok', models });
      })
      .catch((error: unknown) => setTest({ status: 'error', message: errorMessage(error) }));
  };

  const save = async () => {
    await saveSettings({ llm: draft });
    notifications.show({ color: 'teal', message: 'Settings saved.' });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="lg" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Summaries and tags use a local LLM through an OpenAI-compatible API (for example LM Studio). The transcript
          is sent only to this server.
        </Text>

        <TextInput
          label="LLM server address"
          description="LM Studio: Developer → Start server. Use the address of the computer that runs it."
          placeholder={DEFAULT_SETTINGS.llm.baseUrl}
          value={draft.baseUrl}
          onChange={(event) => update({ baseUrl: event.currentTarget.value })}
        />

        <TextInput
          label="Model"
          description="Leave empty to use the model that the server has loaded."
          placeholder="Loaded model"
          value={draft.model}
          onChange={(event) => update({ model: event.currentTarget.value })}
        />

        <Group gap="xs">
          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlugConnected size={15} />}
            loading={test.status === 'testing'}
            onClick={testConnection}
          >
            Test connection
          </Button>
        </Group>
        {test.status === 'ok' && (
          <Alert color="teal" icon={<IconCircleCheck size={18} />} title="Connected">
            {test.models.length === 0 ? (
              <Text size="sm">The server has no models available.</Text>
            ) : (
              <Stack gap={6}>
                <Text size="sm">Available models (click to select):</Text>
                <Group gap={6}>
                  {test.models.map((model) => (
                    <Badge
                      key={model}
                      variant={draft.model === model ? 'filled' : 'light'}
                      style={{ cursor: 'pointer', textTransform: 'none' }}
                      onClick={() => update({ model })}
                    >
                      {model}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            )}
          </Alert>
        )}
        {test.status === 'error' && (
          <Alert color="red" icon={<IconAlertCircle size={18} />} title="Connection failed">
            {test.message}
          </Alert>
        )}

        <Stack gap={4}>
          <Textarea
            label="Summary prompt"
            description="Sent to the model before the transcript."
            autosize
            minRows={3}
            maxRows={10}
            value={draft.summaryPrompt}
            onChange={(event) => update({ summaryPrompt: event.currentTarget.value })}
          />
          {draft.summaryPrompt !== DEFAULT_SETTINGS.llm.summaryPrompt && (
            <Anchor
              component="button"
              type="button"
              size="xs"
              ta="left"
              onClick={() => update({ summaryPrompt: DEFAULT_SETTINGS.llm.summaryPrompt })}
            >
              Reset to default prompt
            </Anchor>
          )}
        </Stack>

        <Checkbox
          label="Use LLM for tagging"
          description="Generates tags for items in the background while the dashboard is open. Items show keyword-extraction tags until then, and when the LLM is not reachable."
          checked={draft.useForTags}
          onChange={(event) => update({ useForTags: event.currentTarget.checked })}
        />

        <Stack gap={6}>
          <Group gap={6}>
            <IconDatabase size={16} />
            <Text size="sm" fw={500}>
              Storage
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            Everything is stored on this computer in the browser's extension storage (chrome.storage.local): your
            transcripts, summaries, tags and small video thumbnails. Nothing is uploaded. Space is not limited.
          </Text>
          <Text size="sm">Used now: {usage ? formatMb(usage.bytes) : '…'}</Text>
          {usage !== null && usage.missing > 0 && (
            <Group gap="xs">
              <Button variant="light" size="xs" loading={downloading} onClick={downloadThumbnails}>
                Download {usage.missing} missing thumbnail{usage.missing === 1 ? '' : 's'}
              </Button>
            </Group>
          )}
        </Stack>

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!stored}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
