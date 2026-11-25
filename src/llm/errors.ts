export class LlmError extends Error {}

/** The message of any thrown value. */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
