import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconDatabase,
  IconMessageQuestion,
  IconPlugConnected,
  IconServer,
  IconSparkles,
  IconTags,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { listModels, LlmError, requestLlmPermission } from '../shared/llm';
import {
  PROMPT_FIELDS,
  PromptTemplateError,
  templateFields,
  validateTemplate,
  type PromptField,
  type PromptKind,
} from '../shared/promptModel';
import { DEFAULT_SETTINGS, saveSettings, type LlmSettings } from '../shared/settings';
import { backfillThumbnails, countMissingThumbnails } from '../shared/thumbnail';
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

type Section = 'connection' | 'prompts' | 'tagging' | 'storage';

const errorMessage = (error: unknown) => (error instanceof LlmError ? error.message : String(error));

export function SettingsDialog({ opened, onClose }: SettingsDialogProps) {
  const stored = useSettings();
  const [draft, setDraft] = useState<LlmSettings>(DEFAULT_SETTINGS.llm);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [section, setSection] = useState<Section>('connection');

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

  const testMutation = useMutation({
    mutationFn: (llm: LlmSettings) => listModels(llm),
    onSuccess: (models) => setTest({ status: 'ok', models }),
    onError: (error) => setTest({ status: 'error', message: errorMessage(error) }),
  });

  const testConnection = async () => {
    // The permission request must start inside the click handler (user gesture), before any await.
    const permission = requestLlmPermission(draft.baseUrl);
    setTest({ status: 'testing' });
    try {
      if (!(await permission)) throw new LlmError(`Permission to access ${draft.baseUrl} was denied.`);
    } catch (error) {
      setTest({ status: 'error', message: errorMessage(error) });
      return;
    }
    testMutation.mutate(draft);
  };

  const dirty = Boolean(stored) && JSON.stringify(stored?.llm) !== JSON.stringify(draft);
  const invalid = Boolean(templateError(draft.summaryPrompt) ?? templateError(draft.questionPrompt));

  const save = async () => {
    await saveSettings({ llm: draft });
    notifications.show({ color: 'teal', message: 'Settings saved.' });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={600} size="lg">
          Settings
        </Text>
      }
      size={920}
      centered
      padding="lg"
    >
      <Tabs
        value={section}
        onChange={(value) => value && setSection(value as Section)}
        orientation="vertical"
        variant="pills"
        radius="md"
        className="rt-settings-tabs"
      >
        <Tabs.List>
          <Tabs.Tab value="connection" leftSection={<IconServer size={16} />}>
            LLM server
          </Tabs.Tab>
          <Tabs.Tab value="prompts" leftSection={<IconSparkles size={16} />}>
            Prompts
          </Tabs.Tab>
          <Tabs.Tab value="tagging" leftSection={<IconTags size={16} />}>
            Tagging
          </Tabs.Tab>
          <Tabs.Tab value="storage" leftSection={<IconDatabase size={16} />}>
            Storage
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="connection">
          <SectionHeader
            title="LLM server"
            description="Summaries, answers and tags use a local LLM through an OpenAI-compatible API (for example LM Studio). The transcript is sent only to this server."
          />
          <Stack gap="md">
            <TextInput
              label="Server address"
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
              rightSectionWidth={130}
              rightSection={
                <Button
                  variant="light"
                  size="compact-xs"
                  leftSection={<IconPlugConnected size={14} />}
                  loading={test.status === 'testing'}
                  onClick={() => void testConnection()}
                >
                  Test & list
                </Button>
              }
            />
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
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="prompts">
          <SectionHeader
            title="Prompts"
            description="Templates of the requests sent to the model, in Mustache syntax (the core of Handlebars). Click a field to insert it at the cursor. Highlighted fields are used."
          />
          <Text size="xs" c="dimmed" mt={-8} mb="md">
            <Code>{'{{title}}'}</Code> inserts a value · <Code>{'{{#questions}}…{{/questions}}'}</Code> repeats for each
            entry, or shows once if a text is not empty · <Code>{'{{^summary}}…{{/summary}}'}</Code> shows when empty.
          </Text>
          <Stack gap="lg">
            <PromptEditor
              icon={<IconSparkles size={16} />}
              label="Summary prompt"
              value={draft.summaryPrompt}
              defaultValue={DEFAULT_SETTINGS.llm.summaryPrompt}
              kind="summary"
              expected={['transcript']}
              onChange={(summaryPrompt) => update({ summaryPrompt })}
            />
            <PromptEditor
              icon={<IconMessageQuestion size={16} />}
              label="Question prompt"
              value={draft.questionPrompt}
              defaultValue={DEFAULT_SETTINGS.llm.questionPrompt}
              kind="question"
              expected={['transcript', 'question']}
              onChange={(questionPrompt) => update({ questionPrompt })}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="tagging">
          <SectionHeader title="Tagging" description="How items get their tags." />
          <Paper withBorder radius="md" p="md">
            <Switch
              size="md"
              label="Use LLM for tagging"
              description="Generates tags for items in the background while the dashboard is open. Items show keyword-extraction tags until then, and when the LLM is not reachable."
              checked={draft.useForTags}
              onChange={(event) => update({ useForTags: event.currentTarget.checked })}
            />
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="storage">
          <SectionHeader
            title="Storage"
            description="Everything is stored on this computer in the browser's extension storage (chrome.storage.local): your transcripts, summaries, questions, tags and small video thumbnails. Nothing is uploaded. Space is not limited."
          />
          <Paper withBorder radius="md" p="md">
            <Group justify="space-between" wrap="wrap" gap="sm">
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Used now
                </Text>
                <Text size="xl" fw={600} className="rt-tabular">
                  {usage ? formatMb(usage.bytes) : '…'}
                </Text>
              </Stack>
              {usage !== null && usage.missing > 0 && (
                <Button variant="light" size="xs" loading={downloading} onClick={downloadThumbnails}>
                  Download {usage.missing} missing thumbnail{usage.missing === 1 ? '' : 's'}
                </Button>
              )}
            </Group>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      <Divider my="md" />
      <Group justify="space-between">
        <Text size="xs" c={invalid ? 'red' : dirty ? 'orange' : 'dimmed'}>
          {invalid ? 'Fix the prompt template error to save.' : dirty ? 'You have unsaved changes.' : 'No changes.'}
        </Text>
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!stored || !dirty || invalid}>
            Save
          </Button>
        </Group>
      </Group>
    </Modal>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <Stack gap={4} mb="lg">
      <Title order={4}>{title}</Title>
      <Text size="sm" c="dimmed">
        {description}
      </Text>
    </Stack>
  );
}

/** The syntax error of a template, or undefined when it is valid. */
function templateError(template: string): string | undefined {
  try {
    validateTemplate(template);
    return undefined;
  } catch (error) {
    return error instanceof PromptTemplateError ? error.message : String(error);
  }
}

interface PromptEditorProps {
  icon: ReactNode;
  label: string;
  kind: PromptKind;
  value: string;
  defaultValue: string;
  /** Fields the template should use; a warning shows when it does not. */
  expected: PromptField[];
  onChange: (value: string) => void;
}

function PromptEditor({ icon, label, kind, value, defaultValue, expected, onChange }: PromptEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const error = templateError(value);
  const used = error ? undefined : templateFields(value);
  const legacy = used?.size === 0;
  const missing = used && !legacy ? expected.filter((name) => !used.has(name)) : [];
  const fields = PROMPT_FIELDS.filter((field) => field.kinds.includes(kind));

  const insert = (snippet: string) => {
    const textarea = ref.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + snippet + value.slice(end));
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            {icon}
            <Text fw={600} size="sm">
              {label}
            </Text>
          </Group>
          {value !== defaultValue && (
            <Anchor component="button" type="button" size="xs" onClick={() => onChange(defaultValue)}>
              Reset to default
            </Anchor>
          )}
        </Group>
        <Textarea
          ref={ref}
          aria-label={label}
          className="rt-prompt-editor"
          autosize
          minRows={6}
          maxRows={16}
          value={value}
          error={error && `Template error: ${error}`}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            Insert:
          </Text>
          {fields.map((field) => (
            <Tooltip key={field.name} label={field.description} withArrow multiline maw={280}>
              <Badge
                component="button"
                type="button"
                variant={used?.has(field.name) ? 'filled' : 'light'}
                color="violet"
                radius="sm"
                className="rt-prompt-field"
                onClick={() => insert(field.snippet)}
              >
                {field.name}
              </Badge>
            </Tooltip>
          ))}
        </Group>
        {legacy && (
          <Alert color="blue" variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>
            <Text size="xs">
              The template uses no fields, so the title and the transcript
              {kind === 'question' ? ' and the question are' : ' are'} added at the end of the request.
            </Text>
          </Alert>
        )}
        {missing.length > 0 && (
          <Alert color="yellow" variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>
            <Text size="xs">
              The template does not use {missing.map((name) => `{{${name}}}`).join(' or ')}, so the model does not get
              it.
            </Text>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
