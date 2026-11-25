// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from '../../../llm';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../../shared/settings';
import { installDashboardEnvironment, makeItem, renderApp } from '../../test/render';
import { SettingsDialog } from '../SettingsDialog';

const llm = vi.hoisted(() => ({
  listModels: vi.fn(),
  requestLlmPermission: vi.fn(),
}));
vi.mock('../../../llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../llm')>()),
  ...llm,
}));

const thumbnails = vi.hoisted(() => ({ backfillThumbnails: vi.fn() }));
vi.mock('../../../shared/thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shared/thumbnail')>()),
  ...thumbnails,
}));

type Fake = ReturnType<typeof installDashboardEnvironment>;
let fake: Fake;

const storedLlm = () => (fake.storage.local.store.get(SETTINGS_KEY) as { llm: typeof DEFAULT_SETTINGS.llm }).llm;

async function openDialog(stored?: Partial<typeof DEFAULT_SETTINGS.llm>) {
  fake = installDashboardEnvironment();
  if (stored) fake.storage.local.store.set(SETTINGS_KEY, { llm: { ...DEFAULT_SETTINGS.llm, ...stored } });
  const onClose = vi.fn();
  const view = renderApp(<SettingsDialog opened onClose={onClose} />);
  const dialog = await screen.findByRole('dialog');
  // Wait until the stored settings are loaded into the form.
  await waitFor(() =>
    expect(within(dialog).getByLabelText('Server address')).toHaveValue(
      stored?.baseUrl ?? DEFAULT_SETTINGS.llm.baseUrl,
    ),
  );
  return { ...view, onClose, dialog };
}

const saveButton = () => screen.getByRole('button', { name: 'Save' });

describe('Settings dialog', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    llm.listModels.mockReset();
    llm.requestLlmPermission.mockReset().mockResolvedValue(true);
    thumbnails.backfillThumbnails.mockReset();
  });

  it('opens on the LLM server section with the stored values', async () => {
    await openDialog({ baseUrl: 'http://10.0.0.5:1234', model: 'qwen-7b' });
    expect(screen.getByLabelText('Server address')).toHaveValue('http://10.0.0.5:1234');
    expect(screen.getByLabelText('Model')).toHaveValue('qwen-7b');
    expect(screen.getByText('No changes.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('falls back to the defaults when nothing is stored', async () => {
    await openDialog();
    expect(screen.getByLabelText('Server address')).toHaveValue(DEFAULT_SETTINGS.llm.baseUrl);
    expect(screen.getByLabelText('Model')).toHaveValue('');
  });

  it('enables Save after an edit and saves to storage', async () => {
    const { user, onClose } = await openDialog();
    const address = screen.getByLabelText('Server address');
    await user.clear(address);
    await user.type(address, 'http://localhost:1234');

    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(storedLlm().baseUrl).toBe('http://localhost:1234');
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
  });

  it('discards edits on Cancel', async () => {
    const { user, onClose } = await openDialog();
    await user.type(screen.getByLabelText('Model'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fake.storage.local.set).not.toHaveBeenCalled();
  });

  it('switches between sections', async () => {
    const { user } = await openDialog();
    await user.click(screen.getByRole('tab', { name: 'Prompts' }));
    expect(screen.getByRole('textbox', { name: 'Summary prompt' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Question prompt' })).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Tagging' }));
    expect(screen.getByRole('switch', { name: /Use LLM for tagging/ })).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Storage' }));
    expect(screen.getByText('Used now')).toBeVisible();
  });

  describe('connection test', () => {
    it('lists the models and selects one by click', async () => {
      llm.listModels.mockResolvedValue(['llama-3', 'qwen-7b']);
      const { user } = await openDialog();

      await user.click(screen.getByRole('button', { name: /Test & list/ }));
      expect(await screen.findByText('Connected')).toBeInTheDocument();
      expect(llm.requestLlmPermission).toHaveBeenCalledWith(DEFAULT_SETTINGS.llm.baseUrl);

      await user.click(screen.getByText('qwen-7b'));
      expect(screen.getByLabelText('Model')).toHaveValue('qwen-7b');
      await user.click(saveButton());
      await waitFor(() => expect(storedLlm().model).toBe('qwen-7b'));
    });

    it('tells when the server has no models', async () => {
      llm.listModels.mockResolvedValue([]);
      const { user } = await openDialog();
      await user.click(screen.getByRole('button', { name: /Test & list/ }));
      expect(await screen.findByText('The server has no models available.')).toBeInTheDocument();
    });

    it('shows the error when the server is unreachable', async () => {
      llm.listModels.mockRejectedValue(new LlmError('Cannot reach the server.'));
      const { user } = await openDialog();
      await user.click(screen.getByRole('button', { name: /Test & list/ }));
      expect(await screen.findByText('Connection failed')).toBeInTheDocument();
      expect(screen.getByText('Cannot reach the server.')).toBeInTheDocument();
    });

    it('does not contact the server when permission is denied', async () => {
      llm.requestLlmPermission.mockResolvedValue(false);
      const { user } = await openDialog();
      await user.click(screen.getByRole('button', { name: /Test & list/ }));
      expect(await screen.findByText(/Permission to access .* was denied/)).toBeInTheDocument();
      expect(llm.listModels).not.toHaveBeenCalled();
    });
  });

  describe('connection test with a bad address', () => {
    it('explains that the address is not valid, without calling the server', async () => {
      llm.requestLlmPermission.mockImplementation(() =>
        Promise.reject(new LlmError('"nonsense" is not a valid server address.')),
      );
      const { user } = await openDialog();
      const address = screen.getByLabelText('Server address');
      await user.clear(address);
      await user.type(address, 'nonsense');
      await user.click(screen.getByRole('button', { name: /Test & list/ }));
      expect(await screen.findByText('Connection failed')).toBeInTheDocument();
      expect(screen.getByText(/is not a valid server address/)).toBeInTheDocument();
      expect(llm.listModels).not.toHaveBeenCalled();
    });
  });

  it('starts from the stored values again when it is opened again', async () => {
    fake = installDashboardEnvironment();
    const view = renderApp(<SettingsDialog opened onClose={() => {}} />);
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue(''));
    await view.user.type(screen.getByLabelText('Model'), 'draft-model');

    view.rerender(<SettingsDialog opened={false} onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.rerender(<SettingsDialog opened onClose={() => {}} />);
    expect(await screen.findByLabelText('Model')).toHaveValue('');
  });

  describe('prompts', () => {
    const openPrompts = async () => {
      const opened = await openDialog();
      await opened.user.click(screen.getByRole('tab', { name: 'Prompts' }));
      return opened;
    };

    it('blocks saving a template with a syntax error', async () => {
      const { user } = await openPrompts();
      const summary = screen.getByRole('textbox', { name: 'Summary prompt' });
      await user.clear(summary);
      await user.click(summary);
      await user.paste('{{#channel}} never closed {{transcript}}');

      expect(await screen.findByText(/Template error/)).toBeInTheDocument();
      expect(screen.getByText('Fix the prompt template error to save.')).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('warns when a template leaves out the transcript', async () => {
      const { user } = await openPrompts();
      const summary = screen.getByRole('textbox', { name: 'Summary prompt' });
      await user.clear(summary);
      await user.click(summary);
      await user.paste('Summarize {{title}} please');

      expect(await screen.findByText(/does not use \{\{transcript\}\}/)).toBeInTheDocument();
      // A warning is not an error: the template can still be saved.
      expect(saveButton()).toBeEnabled();
    });

    it('explains the legacy template that uses no fields', async () => {
      const { user } = await openPrompts();
      const summary = screen.getByRole('textbox', { name: 'Summary prompt' });
      await user.clear(summary);
      await user.click(summary);
      await user.paste('Just summarize it.');
      expect(await screen.findByText(/uses no fields/)).toBeInTheDocument();
    });

    it('inserts a field when its badge is clicked', async () => {
      const { user } = await openPrompts();
      const summary = screen.getByRole('textbox', { name: 'Summary prompt' });
      await user.clear(summary);
      await user.click(screen.getAllByRole('button', { name: 'title' })[0]!);
      expect(summary).toHaveValue('{{title}}');
    });

    it('resets a changed prompt to its default', async () => {
      const { user } = await openPrompts();
      const summary = screen.getByRole('textbox', { name: 'Summary prompt' });
      expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument();

      await user.clear(summary);
      await user.click(summary);
      await user.paste('{{transcript}} short');
      await user.click(screen.getByRole('button', { name: 'Reset to default' }));
      expect(summary).toHaveValue(DEFAULT_SETTINGS.llm.summaryPrompt);
      expect(screen.getByText('No changes.')).toBeInTheDocument();
    });
  });

  it('saves the tagging switch', async () => {
    const { user } = await openDialog({ useForTags: true });
    await user.click(screen.getByRole('tab', { name: 'Tagging' }));
    const toggle = screen.getByRole('switch', { name: /Use LLM for tagging/ });
    expect(toggle).toBeChecked();

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await user.click(saveButton());
    await waitFor(() => expect(storedLlm().useForTags).toBe(false));
  });

  describe('storage', () => {
    it('shows the space in use', async () => {
      const { user } = await openDialog();
      await user.click(screen.getByRole('tab', { name: 'Storage' }));
      expect(await screen.findByText('2.00 MB')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /missing thumbnail/ })).not.toBeInTheDocument();
    });

    it('downloads missing thumbnails and reports the result', async () => {
      const { user } = await (async () => {
        fake = installDashboardEnvironment();
        for (const id of ['v1', 'v2']) {
          const item = makeItem({ id, type: 'youtube_transcript', meta: { videoId: id.padEnd(11, 'x') } });
          fake.storage.local.store.set(`item:${id}`, item);
        }
        thumbnails.backfillThumbnails.mockResolvedValue({ saved: 2, failed: 0 });
        const view = renderApp(<SettingsDialog opened onClose={() => {}} />);
        await screen.findByRole('dialog');
        return view;
      })();
      await user.click(screen.getByRole('tab', { name: 'Storage' }));

      await user.click(await screen.findByRole('button', { name: 'Download 2 missing thumbnails' }));
      expect(thumbnails.backfillThumbnails).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Saved 2 thumbnails.')).toBeInTheDocument();
    });
  });
});
