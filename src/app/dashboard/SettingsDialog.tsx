import { Button, Modal, Switch, TextInput, useMantineColorScheme } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheck,
  IconDatabase,
  IconMessageQuestion,
  IconPlugConnected,
  IconServer,
  IconSparkles,
  IconSun,
  IconTags,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { listModels, LlmError, requestLlmPermission } from '../../llm';
import type { PromptField, PromptKind } from '../../shared/promptModel';
import { DEFAULT_SETTINGS, LLM_TIMEOUT_CHOICES, saveSettings, type LlmSettings } from '../../shared/settings';
import { getAllItems } from '../../shared/storage';
import { backfillThumbnails, countMissingThumbnails } from '../../shared/thumbnail';
import type { SavedItem } from '../../shared/types';
import { formatNumber } from '../ui/format';
import type { SettingsSection } from './AiStatus';
import { PromptEditor, templateError } from './settings/PromptEditor';
import type { AiConnection } from './useAiConnection';
import { useSettings } from './useSettings';

/** Local storage key of the compact list setting (per browser, like the theme). */
export const COMPACT_LIST_KEY = 'rt-compact-list';

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;

interface SettingsDialogProps {
  opened: boolean;
  onClose: () => void;
  /** The section to show. Without it, the dialog keeps its own, starting on the AI server. */
  section?: SettingsSection;
  onSectionChange?: (section: SettingsSection) => void;
  /** The connection state the header knows, shown next to the stored server address. */
  connection?: AiConnection;
  /** The item the prompt preview fills in. */
  previewItem?: SavedItem;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; models: string[]; latencyMs: number; baseUrl: string }
  | { status: 'error'; message: string };

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: 'server', label: 'AI server', icon: <IconServer /> },
  { id: 'prompts', label: 'Prompts', icon: <IconSparkles /> },
  { id: 'tagging', label: 'Tagging', icon: <IconTags /> },
  { id: 'appearance', label: 'Appearance', icon: <IconSun /> },
  { id: 'storage', label: 'Storage', icon: <IconDatabase /> },
];

interface PromptInfo {
  kind: PromptKind;
  key: 'summaryPrompt' | 'questionPrompt';
  label: string;
  title: string;
  usedBy: string;
  icon: ReactNode;
  expected: PromptField[];
}

const PROMPTS: PromptInfo[] = [
  {
    kind: 'summary',
    key: 'summaryPrompt',
    label: 'Summary prompt',
    title: 'Summary',
    usedBy: 'Summary',
    icon: <IconSparkles size={16} />,
    expected: ['transcript'],
  },
  {
    kind: 'question',
    key: 'questionPrompt',
    label: 'Question prompt',
    title: 'Question',
    usedBy: 'Questions',
    icon: <IconMessageQuestion size={16} />,
    expected: ['transcript', 'question'],
  },
];

const errorMessage = (error: unknown) => (error instanceof LlmError ? error.message : String(error));

/** Names of the parts of the settings that differ, for the footer. */
function changedParts(stored: LlmSettings, draft: LlmSettings): string[] {
  const parts: string[] = [];
  if (stored.baseUrl !== draft.baseUrl || stored.model !== draft.model || stored.timeoutMs !== draft.timeoutMs)
    parts.push('AI server');
  for (const prompt of PROMPTS) if (stored[prompt.key] !== draft[prompt.key]) parts.push(prompt.label);
  if (stored.useForTags !== draft.useForTags) parts.push('Tagging');
  return parts;
}

export function SettingsDialog({
  opened,
  onClose,
  section: controlledSection,
  onSectionChange,
  connection,
  previewItem,
}: SettingsDialogProps) {
  const stored = useSettings();
  const [draft, setDraft] = useState<LlmSettings>(DEFAULT_SETTINGS.llm);
  const [ownSection, setOwnSection] = useState<SettingsSection>('server');
  const section = controlledSection ?? ownSection;
  const setSection = (next: SettingsSection) => {
    setOwnSection(next);
    onSectionChange?.(next);
  };

  // Start from the stored values each time the dialog opens.
  useEffect(() => {
    if (opened && stored) setDraft(stored.llm);
  }, [opened, stored]);

  const update = (patch: Partial<LlmSettings>) => setDraft((previous) => ({ ...previous, ...patch }));

  const changed = stored ? changedParts(stored.llm, draft) : [];
  const dirty = changed.length > 0;
  const invalidPrompt = PROMPTS.find((prompt) => templateError(draft[prompt.key]));

  const save = async () => {
    if (!stored || !dirty || invalidPrompt) return;
    await saveSettings({ llm: draft });
    notifications.show({ color: 'teal', message: 'Settings saved.' });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Settings"
      size={1040}
      centered
      padding={0}
      classNames={{ content: 'rt-settings-modal' }}
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <div
        className="rt-settings"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            void save();
          }
        }}
      >
        <nav className="rt-m-nav" role="tablist" aria-orientation="vertical" aria-label="Settings sections">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={section === entry.id}
              data-active={section === entry.id || undefined}
              className="rt-nav"
              onClick={() => setSection(entry.id)}
            >
              {entry.icon}
              <span className="rt-nav-label">{entry.label}</span>
            </button>
          ))}
        </nav>

        <div className="rt-m-main" role="tabpanel">
          {section === 'server' && (
            <ServerPane draft={draft} stored={stored?.llm} update={update} connection={connection} opened={opened} />
          )}
          {section === 'prompts' && <PromptsPane draft={draft} update={update} previewItem={previewItem} />}
          {section === 'tagging' && <TaggingPane draft={draft} update={update} />}
          {section === 'appearance' && <AppearancePane />}
          {section === 'storage' && <StoragePane opened={opened} />}
        </div>

        <div className="rt-m-foot">
          {invalidPrompt ? (
            <span className="rt-m-foot-msg" data-tone="err">
              <IconAlertCircle size={16} />
              Fix the template error in the {invalidPrompt.label.toLowerCase()} to save.
            </span>
          ) : dirty ? (
            <span className="rt-m-foot-msg" data-tone="warn">
              <IconAlertTriangle size={16} />
              Unsaved changes in {changed.join(', ')}
            </span>
          ) : (
            <span className="rt-m-foot-msg">No changes.</span>
          )}
          <span className="rt-m-foot-acts">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void save()}
              disabled={!stored || !dirty || Boolean(invalidPrompt)}
              aria-keyshortcuts="Meta+S Control+S"
              rightSection={
                <kbd className="rt-kbd-inv" aria-hidden>
                  ⌘S
                </kbd>
              }
            >
              Save
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

function PaneHead({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h3 className="rt-pane-title">{title}</h3>
      <p className="rt-pane-desc">{description}</p>
    </>
  );
}

interface DraftProps {
  draft: LlmSettings;
  update: (patch: Partial<LlmSettings>) => void;
}

function ServerPane({
  draft,
  stored,
  update,
  connection,
  opened,
}: DraftProps & { stored: LlmSettings | undefined; connection: AiConnection | undefined; opened: boolean }) {
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  useEffect(() => {
    if (opened) setTest({ status: 'idle' });
  }, [opened]);

  const testMutation = useMutation({
    mutationFn: async (llm: LlmSettings) => {
      const started = performance.now();
      const models = await listModels(llm);
      return { models, latencyMs: Math.round(performance.now() - started), baseUrl: llm.baseUrl };
    },
    onSuccess: (result) => setTest({ status: 'ok', ...result }),
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

  // What is known about the address in the field: a test of it, or the header's check of the stored one.
  const tested = test.status === 'ok' && test.baseUrl === draft.baseUrl ? test : undefined;
  const known = !tested && stored?.baseUrl === draft.baseUrl ? connection : undefined;
  const status = tested
    ? { tone: 'ok', text: `connected · ${tested.latencyMs} ms` }
    : known?.status === 'ok'
      ? { tone: 'ok', text: `connected · ${known.latencyMs} ms` }
      : known?.status === 'offline'
        ? { tone: 'err', text: 'not reachable' }
        : known?.status === 'off'
          ? { tone: 'off', text: 'not allowed yet' }
          : undefined;
  const models = tested?.models ?? (known?.status === 'ok' ? known.models : []);

  return (
    <>
      <PaneHead
        title="AI server"
        description="Summaries, sentiment, answers and tags use a local LLM through an OpenAI-compatible API (for example LM Studio). The transcript is sent only to this server."
      />
      <div className="rt-form">
        <TextInput
          label="Server address"
          description="LM Studio: Developer → Start server. Use the address of the computer that runs it."
          placeholder={DEFAULT_SETTINGS.llm.baseUrl}
          value={draft.baseUrl}
          classNames={{ input: 'rt-mono-input' }}
          onChange={(event) => update({ baseUrl: event.currentTarget.value })}
          rightSectionWidth={status ? 176 : undefined}
          rightSection={
            status && (
              <span className="rt-input-status" data-tone={status.tone}>
                <span className="rt-dot" data-state={status.tone} />
                {status.text}
              </span>
            )
          }
        />
        <div>
          <TextInput
            label="Model"
            description="Empty = the model the server has loaded. Click one to choose it."
            placeholder="Loaded model"
            value={draft.model}
            classNames={{ input: 'rt-mono-input' }}
            onChange={(event) => update({ model: event.currentTarget.value })}
            rightSectionWidth={112}
            rightSection={
              <Button
                variant="default"
                size="compact-sm"
                leftSection={<IconPlugConnected size={14} />}
                loading={test.status === 'testing'}
                onClick={() => void testConnection()}
              >
                Test & list
              </Button>
            }
          />
          {models.length > 0 && (
            <div className="rt-models" role="list" aria-label="Available models">
              {models.map((model) => (
                <button
                  key={model}
                  type="button"
                  role="listitem"
                  data-active={draft.model === model || undefined}
                  onClick={() => update({ model: draft.model === model ? '' : model })}
                >
                  {model}
                </button>
              ))}
            </div>
          )}
          {tested && (
            <p className="rt-form-note" data-tone="ok">
              <IconCheck size={14} />
              <span>Connected</span>
              <span>
                {tested.models.length === 0 ? 'The server has no models available.' : '· click a model to choose it.'}
              </span>
            </p>
          )}
          {test.status === 'error' && (
            <div className="rt-alert" data-tone="err">
              <IconAlertCircle size={16} />
              <div>
                <b>Connection failed</b>
                <p>{test.message}</p>
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="rt-form-label" id="rt-timeout-label">
            Request timeout
          </label>
          <p className="rt-form-hint">
            How long to wait for one answer. Long transcripts on a slow computer need more.
          </p>
          <div className="rt-seg" role="radiogroup" aria-labelledby="rt-timeout-label">
            {LLM_TIMEOUT_CHOICES.map((ms) => (
              <button
                key={ms}
                type="button"
                role="radio"
                aria-checked={draft.timeoutMs === ms}
                data-active={draft.timeoutMs === ms || undefined}
                onClick={() => update({ timeoutMs: ms })}
              >
                {ms / 60_000} min
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function PromptsPane({ draft, update, previewItem }: DraftProps & { previewItem: SavedItem | undefined }) {
  const [kind, setKind] = useState<PromptKind>('summary');
  const prompt = PROMPTS.find((entry) => entry.kind === kind)!;
  const defaults = DEFAULT_SETTINGS.llm;

  return (
    <>
      <PaneHead
        title="Prompts"
        description="Templates of the requests sent to the model, in Mustache syntax. Click a field on the right to insert it at the cursor."
      />
      <div className="rt-prompt-tabs" role="tablist" aria-label="Prompt">
        {PROMPTS.map((entry) => {
          const value = draft[entry.key];
          const error = templateError(value);
          const note = error
            ? 'has an error'
            : value === defaults[entry.key]
              ? 'default'
              : value.trim() === ''
                ? 'empty'
                : 'edited';
          return (
            <button
              key={entry.kind}
              type="button"
              role="tab"
              aria-selected={kind === entry.kind}
              data-active={kind === entry.kind || undefined}
              data-error={error ? true : undefined}
              className="rt-ptab"
              onClick={() => setKind(entry.kind)}
            >
              <b>
                {entry.icon}
                {entry.title}
              </b>
              <small>
                Used by {entry.usedBy} · {note}
              </small>
            </button>
          );
        })}
      </div>
      <PromptEditor
        key={prompt.kind}
        kind={prompt.kind}
        label={prompt.label}
        value={draft[prompt.key]}
        defaultValue={defaults[prompt.key]}
        expected={prompt.expected}
        previewItem={previewItem}
        onChange={(value) => update({ [prompt.key]: value })}
      />
    </>
  );
}

function TaggingPane({ draft, update }: DraftProps) {
  return (
    <>
      <PaneHead title="Tagging" description="How items get their topic tags." />
      <div className="rt-card-box">
        <div>
          <b id="rt-use-llm-tags">Use the LLM for tagging</b>
          <small>
            Generates tags in the background while the dashboard is open. Until then, and when the LLM is unreachable,
            items show keyword-extraction tags.
          </small>
        </div>
        <Switch
          aria-labelledby="rt-use-llm-tags"
          checked={draft.useForTags}
          onChange={(event) => update({ useForTags: event.currentTarget.checked })}
        />
      </div>
    </>
  );
}

const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'auto', label: 'System' },
] as const;

function AppearancePane() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [compact, setCompact] = useLocalStorage({ key: COMPACT_LIST_KEY, defaultValue: false });
  return (
    <>
      <PaneHead
        title="Appearance"
        description="Applies right away, to the dashboard and the popup. The sun / moon button in the header switches between light and dark directly."
      />
      <div className="rt-theme-cards" role="radiogroup" aria-label="Theme">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={colorScheme === theme.id}
            data-active={colorScheme === theme.id || undefined}
            className="rt-tcard"
            onClick={() => setColorScheme(theme.id)}
          >
            <span className="rt-tcard-pv" data-theme={theme.id}>
              <i />
            </span>
            <span className="rt-tcard-n">
              {theme.label}
              {colorScheme === theme.id && <IconCheck size={16} />}
            </span>
          </button>
        ))}
      </div>
      <div className="rt-card-box rt-gap-top">
        <div>
          <b id="rt-compact-list">Compact list</b>
          <small>Smaller rows without tags and excerpts, for large libraries.</small>
        </div>
        <Switch
          aria-labelledby="rt-compact-list"
          checked={compact}
          onChange={(event) => setCompact(event.currentTarget.checked)}
        />
      </div>
    </>
  );
}

interface Usage {
  bytes: number;
  items: number;
  thumbnails: number;
  missing: number;
}

function StoragePane({ opened }: { opened: boolean }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [downloading, setDownloading] = useState(false);

  const refresh = () =>
    Promise.all([chrome.storage.local.getBytesInUse(null), getAllItems(), countMissingThumbnails()]).then(
      ([bytes, items, missing]) =>
        setUsage({
          bytes,
          items: items.length,
          thumbnails: items.filter((item) => item.meta?.thumbnail).length,
          missing,
        }),
    );

  useEffect(() => {
    if (opened) void refresh();
  }, [opened]);

  const download = async () => {
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
      await refresh();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PaneHead
        title="Storage"
        description="Everything is stored on this computer in the browser's extension storage: transcripts, summaries, questions, tags and small video thumbnails. Nothing is uploaded. Space is not limited."
      />
      <div className="rt-card-box">
        <div>
          <span className="rt-label">Used now</span>
          <div className="rt-big">{usage ? formatMb(usage.bytes) : '…'}</div>
          {usage && (
            <small>
              {plural(usage.items, 'item')} · {plural(usage.thumbnails, 'thumbnail')}
            </small>
          )}
        </div>
        {usage !== null && usage.missing > 0 && (
          <Button variant="default" size="compact-sm" loading={downloading} onClick={() => void download()}>
            Download {usage.missing} missing thumbnail{usage.missing === 1 ? '' : 's'}
          </Button>
        )}
      </div>
    </>
  );
}
