/** Settings of the local LLM integration (an OpenAI-compatible server such as LM Studio). */
export interface LlmSettings {
  /** Server address, for example `http://192.168.1.220:1234`. */
  baseUrl: string;
  /** Model identifier. Empty means the model that the server has loaded. */
  model: string;
  /** Template of the summary request. Mustache syntax; the fields are `PromptModel`. */
  summaryPrompt: string;
  /** Template of the request that answers a user question. Mustache syntax; the fields are `PromptModel`. */
  questionPrompt: string;
  /** Generate item tags with the LLM in the background. Keyword extraction is the fallback. */
  useForTags: boolean;
}

export interface Settings {
  llm: LlmSettings;
}

/** Storage key of the settings. It has no `item:` prefix, so library operations do not touch it. */
export const SETTINGS_KEY = 'settings';

/** The summary prompt before templates. A stored copy of it is replaced by the current default. */
export const LEGACY_SUMMARY_PROMPT =
  'Summarize this YouTube transcript. Start with main statement or idea in this transcript. ' +
  'Then write 3-8 sentences that summarizes transcript.';

// Both prompts start with the transcript, so a local server can reuse its prompt cache between them.
export const DEFAULT_SUMMARY_PROMPT = `Transcript:
{{transcript}}

Title: {{title}}
{{#channel}}
Channel: {{channel}}
{{/channel}}

Task:
Summarize this transcript. Start with the main statement or idea of the transcript. Then write 3-8 sentences that summarize the transcript.`;

export const DEFAULT_QUESTION_PROMPT = `Transcript:
{{transcript}}

Task:
Carefully read the provided transcript and answer this question exactly as the transcript author tries to answer it in the transcript.
Question: {{question}}

Do not use predefined knowledge; answer this question as the transcript author would answer it. The transcript author could be wrong or have their own opinion - respect that opinion.`;

export const DEFAULT_SETTINGS: Settings = {
  llm: {
    baseUrl: 'http://192.168.1.220:1234',
    model: '',
    summaryPrompt: DEFAULT_SUMMARY_PROMPT,
    questionPrompt: DEFAULT_QUESTION_PROMPT,
    useForTags: true,
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Fills missing or invalid values of stored settings with the defaults. */
export function normalizeSettings(value: unknown): Settings {
  const llm = isRecord(value) && isRecord(value.llm) ? value.llm : {};
  const text = (key: 'baseUrl' | 'model' | 'summaryPrompt' | 'questionPrompt', allowEmpty: boolean) => {
    const raw = llm[key];
    return typeof raw === 'string' && (allowEmpty || raw.trim() !== '') ? raw : DEFAULT_SETTINGS.llm[key];
  };
  return {
    llm: {
      baseUrl: text('baseUrl', false).trim(),
      model: text('model', true).trim(),
      summaryPrompt:
        llm.summaryPrompt === LEGACY_SUMMARY_PROMPT ? DEFAULT_SUMMARY_PROMPT : text('summaryPrompt', false),
      questionPrompt: text('questionPrompt', false),
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
