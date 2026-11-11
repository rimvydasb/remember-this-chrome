/** Settings of the local LLM integration (an OpenAI-compatible server such as LM Studio). */
export interface LlmSettings {
  /** Server address, for example `http://192.168.1.220:1234`. */
  baseUrl: string;
  /** Model identifier. Empty means the model that the server has loaded. */
  model: string;
  /** Instruction sent to the model together with the transcript. */
  summaryPrompt: string;
  /** Generate item tags with the LLM in the background. Keyword extraction is the fallback. */
  useForTags: boolean;
}

export interface Settings {
  llm: LlmSettings;
}

/** Storage key of the settings. It has no `item:` prefix, so library operations do not touch it. */
export const SETTINGS_KEY = 'settings';

export const DEFAULT_SUMMARY_PROMPT =
  'Summarize this YouTube transcript. Start with main statement or idea in this transcript. ' +
  'Then write 3-8 sentences that summarizes transcript.';

export const DEFAULT_SETTINGS: Settings = {
  llm: {
    baseUrl: 'http://192.168.1.220:1234',
    model: '',
    summaryPrompt: DEFAULT_SUMMARY_PROMPT,
    useForTags: true,
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Fills missing or invalid values of stored settings with the defaults. */
export function normalizeSettings(value: unknown): Settings {
  const llm = isRecord(value) && isRecord(value.llm) ? value.llm : {};
  const text = (key: 'baseUrl' | 'model' | 'summaryPrompt', allowEmpty: boolean) => {
    const raw = llm[key];
    return typeof raw === 'string' && (allowEmpty || raw.trim() !== '') ? raw : DEFAULT_SETTINGS.llm[key];
  };
  return {
    llm: {
      baseUrl: text('baseUrl', false).trim(),
      model: text('model', true).trim(),
      summaryPrompt: text('summaryPrompt', false),
      useForTags: typeof llm.useForTags === 'boolean' ? llm.useForTags : DEFAULT_SETTINGS.llm.useForTags,
    },
  };
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(result[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}
